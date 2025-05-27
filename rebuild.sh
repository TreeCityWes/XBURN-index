#!/bin/bash
set -e

echo "Rebuilding XBurn Analytics Dashboard..."

# Make init.sh executable
chmod +x init.sh

# Stop any existing containers
docker-compose down

# Remove volumes to ensure clean database
docker volume rm xburn-dashboard_postgres_data || true

# Build and start services
docker-compose up -d

echo "Rebuild complete. Services are starting up."
echo "You can check logs with: docker-compose logs -f" 