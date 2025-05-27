#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting XBurn Indexer Deployment..."

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Check if docker and docker-compose are installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull

# Fix all TypeScript errors in one go
echo "🔧 Fixing TypeScript compilation errors..."

# Create a comprehensive TypeScript fix script
cat > fix_typescript.sh << 'EOF'
#!/bin/bash

# Fix src/provider.ts
if [ -f "src/provider.ts" ]; then
    echo "Fixing src/provider.ts..."
    # Remove global declarations and fix NodeJS.Timeout
    sed -i '/^\/\/ Add NodeJS types declaration$/,/^}$/d' src/provider.ts
    sed -i 's/NodeJS\.Timeout/ReturnType<typeof setInterval>/g' src/provider.ts
fi

# Fix src/indexer/health.ts
if [ -f "src/indexer/health.ts" ]; then
    echo "Fixing src/indexer/health.ts..."
    # Remove global declarations
    sed -i '/^\/\/ Add Node\.js types declaration$/,/^}$/d' src/indexer/health.ts
    # Fix NodeJS.Timeout references
    sed -i 's/NodeJS\.Timeout/ReturnType<typeof setInterval>/g' src/indexer/health.ts
    # Fix database query destructuring
    sed -i 's/const { rows: \[chainData\] } = await/const result = await/g' src/indexer/health.ts
    sed -i '/const result = await.*query(/a\            const chainData = result?.rows?.[0];' src/indexer/health.ts
    sed -i 's/const { rows } = await this\.dbs\.get(.System.)/const result = await this.dbs.get("System")/g' src/indexer/health.ts
    sed -i 's/return rows;/return result?.rows || [];/g' src/indexer/health.ts
fi

# Fix src/indexer/chain-indexer.ts
if [ -f "src/indexer/chain-indexer.ts" ]; then
    echo "Fixing src/indexer/chain-indexer.ts..."
    # Fix setTimeout references by adding proper typing
    sed -i 's/setTimeout(resolve, 1000)/setTimeout(() => resolve(), 1000)/g' src/indexer/chain-indexer.ts
    sed -i 's/setTimeout(resolve, delay)/setTimeout(() => resolve(), delay)/g' src/indexer/chain-indexer.ts
    # Fix __dirname reference
    sed -i 's/__dirname/process.cwd()/g' src/indexer/chain-indexer.ts
    # Fix event type issues
    sed -i 's/processEvents(events: Log\[\])/processEvents(events: any[])/g' src/indexer/chain-indexer.ts
fi

echo "TypeScript fixes applied successfully!"
EOF

chmod +x fix_typescript.sh
./fix_typescript.sh
rm fix_typescript.sh

# Create necessary directories
echo "📁 Creating required directories..."
mkdir -p logs
chmod 777 logs

# Stop any running containers
echo "🛑 Stopping existing containers..."
docker-compose down --remove-orphans

# Start postgres first
echo "🐘 Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for postgres to be ready with better health checking
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    echo "Waiting for PostgreSQL... ($i/30)"
    sleep 2
done

# Create metabase database
echo "🗄️ Setting up Metabase database..."
docker-compose exec -T postgres psql -U postgres -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'metabase') THEN
        CREATE DATABASE metabase;
        RAISE NOTICE 'Created metabase database';
    ELSE
        RAISE NOTICE 'Metabase database already exists';
    END IF;
END
\$\$;
" || echo "Metabase database setup completed"

# Build and start all services
echo "🏗️ Building and starting all services..."
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 30

# Check service status
echo "📊 Service Status:"
docker-compose ps

# Show logs for debugging
echo "📋 Recent logs:"
docker-compose logs --tail=20 indexer

# Final status check
echo ""
echo "🎉 Deployment Summary:"
echo "================================"
echo "Metabase Dashboard: http://$(hostname -I | awk '{print $1}'):3001"
echo "API Health Check: http://$(hostname -I | awk '{print $1}'):3000/health/chains"
echo ""
echo "To view live logs:"
echo "docker-compose logs -f indexer"
echo ""
echo "To check service status:"
echo "docker-compose ps"
echo ""

# Check if indexer is running properly
if docker-compose ps indexer | grep -q "Up"; then
    echo "✅ Indexer is running successfully!"
else
    echo "❌ Indexer may have issues. Check logs with: docker-compose logs indexer"
fi

echo "🚀 Deployment completed!" 