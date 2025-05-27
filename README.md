# XBurn Analytics Dashboard Backend

This is the backend service for the XBurn Analytics Dashboard, which tracks XEN token burns and related events across multiple blockchains.

## Features

- Multi-chain indexing of XEN burn events, NFT positions, swap burns, and liquidity events
- Chain-specific database tables for efficient querying
- Automatically compiles statistics per chain and per user
- Health monitoring for chain indexers
- RPC provider failover and load balancing
- API endpoints for accessing burn data

## Requirements

- Docker and Docker Compose
- Node.js 18+
- PostgreSQL 14+

## Quick Start

1. Clone the repository
2. Create a `.env` file with your RPC URLs (optional, default RPCs are provided)
3. Run the rebuild script:

```bash
chmod +x rebuild.sh
./rebuild.sh
```

This will start the following services:
- PostgreSQL database
- Database initialization service
- Metabase analytics dashboard
- Indexer service

## Database Structure

Each chain has its own set of tables:
- `chain_[CHAIN_ID]_xen_burns` - XEN token burn events
- `chain_[CHAIN_ID]_burn_nft_positions` - NFT burn lock positions
- `chain_[CHAIN_ID]_swap_burns` - Swap and burn events
- `chain_[CHAIN_ID]_liquidity_added` - Liquidity addition events
- `chain_[CHAIN_ID]_chain_stats` - Chain-level statistics
- `chain_[CHAIN_ID]_user_stats` - User-level statistics

## Available Scripts

- `npm run dev` - Start the indexer in development mode
- `npm run build` - Build the TypeScript code
- `npm run start` - Start the built indexer
- `npm run init-db` - Initialize the database schema
- `npm run show-stats` - Display current chain statistics

## Monitoring

- Indexer health: http://localhost:3000/api/health/chains
- Metabase dashboard: http://localhost:3001

## Configuration

You can configure the indexer by setting environment variables in the `.env` file or in the `docker-compose.yml` file:

```
# Chain selection
ENABLED_CHAINS=base,ethereum,polygon,optimism,pulsechain,bsc,avalanche

# Database configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Indexer configuration
INDEXER_INTERVAL_MS=15000
BATCH_SIZE=250
MAX_RETRIES=10
RETRY_DELAY=5000
MAX_BACKOFF_DELAY=60000

# Custom RPC URLs (optional)
BASE_RPC_URL=https://your-base-rpc-url
ETHEREUM_RPC_URL=https://your-ethereum-rpc-url
```

## Troubleshooting

If you encounter issues with the indexer:

1. Check the logs: `docker-compose logs -f indexer`
2. Verify database connectivity: `docker-compose logs -f postgres`
3. Rebuild the database: `./rebuild.sh`

## License

ISC

## Windows Users

If you're using Windows, run these commands instead:

```powershell
# Start the services
docker-compose up -d

# To rebuild from scratch
docker-compose down
docker volume rm xburn-dashboard_postgres_data
docker-compose up -d
```

Make sure to edit the init.sh file to use LF line endings instead of CRLF.