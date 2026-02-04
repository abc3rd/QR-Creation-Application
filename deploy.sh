#!/bin/bash
set -e

# Cloud Connect Backup Manager - Production Deployment Script
# This script sets up the complete production environment with security

echo "================================================"
echo "Cloud Connect Backup Manager - Deployment"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root${NC}" 
   exit 1
fi

# Check for required commands
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed${NC}"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Docker Compose is required but not installed${NC}"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo -e "${RED}OpenSSL is required but not installed${NC}"; exit 1; }

echo -e "${GREEN}✓ All required commands found${NC}"

# Generate secure secrets if .env doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file with secure secrets...${NC}"
    
    # Generate JWT secret (64 bytes base64)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    
    # Generate encryption key (32 bytes base64)
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
    
    # Generate database password
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    
    # Generate Redis password
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    
    # Create .env file
    cat > .env <<EOF
# Generated on $(date)
POSTGRES_DB=backup_manager
POSTGRES_USER=cloudconnect
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:8080
PORT=8080
ENV=production
LOG_LEVEL=info
ENABLE_REGISTRATION=true
ENABLE_API_KEYS=true
MAX_FILE_SIZE_MB=50
MAX_BACKUPS_PER_USER=1000
EOF
    
    echo -e "${GREEN}✓ .env file created with secure secrets${NC}"
    echo -e "${YELLOW}⚠ IMPORTANT: Save these credentials securely!${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Create SSL directory and self-signed certificate for development
echo -e "${YELLOW}Setting up SSL certificates...${NC}"
mkdir -p nginx/ssl

if [ ! -f nginx/ssl/cert.pem ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=CloudConnect/CN=localhost"
    
    echo -e "${GREEN}✓ Self-signed SSL certificate created${NC}"
    echo -e "${YELLOW}⚠ For production, replace with valid SSL certificates${NC}"
else
    echo -e "${GREEN}✓ SSL certificates already exist${NC}"
fi

# Create Nginx configuration
echo -e "${YELLOW}Creating Nginx configuration...${NC}"
mkdir -p nginx
cat > nginx/nginx.conf <<'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    
    # HTTP server - redirect to HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }
    
    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;
        
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        
        root /usr/share/nginx/html;
        index index.html;
        
        # Frontend
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        # API proxy
        location /api/ {
            proxy_pass http://backend:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
        
        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

echo -e "${GREEN}✓ Nginx configuration created${NC}"

# Create frontend Dockerfile
echo -e "${YELLOW}Creating frontend Dockerfile...${NC}"
mkdir -p frontend
cat > frontend/Dockerfile <<'EOF'
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build for production
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
EOF

echo -e "${GREEN}✓ Frontend Dockerfile created${NC}"

# Create package.json for frontend
cat > frontend/package.json <<'EOF'
{
  "name": "backup-manager-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.263.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": ["react-app"]
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  },
  "devDependencies": {
    "react-scripts": "5.0.1"
  }
}
EOF

# Create React index files
mkdir -p frontend/public
cat > frontend/public/index.html <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Cloud Connect Backup Manager - Secure AI Development Archive" />
    <title>Cloud Connect Backup Manager</title>
    
    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=%REACT_APP_GA_ID%"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '%REACT_APP_GA_ID%');
    </script>
    
    <!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','%REACT_APP_GTM_ID%');</script>
    
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; }
    </style>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    
    <!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=%REACT_APP_GTM_ID%"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    
    <div id="root"></div>
  </body>
</html>
EOF

mkdir -p frontend/src
cat > frontend/src/index.jsx <<'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

echo -e "${GREEN}✓ Frontend structure created${NC}"

# Create deployment helper scripts
echo -e "${YELLOW}Creating helper scripts...${NC}"

cat > start.sh <<'EOF'
#!/bin/bash
docker-compose up -d
echo "Backup Manager started! Access at https://localhost"
EOF
chmod +x start.sh

cat > stop.sh <<'EOF'
#!/bin/bash
docker-compose down
echo "Backup Manager stopped"
EOF
chmod +x stop.sh

cat > logs.sh <<'EOF'
#!/bin/bash
docker-compose logs -f $@
EOF
chmod +x logs.sh

cat > backup-db.sh <<'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U cloudconnect backup_manager > "backup_${TIMESTAMP}.sql"
echo "Database backed up to backup_${TIMESTAMP}.sql"
EOF
chmod +x backup-db.sh

echo -e "${GREEN}✓ Helper scripts created${NC}"

# Create README
cat > DEPLOYMENT.md <<'EOF'
# Cloud Connect Backup Manager - Deployment Guide

## Quick Start

1. **Generate secrets (already done by setup script)**
   ```bash
   # Secrets are in .env file
   ```

2. **Start the application**
   ```bash
   ./start.sh
   ```

3. **Access the application**
   - Frontend: https://localhost
   - API: https://localhost/api
   - Default admin: admin@cloudconnect.com / ChangeMe123!

4. **View logs**
   ```bash
   ./logs.sh [service]
   # Example: ./logs.sh backend
   ```

5. **Stop the application**
   ```bash
   ./stop.sh
   ```

## Production Deployment

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Domain name with DNS configured
- SSL certificates (Let's Encrypt recommended)

### Steps

1. **Update .env file**
   - Set FRONTEND_URL to your domain
   - Set API_URL to your API domain
   - Add production database credentials
   - Configure email settings (optional)
   - Add Google Analytics ID
   - Add Google Tag Manager ID

2. **Replace SSL certificates**
   ```bash
   # Using Let's Encrypt
   certbot certonly --standalone -d yourdomain.com
   cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
   cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem
   ```

3. **Update docker-compose.yml**
   - Set proper resource limits
   - Configure backup volumes
   - Add monitoring services

4. **Deploy**
   ```bash
   docker-compose up -d
   ```

5. **Setup automatic backups**
   ```bash
   # Add to crontab
   0 2 * * * /path/to/backup-db.sh
   ```

## Security Checklist

- [x] Database encrypted at rest
- [x] All data encrypted in transit (HTTPS)
- [x] JWT authentication
- [x] AES-256 encryption for backups
- [x] Password hashing (bcrypt)
- [x] SQL injection protection
- [x] XSS protection headers
- [x] CSRF protection
- [x] Rate limiting
- [x] Security headers (CSP, X-Frame-Options, etc.)

## Monitoring

### Health Checks
- Backend: https://yourdomain.com/api/health
- Frontend: https://yourdomain.com/health

### Logs
```bash
# All services
./logs.sh

# Specific service
./logs.sh backend
./logs.sh postgres
./logs.sh redis
```

## Backup & Restore

### Backup Database
```bash
./backup-db.sh
```

### Restore Database
```bash
docker-compose exec -T postgres psql -U cloudconnect backup_manager < backup_TIMESTAMP.sql
```

## Scaling

### Horizontal Scaling
```bash
docker-compose up -d --scale backend=3
```

### Resource Limits
Edit docker-compose.yml and add:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

## Troubleshooting

### Check service status
```bash
docker-compose ps
```

### View logs
```bash
docker-compose logs -f backend
```

### Restart service
```bash
docker-compose restart backend
```

### Database connection issues
```bash
docker-compose exec postgres psql -U cloudconnect -d backup_manager
```

## Support

For issues or questions, contact: support@cloudconnect.com
EOF

echo -e "${GREEN}✓ Documentation created${NC}"

echo ""
echo "================================================"
echo -e "${GREEN}✓ Deployment setup complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Review and update .env file with your settings"
echo "2. For production, replace SSL certificates in nginx/ssl/"
echo "3. Run: ./start.sh to start the application"
echo "4. Access: https://localhost"
echo ""
echo -e "${YELLOW}⚠ Default admin credentials:${NC}"
echo "   Email: admin@cloudconnect.com"
echo "   Password: ChangeMe123!"
echo ""
echo "See DEPLOYMENT.md for full deployment guide"
echo "================================================"
