# XBURN Analytics Dashboard

Multi-chain indexer and analytics dashboard for tracking XEN burns and XBURN NFT positions across multiple chains.

## Supported Chains

- Base (Chain ID: 8453)
- Ethereum (Chain ID: 1)
- Polygon (Chain ID: 137)
- Optimism (Chain ID: 10)
- PulseChain (Chain ID: 369)
- BSC (Chain ID: 56)
- Avalanche (Chain ID: 43114)

## Features

- Real-time indexing of XEN burns and XBURN NFT positions
- Multi-chain support with automatic failover between RPC providers
- Chain-specific statistics and analytics
- Metabase dashboard for visualizing burn data
- Health monitoring and automatic recovery
- PostgreSQL database for reliable data storage

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 14+ (handled by Docker)

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/xburn-dashboard.git
cd xburn-dashboard/backend
```

2. Create `.env` file:
```bash
# Database configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=xen_burn_analytics
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Chain RPC URLs (using Ankr premium endpoints for better reliability)
BASE_RPC_URL=https://mainnet.base.org
ETH_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BSC_RPC_URL=https://bsc-dataseed1.binance.org
AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
PULSECHAIN_RPC_URL=https://rpc.pulsechain.com

# Enable specific chains (comma-separated, no spaces)
ENABLED_CHAINS=base,ethereum,polygon,optimism,bsc,avalanche,pulsechain
```

3. Start the services:
```bash
docker-compose up -d
```

4. Access the dashboards:
- Analytics Dashboard: http://localhost:3001
- Health Status: http://localhost:3000/health/chains

## Development

1. Install dependencies:
```bash
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Run development server:
```bash
npm run dev
```

## Production Deployment

1. Clone the repository on your VPS:
```bash
git clone https://github.com/yourusername/xburn-dashboard.git
cd xburn-dashboard/backend
```

2. Create `.env` file with your production settings

3. Start the services:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Architecture

- `src/provider.ts`: RPC provider management with failover support
- `src/indexer/`: Chain indexing logic
- `src/config.ts`: Chain-specific configurations
- `schema.sql`: Database schema and functions
- `docker-compose.yml`: Service orchestration

## Database Schema

- `chains`: Chain configuration and indexing progress
- `xen_burns`: Records of token burns
- `burn_nft_positions`: NFT position data
- `chain_token_stats`: Per-chain token statistics
- `chain_health`: Indexer health monitoring

## Monitoring

- Health checks: http://localhost:3000/health/chains
- Logs: `docker-compose logs -f indexer`
- Metabase dashboards: http://localhost:3001

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

ISC