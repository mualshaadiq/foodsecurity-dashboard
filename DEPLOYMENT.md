# VPS Deployment Guide

Complete guide for deploying the GIS Web Application to a production VPS.

## Recommended VPS Specifications

### Minimum (for testing/small datasets)
- 2 vCPU cores
- 4 GB RAM
- 50 GB SSD storage
- Ubuntu 22.04 LTS

### Recommended (for production with 50GB+ data)
- 4 vCPU cores
- 8 GB RAM
- 200 GB NVMe storage
- Ubuntu 22.04 LTS

### Hostinger VPS Options
- **VPS Cloud 2**: 2 vCPU, 4GB RAM, 100GB NVMe (~$15/month)
- **Business VPS 2**: 4 vCPU, 8GB RAM, 200GB NVMe (~$30/month)

## Pre-Deployment Checklist

- [ ] VPS provisioned with Ubuntu 22.04
- [ ] Root or sudo access
- [ ] Domain name pointed to VPS IP
- [ ] SSH access configured
- [ ] Firewall rules planned

## Step 1: Initial VPS Setup

### Connect to VPS
```bash
ssh root@your-vps-ip
```

### Update system
```bash
apt update && apt upgrade -y
```

### Create non-root user (recommended)
```bash
adduser gisadmin
usermod -aG sudo gisadmin
su - gisadmin
```

### Configure firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

## Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
```

## Step 3: Install Docker Compose

```bash
# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify installation
docker compose version
```

## Step 4: Clone Application

```bash
# Create application directory
sudo mkdir -p /opt/gis-app
sudo chown $USER:$USER /opt/gis-app

# Clone repository (replace with your repo URL)
cd /opt/gis-app
git clone <your-repository-url> .

# Or upload files via SCP from your local machine:
# scp -r opengridindo/ user@vps-ip:/opt/gis-app/
```

## Step 5: Configure Environment

```bash
cd /opt/gis-app

# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

### Production .env Configuration

```bash
# Database - Use strong passwords!
POSTGRES_DB=gisdb
POSTGRES_USER=gisuser
POSTGRES_PASSWORD=<generate-strong-password>

# Database URL
DATABASE_URL=postgresql+asyncpg://gisuser:<password>@postgis:5432/gisdb

# JWT Secret - Generate with: openssl rand -hex 32
JWT_SECRET=<generated-secret-key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - Add your domain
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Environment
ENVIRONMENT=production

# Admin credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-admin-password>
```

## Step 6: Configure Domain DNS

Point your domain to the VPS IP:

### DNS Records
```
Type: A
Name: @ (or yourdomain.com)
Value: YOUR_VPS_IP
TTL: 300

Type: A
Name: www
Value: YOUR_VPS_IP
TTL: 300
```

Wait for DNS propagation (5-30 minutes). Check with:
```bash
nslookup yourdomain.com
```

## Step 7: SSL Certificates with Let's Encrypt

### Install Certbot
```bash
sudo apt install certbot -y
```

### Stop any services on port 80/443
```bash
docker compose down
```

### Obtain SSL certificate
```bash
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --agree-tos \
  --email your-email@example.com \
  --non-interactive
```

Certificates will be saved to:
- `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

## Step 8: Update Nginx Configuration for Production

Edit `nginx/nginx.conf`:

```bash
nano nginx/nginx.conf
```

Update the HTTPS server block:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # ... rest of configuration
}
```

## Step 9: Update Docker Compose for Production

Edit `docker-compose.yml` to add Let's Encrypt volume:

```bash
nano docker-compose.yml
```

Add to nginx service:

```yaml
nginx:
  # ... existing config
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro  # Add this line
    - ./frontend:/usr/share/nginx/html:ro
```

## Step 10: Start Application

```bash
cd /opt/gis-app

# Start services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f
```

## Step 11: Import Production Data

```bash
# Upload shapefiles to VPS
scp -r local/data/shapefiles/ user@vps-ip:/opt/gis-app/data/

# Import data
docker compose exec postgis bash << 'EOF'
cd /data/shapefiles
for shp in *.shp; do
  ogr2ogr -f "PostgreSQL" \
    PG:"host=localhost dbname=gisdb user=gisuser password=${POSTGRES_PASSWORD}" \
    "$shp" \
    -nln spatial_features \
    -append \
    -lco GEOMETRY_NAME=geom \
    -lco SPATIAL_INDEX=GIST \
    -gt 65536 \
    --config PG_USE_COPY YES \
    -t_srs EPSG:4326 \
    -skipfailures \
    -progress
done

# Optimize database
psql -U gisuser -d gisdb -c "UPDATE spatial_features SET geom_type = ST_GeometryType(geom) WHERE geom_type IS NULL;"
psql -U gisuser -d gisdb -c "VACUUM ANALYZE spatial_features;"
EOF
```

## Step 12: Configure Auto-Renewal for SSL

Set up automatic SSL certificate renewal:

```bash
# Edit crontab
sudo crontab -e

# Add this line (renews at 3 AM daily, restarts nginx if renewed)
0 3 * * * certbot renew --quiet --deploy-hook "docker compose -f /opt/gis-app/docker-compose.yml restart nginx"
```

## Step 13: Set Up Database Backups

```bash
# Create backup directory
mkdir -p /opt/gis-app/backups

# Make scripts executable
chmod +x /opt/gis-app/scripts/*.sh

# Add to crontab
crontab -e

# Add this line (backup at 2 AM daily)
0 2 * * * cd /opt/gis-app && ./scripts/backup_db.sh /opt/gis-app/backups
```

## Step 14: Configure Monitoring (Optional)

### Install system monitoring
```bash
sudo apt install htop iotop -y
```

### Monitor Docker containers
```bash
docker stats
```

### Check disk usage
```bash
df -h
docker system df
```

## Step 15: Verify Deployment

1. **Access application**: https://yourdomain.com
2. **Check SSL**: Should show green lock 🔒
3. **Login**: Use admin credentials from .env
4. **Test features**:
   - Map loads with vector tiles
   - Search works
   - Filters apply
   - Export downloads files

## Security Hardening

### 1. SSH Key Authentication
```bash
# On local machine, generate key
ssh-keygen -t ed25519

# Copy to VPS
ssh-copy-id user@vps-ip

# Disable password authentication
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd
```

### 2. Fail2Ban
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Automatic Updates
```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Maintenance Tasks

### Update application
```bash
cd /opt/gis-app
git pull
docker compose down
docker compose up -d --build
```

### View logs
```bash
docker compose logs -f [service]
```

### Restart services
```bash
docker compose restart
```

### Database backup
```bash
./scripts/backup_db.sh /opt/gis-app/backups
```

### Clean up disk space
```bash
docker system prune -a
```

## Troubleshooting

### Check service status
```bash
docker compose ps
```

### Check logs for errors
```bash
docker compose logs --tail=100 fastapi
docker compose logs --tail=100 postgis
docker compose logs --tail=100 nginx
```

### Test database connection
```bash
docker compose exec postgis psql -U gisuser -d gisdb -c "SELECT PostGIS_version();"
```

### Check SSL certificate expiry
```bash
sudo certbot certificates
```

### Verify firewall rules
```bash
sudo ufw status verbose
```

## Performance Tuning for Large Datasets

### Increase PostgreSQL memory
Edit `scripts/init_db.sql` and adjust:
```sql
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET work_mem = '100MB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
```

### Enable connection pooling
Already configured in FastAPI with asyncpg.

### Monitor performance
```bash
# Database queries
docker compose exec postgis psql -U gisuser -d gisdb
SELECT * FROM pg_stat_activity;

# Slow queries
SELECT query, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

## Scaling Strategies

### Horizontal Scaling (Multiple Instances)
- Add load balancer (Nginx, HAProxy)
- Run multiple FastAPI containers
- Use external PostgreSQL (managed service)

### Vertical Scaling
- Upgrade VPS to more CPUs/RAM
- Increase PostgreSQL memory settings
- Add SSD storage

### Caching Layer
- Add Redis for API response caching
- Configure Tegola cache to S3

## Backup and Disaster Recovery

### Backup strategy
- **Daily**: Database backups (automated via cron)
- **Weekly**: Full system snapshot
- **Monthly**: Off-site backup copy

### Restore procedure
```bash
# Stop application
docker compose down

# Restore database
./scripts/restore_db.sh backups/gisdb_backup_YYYYMMDD.sql.gz

# Start application
docker compose up -d
```

---

## Support Checklist

- [x] VPS provisioned and configured
- [x] Docker and Docker Compose installed
- [x] Application deployed
- [x] SSL certificates configured
- [x] Domain pointing to VPS
- [x] Database imported
- [x] Backups configured
- [x] Monitoring set up
- [x] Security hardened

**Your production deployment is complete!** 🚀

Access your application at: https://yourdomain.com
