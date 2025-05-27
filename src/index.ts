import { Pool } from 'pg';
import { logger } from './utils/logger';
import { chains } from './config';
import { RPCProvider } from './provider';
import { ChainIndexer } from './indexer/chain-indexer';
import { IndexerHealthMonitor } from './indexer/health';

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'xen_burn_analytics',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true'
};

class IndexerManager {
    private db: Pool;
    private indexers: Map<string, ChainIndexer>;
    private providers: Map<string, RPCProvider>;
    private healthMonitor: IndexerHealthMonitor;

    constructor() {
        this.db = new Pool(dbConfig);
        this.indexers = new Map();
        this.providers = new Map();
        this.healthMonitor = new IndexerHealthMonitor(this.db, new Map());
    }

    async start() {
        try {
            // Initialize database connection
            await this.db.query('SELECT NOW()');
            logger.info('Database connection established');

            // Get enabled chains from environment variable or use all chains
            const enabledChains = process.env.ENABLED_CHAINS?.toLowerCase().split(',') || Object.keys(chains);
            logger.info(`ENABLED_CHAINS: ${process.env.ENABLED_CHAINS}, effective enabledChains: ${enabledChains.join(',')}`);
            
            // Initialize providers and indexers for each chain
            for (const chainName of enabledChains) {
                logger.info(`Attempting to initialize indexer for chain: ${chainName}`);
                const chainConfig = chains[chainName];
                if (!chainConfig) {
                    logger.warn(`Chain ${chainName} not found in configuration`);
                    continue;
                }

                try {
                    // Initialize provider with health monitoring
                    const provider = new RPCProvider(chainConfig);
                    this.providers.set(chainConfig.id.toString(), provider);

                    // Initialize and start indexer
                    const indexer = new ChainIndexer(chainConfig, provider, this.db);
                    this.indexers.set(chainConfig.id.toString(), indexer);

                    // Start indexing
                    await indexer.start();
                    logger.info(`Started indexer for ${chainName}`);

                } catch (error) {
                    logger.error(`Error initializing chain ${chainName}:`, error);
                }
            }

            // Start health monitoring
            await this.startHealthMonitoring();

        } catch (error) {
            logger.error('Error starting indexer manager:', error);
            throw error;
        }
    }

    private async startHealthMonitoring() {
        // Update provider map for health monitor
        const providerMap = new Map();
        for (const [chainId, provider] of this.providers.entries()) {
            const chain = Object.values(chains).find(c => c.id.toString() === chainId);
            if (chain) {
                providerMap.set(chainId, {
                    chainId,
                    name: chain.name,
                    rpcUrl: chain.rpcUrls[0],
                    provider: await provider.getProvider()
                });
            }
        }

        this.healthMonitor = new IndexerHealthMonitor(this.db, providerMap);
        await this.healthMonitor.start();
        logger.info('Health monitoring started');
    }

    async stop() {
        logger.info('Stopping indexer manager...');

        // Stop all indexers
        for (const [chainId, indexer] of this.indexers.entries()) {
            try {
                await indexer.stop();
                logger.info(`Stopped indexer for chain ${chainId}`);
            } catch (error) {
                logger.error(`Error stopping indexer for chain ${chainId}:`, error);
            }
        }

        // Stop health monitoring
        this.healthMonitor.cleanup();

        // Cleanup providers
        for (const provider of this.providers.values()) {
            provider.cleanup();
        }

        // Close database connection
        await this.db.end();
        logger.info('Indexer manager stopped');
    }
}

// Handle process termination
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    const manager = new IndexerManager();
    await manager.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    const manager = new IndexerManager();
    await manager.stop();
    process.exit(0);
});

// Start the indexer
const manager = new IndexerManager();
manager.start().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
}); 