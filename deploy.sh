#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Check if docker and docker-compose are installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Installing..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Build and start services
echo "Building and starting services..."
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 30

# Check service status
echo "Checking service status..."
docker-compose -f docker-compose.prod.yml ps

# Setup reverse proxy (if needed)
if [ ! -f /etc/nginx/sites-available/xburn ]; then
    echo "Setting up Nginx reverse proxy..."
    sudo tee /etc/nginx/sites-available/xburn > /dev/null <<EOT
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOT

    sudo ln -s /etc/nginx/sites-available/xburn /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
fi

echo "Deployment completed successfully!"
echo "Metabase dashboard: http://localhost:3001"
echo "API health check: http://localhost:3000/health/chains"
echo ""
echo "To view logs:"
echo "docker-compose -f docker-compose.prod.yml logs -f indexer" 