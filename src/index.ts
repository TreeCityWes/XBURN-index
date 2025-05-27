import { Pool } from 'pg';
import { logger } from './utils/logger';
import { chains, dbConfig } from './config';
import { RPCProvider } from './provider';
import { ChainIndexer, ensureSchemaIsApplied } from './indexer/chain-indexer';
import { IndexerHealthMonitor } from './indexer/health';

class IndexerManager {
    private db: Pool;
    private providers: Map<string, RPCProvider>;
    private indexers: Map<string, ChainIndexer>;
    private healthMonitor: IndexerHealthMonitor | null = null;
    private enabledChains: string[];

    constructor() {
        this.db = new Pool(dbConfig);
        this.providers = new Map();
        this.indexers = new Map();

        // Parse enabled chains from environment variable
        const enabledChainsEnv = process.env.ENABLED_CHAINS || '';
        this.enabledChains = enabledChainsEnv 
            ? enabledChainsEnv.split(',')
            : Object.keys(chains);

        logger.info(`ENABLED_CHAINS: ${enabledChainsEnv}, effective enabledChains: ${this.enabledChains.join(',')}`);
    }

    async start() {
        try {
            await this.db.connect();
            logger.info('Database connection established');

            // Ensure the schema is applied
            await ensureSchemaIsApplied(this.db);

            // Initialize providers and indexers for each chain
            for (const chainKey of this.enabledChains) {
                await this.initializeChain(chainKey);
            }

            // Start health monitoring
            await this.startHealthMonitoring();

            // Start all indexers
            for (const [chainId, indexer] of this.indexers.entries()) {
                await indexer.start();
            }

        } catch (error) {
            logger.error('Error starting indexer manager:', error);
            throw error;
        }
    }

    private async startHealthMonitoring() {
        // Pass the live RPCProvider map to the health monitor
        this.healthMonitor = new IndexerHealthMonitor(this.db, this.providers);
        await this.healthMonitor.start();
        logger.info('Health monitoring started');
    }

    async stop() {
        logger.info('Stopping indexer manager...');

        // Stop all indexers
        for (const indexer of this.indexers.values()) {
            await indexer.stop();
        }

        // Stop health monitor
        if (this.healthMonitor) {
            this.healthMonitor.cleanup();
        }

        // Close database connection
        await this.db.end();
        logger.info('Indexer manager stopped');
    }

    private async initializeChain(chainKey: string) {
        const chainConfig = chains[chainKey];
        if (!chainConfig) {
            logger.warn(`No configuration found for chain key: ${chainKey}`);
            return;
        }

        try {
            const chainId = chainConfig.id.toString();
            logger.info(`Attempting to initialize indexer for chain: ${chainKey}`);

            // Initialize provider
            const provider = new RPCProvider(chainId, chainConfig.name, chainConfig.rpcUrls);
            this.providers.set(chainId, provider);

            // Create indexer instance
            const indexer = new ChainIndexer(chainId, provider, this.db, chainConfig);
            this.indexers.set(chainId, indexer);

            // Ensure chain exists in database
            await this.ensureChainExists(chainId, chainConfig);

        } catch (error) {
            logger.error(`Error initializing chain ${chainKey}:`, error);
        }
    }

    private async ensureChainExists(chainId: string, chainConfig: ChainConfig) {
        // Implementation of ensureChainExists method
    }
}

// Start the indexer
const manager = new IndexerManager();

// Handle process termination
async function gracefulShutdown(signal: string) {
    logger.info(`Received ${signal} signal`);
    if (manager) {
        await manager.stop();
    }
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

manager.start().catch(error => {
    logger.error('Fatal error during indexer manager startup:', error);
    gracefulShutdown('FATAL_ERROR').then(() => process.exit(1));
}); 