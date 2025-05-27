#!/bin/bash

echo "📦 Preparing deployment package..."

# Add all changes
git add .

# Commit with a descriptive message
git commit -m "Fix PostgreSQL schema and complete one-shot deployment

- Fixed update_user_stats function SQL syntax error
- Enhanced deploy.sh with volume cleanup and health checks
- Updated init.sh for proper database initialization
- Added deployment status verification
- Ready for one-shot deployment on VPS"

# Push to repository
git push

echo ""
echo "✅ Code pushed to repository!"
echo ""
echo "🚀 DEPLOYMENT INSTRUCTIONS FOR YOUR VPS:"
echo "========================================"
echo ""
echo "1. SSH into your VPS:"
echo "   ssh your-user@your-vps-ip"
echo ""
echo "2. Clone or pull the latest code:"
echo "   git clone https://github.com/TreeCityWes/xburn-index.git"
echo "   cd xburn-index"
echo "   # OR if already cloned:"
echo "   cd xburn-index && git pull"
echo ""
echo "3. Set your Alchemy API key (optional but recommended):"
echo "   export ALCHEMY_API_KEY=your-alchemy-api-key"
echo ""
echo "4. Run the one-shot deployment:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
echo "5. Access your services:"
echo "   - Metabase Dashboard: http://your-vps-ip:3001"
echo "     Login: admin@xburn.com / admin123!"
echo "   - API Health Check: http://your-vps-ip:3000/health/chains"
echo ""
echo "6. Monitor the indexer:"
echo "   docker-compose logs -f indexer"
echo ""
echo "That's it! The deployment script handles everything else." 