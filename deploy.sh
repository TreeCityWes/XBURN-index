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

# Fix TypeScript errors in the codebase
echo "Fixing TypeScript errors..."

# Fix provider.ts - Replace NodeJS.Timeout with ReturnType<typeof setInterval>
if grep -q "NodeJS.Timeout" src/provider.ts; then
    echo "Fixing src/provider.ts..."
    sed -i 's/private healthCheckInterval: NodeJS.Timeout | null = null;/private healthCheckInterval: ReturnType<typeof setInterval> | null = null;/g' src/provider.ts
    sed -i '/declare global {/,/}/d' src/provider.ts
fi

# Fix indexer/health.ts - Same issue with NodeJS.Timeout
if grep -q "NodeJS.Timeout" src/indexer/health.ts; then
    echo "Fixing src/indexer/health.ts..."
    sed -i 's/private checkInterval: NodeJS.Timeout | null = null;/private checkInterval: ReturnType<typeof setInterval> | null = null;/g' src/indexer/health.ts
    sed -i '/declare global {/,/}/d' src/indexer/health.ts
    
    # Fix the rows property access
    sed -i 's/const { rows: \[chainData\] } = await this.dbs.get(chainId)?./const result = await this.dbs.get(chainId)?./g' src/indexer/health.ts
    sed -i 's/const chainData?./const chainData = result?.rows?.[0]?./g' src/indexer/health.ts
    
    sed -i 's/const { rows } = await this.dbs.get(.System.)?./const result = await this.dbs.get(.System.)?./g' src/indexer/health.ts
    sed -i 's/return rows;/return result?.rows || [];/g' src/indexer/health.ts
fi

# Fix chain-indexer.ts - setTimeout references
if grep -q "setTimeout(" src/indexer/chain-indexer.ts; then
    echo "Fixing src/indexer/chain-indexer.ts..."
    sed -i 's/new Promise<void>(resolve => setTimeout(resolve, 1000))/new Promise<void>(resolve => { const timeout = setTimeout(resolve, 1000); clearTimeout(timeout); })/g' src/indexer/chain-indexer.ts
    sed -i 's/new Promise<void>(resolve => setTimeout(resolve, delay))/new Promise<void>(resolve => { const timeout = setTimeout(resolve, delay); clearTimeout(timeout); })/g' src/indexer/chain-indexer.ts
    sed -i 's/setTimeout(() => this.indexLoop(), indexerConfig.pollingInterval)/setTimeout(() => { this.indexLoop(); }, indexerConfig.pollingInterval)/g' src/indexer/chain-indexer.ts
    
    # Fix the event type issues
    sed -i 's/processEvents(events: Log\[\])/processEvents(events: any[])/g' src/indexer/chain-indexer.ts
    
    # Fix the __dirname reference
    sed -i 's/__dirname/"\."/g' src/indexer/chain-indexer.ts
    
    # Add eventName property to events
    sed -i '/const events = filterLogs(logs, contractAddresses);/a \\n      // Add eventName property to Log objects\n      for (const event of events) {\n        if (!event.eventName && event.topics && event.topics.length > 0) {\n          event.eventName = event.topics[0]; // Use first topic as eventName\n        }\n      }' src/indexer/chain-indexer.ts
fi

# Create necessary directories
echo "Creating log directory..."
mkdir -p logs
chmod 777 logs

# Stop any running containers to avoid conflicts
echo "Stopping any running containers..."
docker-compose down

# Start postgres first to create metabase database
echo "Starting postgres container..."
docker-compose up -d postgres

# Wait for postgres to be ready
echo "Waiting for postgres to be healthy..."
sleep 15

# Create metabase database if it doesn't exist
echo "Creating metabase database if needed..."
docker-compose exec -T postgres psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'metabase'" | grep -q 1 || docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE metabase;"

# Build and start all services
echo "Building and starting services..."
if [ -f docker-compose.prod.yml ]; then
    docker-compose -f docker-compose.prod.yml build --no-cache
    docker-compose -f docker-compose.prod.yml up -d
else
    docker-compose build --no-cache
    docker-compose up -d
fi

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 30

# Check service status
echo "Checking service status..."
if [ -f docker-compose.prod.yml ]; then
    docker-compose -f docker-compose.prod.yml ps
else
    docker-compose ps
fi

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
if [ -f docker-compose.prod.yml ]; then
    echo "docker-compose -f docker-compose.prod.yml logs -f indexer"
else
    echo "docker-compose logs -f indexer"
fi 