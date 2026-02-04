package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

var (
	jwtSecret     = []byte(os.Getenv("JWT_SECRET"))
	encryptionKey = []byte(os.Getenv("ENCRYPTION_KEY"))
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type Backup struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Name           string    `json:"name"`
	Source         string    `json:"source"`
	Size           int64     `json:"size"`
	Timestamp      time.Time `json:"timestamp"`
	ContentPreview string    `json:"content_preview"`
	EncryptedData  string    `json:"encrypted_data"`
}

type Project struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	BackupID    string    `json:"backup_id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Description string    `json:"description"`
	Source      string    `json:"source"`
	Language    string    `json:"language"`
	LinesOfCode int       `json:"lines_of_code"`
	Features    []string  `json:"features"`
	Code        string    `json:"code"`
	Timestamp   time.Time `json:"timestamp"`
	Tags        []string  `json:"tags"`
	Starred     bool      `json:"starred"`
}

type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// Encryption functions
func encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decrypt(ciphertext string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

// JWT Middleware
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization required", http.StatusUnauthorized)
			return
		}

		tokenString := strings.Replace(authHeader, "Bearer ", "", 1)
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		r.Header.Set("X-User-ID", claims.UserID)
		next(w, r)
	}
}

// Handlers
func registerHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error creating user", http.StatusInternalServerError)
		return
	}

	user := User{
		ID:           generateID(),
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		CreatedAt:    time.Now(),
	}

	// Store user in database (implement your DB logic here)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"user_id": user.ID,
		"email":   user.Email,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Retrieve user from database (implement your DB logic here)
	// For now, this is a placeholder
	user := User{
		ID:           "user123",
		Email:        req.Email,
		PasswordHash: "$2a$10$...", // placeholder
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		http.Error(w, "Error generating token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": tokenString,
	})
}

func uploadBackupHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "File too large", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error reading file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Error reading file content", http.StatusInternalServerError)
		return
	}

	encryptedContent, err := encrypt(string(content))
	if err != nil {
		http.Error(w, "Error encrypting data", http.StatusInternalServerError)
		return
	}

	backup := Backup{
		ID:             generateID(),
		UserID:         userID,
		Name:           handler.Filename,
		Source:         detectSource(handler.Filename, string(content)),
		Size:           handler.Size,
		Timestamp:      time.Now(),
		ContentPreview: truncate(string(content), 300),
		EncryptedData:  encryptedContent,
	}

	// Store backup in database (implement your DB logic here)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backup)
}

func getBackupsHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")

	// Retrieve backups from database for this user
	backups := []Backup{}

	// Placeholder - implement DB retrieval
	_ = userID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backups)
}

func getProjectsHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")

	// Retrieve projects from database for this user
	projects := []Project{}

	// Placeholder - implement DB retrieval
	_ = userID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

// Utility functions
func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func detectSource(filename, content string) string {
	lower := strings.ToLower(filename)
	contentLower := strings.ToLower(content)

	if strings.Contains(lower, "claude") || strings.Contains(contentLower, "anthropic") {
		return "Claude AI"
	}
	if strings.Contains(lower, "chatgpt") || strings.Contains(contentLower, "openai") {
		return "ChatGPT"
	}
	if strings.Contains(lower, "grok") {
		return "Grok"
	}
	if strings.Contains(lower, "gemini") {
		return "Gemini"
	}
	return "General"
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

func main() {
	// Validate environment variables
	if len(jwtSecret) == 0 {
		log.Fatal("JWT_SECRET environment variable not set")
	}
	if len(encryptionKey) != 32 {
		log.Fatal("ENCRYPTION_KEY must be 32 bytes")
	}

	r := mux.NewRouter()

	// Public routes
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/api/auth/register", registerHandler).Methods("POST")
	r.HandleFunc("/api/auth/login", loginHandler).Methods("POST")

	// Protected routes
	r.HandleFunc("/api/backups", authMiddleware(uploadBackupHandler)).Methods("POST")
	r.HandleFunc("/api/backups", authMiddleware(getBackupsHandler)).Methods("GET")
	r.HandleFunc("/api/projects", authMiddleware(getProjectsHandler)).Methods("GET")

	// CORS configuration
	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{os.Getenv("FRONTEND_URL")}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
		handlers.AllowCredentials(),
	)(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsHandler))
}
