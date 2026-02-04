# PRODUCTION DEPLOYMENT CHECKLIST
# Cloud Connect Backup Manager v1.0

## PRE-DEPLOYMENT VERIFICATION ✓

### System Requirements Met
- [ ] Docker 20.10+ installed
- [ ] Docker Compose 2.0+ installed  
- [ ] 4GB RAM minimum available
- [ ] 20GB disk space available
- [ ] Valid domain name registered
- [ ] DNS A records configured

### Security Configuration
- [ ] `.env` file created with unique secrets
- [ ] JWT_SECRET is 64+ characters
- [ ] ENCRYPTION_KEY is exactly 32 bytes
- [ ] Database password is strong (32+ chars)
- [ ] Redis password is strong (32+ chars)
- [ ] SSL certificates obtained (Let's Encrypt or commercial)
- [ ] Firewall rules configured (ports 80, 443 only)

### Analytics Configuration
- [ ] Google Analytics 4 property created
- [ ] GA_MEASUREMENT_ID added to .env
- [ ] Google Tag Manager container created
- [ ] GTM_ID added to .env
- [ ] PostHog account created (optional)
- [ ] POSTHOG_API_KEY added to .env (optional)

### Email Configuration (Optional but Recommended)
- [ ] SMTP credentials obtained
- [ ] SMTP_HOST, SMTP_USER, SMTP_PASSWORD set
- [ ] Test email sent successfully

## DEPLOYMENT STEPS

### Step 1: Extract Package
```bash
tar -xzf backup-manager-production.tar.gz
cd backup-manager
```

### Step 2: Run Deployment Script
```bash
chmod +x deploy.sh
./deploy.sh
```

This script automatically:
- Generates secure JWT secret (64 bytes)
- Generates AES-256 encryption key (32 bytes)
- Creates strong database passwords
- Sets up SSL certificates (self-signed for dev)
- Creates Nginx configuration
- Generates all required files

### Step 3: Configure Environment
```bash
nano .env
```

Required production values:
```
FRONTEND_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
POSTGRES_PASSWORD=<keep generated>
REDIS_PASSWORD=<keep generated>
JWT_SECRET=<keep generated>
ENCRYPTION_KEY=<keep generated>
GA_MEASUREMENT_ID=G-XXXXXXXXXX
GTM_ID=GTM-XXXXXXX
```

### Step 4: Install SSL Certificates

#### Using Let's Encrypt (Recommended)
```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d api.yourdomain.com \
  --email your@email.com \
  --agree-tos

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem
sudo chmod 644 nginx/ssl/cert.pem
sudo chmod 600 nginx/ssl/key.pem
```

#### Using Commercial SSL
```bash
# Copy your certificates
cp /path/to/certificate.crt nginx/ssl/cert.pem
cp /path/to/private.key nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
chmod 600 nginx/ssl/key.pem
```

### Step 5: Deploy Application
```bash
./start.sh
```

Wait 60 seconds for all services to initialize.

### Step 6: Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Expected output:
# NAME                      STATUS
# backup-manager-backend    Up (healthy)
# backup-manager-db         Up (healthy)
# backup-manager-frontend   Up (healthy)
# backup-manager-redis      Up (healthy)

# Test health endpoints
curl -k https://localhost/api/health
# Expected: {"status":"healthy","time":"2024-01-15T..."}

curl -k https://localhost/health
# Expected: healthy

# Check logs
./logs.sh backend
# Should show: "Server starting on port 8080"
```

### Step 7: Access Application

1. Open browser: `https://yourdomain.com`
2. Login with default credentials:
   - Email: `admin@cloudconnect.com`
   - Password: `ChangeMe123!`
3. Change admin password immediately
4. Create your user account
5. Test file upload functionality

### Step 8: Configure Monitoring

#### Google Analytics 4
1. Go to https://analytics.google.com
2. Create property for yourdomain.com
3. Copy Measurement ID (G-XXXXXXXXXX)
4. Add to .env file
5. Restart: `docker-compose restart frontend`

#### Google Tag Manager
1. Go to https://tagmanager.google.com
2. Create container for yourdomain.com
3. Copy Container ID (GTM-XXXXXXX)
4. Add to .env file
5. Restart: `docker-compose restart frontend`
6. Publish container in GTM interface

### Step 9: Setup Automated Backups

```bash
# Add to crontab
crontab -e

# Add this line (daily backup at 2 AM)
0 2 * * * cd /path/to/backup-manager && ./backup-db.sh >> /var/log/backup-manager-backup.log 2>&1
```

### Step 10: Security Hardening

```bash
# Enable UFW firewall
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Disable password authentication for SSH (use keys only)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd

# Setup automatic security updates
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## POST-DEPLOYMENT VERIFICATION

### Functional Tests
- [ ] User registration works
- [ ] User login works
- [ ] File upload works (test with sample .txt file)
- [ ] Projects are extracted automatically
- [ ] Timeline view displays correctly
- [ ] Search functionality works
- [ ] Star/unstar projects works
- [ ] Code copy to clipboard works
- [ ] Project deletion works
- [ ] Backup deletion works
- [ ] Logout works

### Security Tests
- [ ] HTTPS redirects from HTTP
- [ ] SSL certificate is valid (not self-signed warning)
- [ ] JWT authentication protects API endpoints
- [ ] Uploaded files are encrypted in database
- [ ] Passwords are hashed (check database)
- [ ] Security headers present (use securityheaders.com)
- [ ] No SQL injection vulnerabilities
- [ ] Rate limiting active (test with curl loop)

### Performance Tests
- [ ] Page load time < 3 seconds
- [ ] API response time < 500ms
- [ ] File upload works for 5MB files
- [ ] Timeline loads with 100+ projects
- [ ] Search returns results < 1 second

### Analytics Tests
- [ ] Google Analytics tracking pageviews
- [ ] Google Tag Manager firing tags
- [ ] Events tracked (upload, download, etc.)
- [ ] User sessions recorded

## MONITORING SETUP

### Health Monitoring Script
Create `/usr/local/bin/backup-manager-monitor.sh`:

```bash
#!/bin/bash
HEALTH_URL="https://yourdomain.com/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -ne 200 ]; then
    echo "Health check failed! Response: $RESPONSE"
    # Send alert email
    echo "Backup Manager health check failed" | mail -s "ALERT: Backup Manager Down" admin@yourdomain.com
    # Restart services
    cd /path/to/backup-manager && docker-compose restart
fi
```

Add to crontab (check every 5 minutes):
```
*/5 * * * * /usr/local/bin/backup-manager-monitor.sh
```

### Log Monitoring
```bash
# Monitor error logs in real-time
./logs.sh backend | grep -i error

# Check for failed login attempts
./logs.sh backend | grep "Invalid credentials"

# Monitor database performance
docker-compose exec postgres psql -U cloudconnect -d backup_manager -c "SELECT * FROM pg_stat_activity;"
```

### Disk Space Monitoring
```bash
# Check Docker volumes
docker system df

# Set up alert when disk > 80% full
df -h / | awk 'NR==2 {if(substr($5,1,length($5)-1) > 80) print "Disk space low: "$5}'
```

## MAINTENANCE SCHEDULE

### Daily
- [ ] Check health endpoint
- [ ] Review error logs
- [ ] Verify backups completed

### Weekly  
- [ ] Review disk space usage
- [ ] Check database size
- [ ] Analyze user activity logs
- [ ] Review security logs for anomalies

### Monthly
- [ ] Update Docker images
- [ ] Rotate database backups (keep 30 days)
- [ ] Review and optimize database indexes
- [ ] Test restore from backup
- [ ] Review SSL certificate expiry (90 days for Let's Encrypt)

### Quarterly
- [ ] Security audit
- [ ] Performance optimization
- [ ] Update documentation
- [ ] Review user feedback

## TROUBLESHOOTING GUIDE

### Issue: Services won't start
```bash
# Check logs
docker-compose logs

# Common causes:
# 1. Port already in use
sudo lsof -i :80
sudo lsof -i :443

# 2. Environment variables missing
docker-compose config

# 3. Disk space full
df -h
```

### Issue: Database connection failed
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U cloudconnect -d backup_manager

# Check credentials
cat .env | grep POSTGRES
```

### Issue: Frontend shows "Network Error"
```bash
# Check backend is accessible
curl https://localhost/api/health

# Verify Nginx proxy configuration
docker-compose exec frontend cat /etc/nginx/nginx.conf | grep proxy_pass

# Check CORS headers
curl -I https://localhost/api/health
```

### Issue: File uploads fail
```bash
# Check file size limit
cat .env | grep MAX_FILE_SIZE_MB

# Check disk space
df -h

# Verify permissions
ls -la /var/lib/docker/volumes/
```

### Issue: SSL certificate expired
```bash
# Renew Let's Encrypt
sudo certbot renew

# Copy new certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem

# Reload Nginx
docker-compose exec frontend nginx -s reload
```

## ROLLBACK PROCEDURE

If deployment fails:

```bash
# Stop services
./stop.sh

# Restore from backup
docker-compose exec -T postgres psql -U cloudconnect backup_manager < backup_PREVIOUS.sql

# Revert to previous version
git checkout previous-version
docker-compose build --no-cache
./start.sh
```

## SUPPORT CONTACTS

- **Technical Support:** support@cloudconnect.com
- **Security Issues:** security@cloudconnect.com  
- **Emergency:** +1-XXX-XXX-XXXX (24/7 on-call)

## DEPLOYMENT SIGN-OFF

Deployment Date: _______________
Deployed By: _______________
Verified By: _______________
Production URL: _______________

Checklist Complete: [ ] YES [ ] NO
All Tests Passed: [ ] YES [ ] NO
Monitoring Active: [ ] YES [ ] NO
Backups Configured: [ ] YES [ ] NO

Signature: _______________
