#!/bin/bash

# Generate Self-Signed SSL Certificates
# Usage: ./generate_ssl.sh
#
# Generates self-signed SSL certificates for local development

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SSL_DIR="./nginx/ssl"
CERT_FILE="$SSL_DIR/nginx.crt"
KEY_FILE="$SSL_DIR/nginx.key"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}SSL Certificate Generator${NC}"
echo -e "${GREEN}==================================${NC}"

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Check if certificates already exist
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo -e "${YELLOW}Certificates already exist.${NC}"
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Keeping existing certificates${NC}"
        exit 0
    fi
fi

echo -e "${YELLOW}Generating self-signed SSL certificate...${NC}"
echo ""

# Generate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=State/L=City/O=Organization/OU=IT/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"

# Set permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo ""
echo -e "${GREEN}✓ SSL certificates generated successfully${NC}"
echo -e "${GREEN}Certificate: $CERT_FILE${NC}"
echo -e "${GREEN}Key: $KEY_FILE${NC}"
echo ""
echo -e "${YELLOW}Note: These are self-signed certificates for development only.${NC}"
echo -e "${YELLOW}Your browser will show a security warning.${NC}"
echo -e "${YELLOW}For production, use Let's Encrypt certificates.${NC}"
echo ""
echo -e "${GREEN}==================================${NC}"

exit 0
