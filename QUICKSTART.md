# Quick Start Guide

This guide will get you up and running with the GIS Web Application in ~10 minutes.

## Prerequisites

- Docker Desktop installed and running
- 16GB RAM (8GB minimum)
- 10GB free disk space

## Step 1: Clone and Setup

```bash
# Navigate to project directory
cd opengridindo

# Copy environment template
cp .env.example .env
```

## Step 2: Configure Environment

Open `.env` and update:

### On Windows PowerShell:
```powershell
# Generate JWT secret
$secret = -join ((48..57) + (97..102) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Output $secret

# Update .env file with the generated secret
# Replace: JWT_SECRET=generate_with_openssl_rand_hex_32
# With: JWT_SECRET=<your_generated_secret>
```

### On Linux/Mac:
```bash
# Generate JWT secret
openssl rand -hex 32

# Update .env file with the generated secret
```

### Required Changes in .env:
- `JWT_SECRET` - Use the generated value above
- `ADMIN_PASSWORD` - Change to a strong password
- `POSTGRES_PASSWORD` - Change to a strong password

## Step 3: Generate SSL Certificates

### On Windows:
```powershell
# Install Git Bash or use WSL
# Then run:
bash scripts/generate_ssl.sh
```

### On Linux/Mac:
```bash
chmod +x scripts/*.sh
./scripts/generate_ssl.sh
```

This creates self-signed certificates in `nginx/ssl/`.

## Step 4: Start the Application

```bash
docker-compose up -d
```

Wait ~30 seconds for all services to start.

## Step 5: Verify Services

```bash
docker-compose ps
```

All services should show "Up" status:
- gis_postgis
- gis_fastapi
- gis_tegola
- gis_nginx

## Step 6: Access the Application

1. Open browser to: **https://localhost**
2. Accept the self-signed certificate warning
3. Click **Login** button
4. Use admin credentials from your `.env` file:
   - Username: `admin` (or your `ADMIN_USERNAME`)
   - Password: (your `ADMIN_PASSWORD`)

## Step 7: Import Sample Data (Optional)

If you have shapefiles:

```bash
# Create data directory
mkdir -p data/shapefiles

# Copy your .shp files to data/shapefiles/
# Then import:
docker-compose exec postgis bash /docker-entrypoint-initdb.d/import_shapefiles.sh
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs -f

# Restart specific service
docker-compose restart postgis
```

### Can't connect to database
```bash
# Check PostGIS is healthy
docker-compose exec postgis pg_isready -U gisuser -d gisdb
```

### Frontend shows blank map
- Check browser console for errors (F12)
- Verify you're logged in
- Check if tiles are loading in Network tab

### SSL certificate error
- On Chrome: Type `thisisunsafe` on the warning page
- On Firefox: Click Advanced → Accept Risk
- This is normal for self-signed certificates

## Next Steps

1. **Import your data**: Follow the README for shapefile import
2. **Explore the API**: Visit https://localhost/api/docs
3. **Customize styling**: Edit `frontend/app.js` for map colors
4. **Add users**: Use API or admin panel to create more users

## Quick Commands Reference

```bash
# View logs
docker-compose logs -f [service_name]

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# Access database directly
docker-compose exec postgis psql -U gisuser -d gisdb

# Check disk usage
docker system df
```

## Getting Help

- Check the full README.md for detailed documentation
- Review logs: `docker-compose logs -f`
- Inspect containers: `docker-compose ps`
- Check API docs: https://localhost/api/docs

---

**Your application is now running!** 🎉

Navigate to https://localhost and start exploring your GIS data.
