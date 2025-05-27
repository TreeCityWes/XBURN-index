import { Pool } from 'pg';
import { logger } from './utils/logger';
import { chains, getDbConfig, ChainConfig } from './config';
import { RPCProvider } from './provider';
import { ChainIndexer, ensureSchemaIsApplied } from './indexer/chain-indexer';
import { IndexerHealthMonitor } from './indexer/health';

class IndexerManager {
    private dbs: Map<string, Pool>;
    private providers: Map<string, RPCProvider>;
    private indexers: Map<string, ChainIndexer>;
    private healthMonitor: IndexerHealthMonitor | null = null;
    private enabledChains: string[];

    constructor() {
        this.dbs = new Map();
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
            // Initialize databases, providers and indexers for each chain
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
        // Pass the maps of databases and providers to the health monitor
        this.healthMonitor = new IndexerHealthMonitor(this.dbs, this.providers);
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

        // Close all database connections
        for (const db of this.dbs.values()) {
            await db.end();
        }
        
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

            // Initialize database connection
            const db = new Pool(getDbConfig(chainId));
            await db.connect(); // Test connection
            this.dbs.set(chainId, db);
            logger.info(`Database connection established for chain ${chainKey}`);

            // Ensure schema is applied
            await ensureSchemaIsApplied(db);

            // Initialize provider
            const provider = new RPCProvider(chainId, chainConfig.name, chainConfig.rpcUrls);
            this.providers.set(chainId, provider);

            // Create indexer instance
            const indexer = new ChainIndexer(chainId, provider, db, chainConfig);
            this.indexers.set(chainId, indexer);

            // Ensure chain exists in database
            await this.ensureChainExists(chainId, chainConfig, db);

            // Create or update chain statistics record
            await this.initializeChainStats(chainId, db);

        } catch (error) {
            logger.error(`Error initializing chain ${chainKey}:`, error);
            throw error; // Re-throw to prevent partial initialization
        }
    }

    private async initializeChainStats(chainId: string, db: Pool) {
        try {
            await db.query(`SELECT update_chain_stats($1)`, [chainId]);
            logger.info(`Initialized chain statistics for chain ${chainId}`);
        } catch (error) {
            logger.error(`Error initializing chain statistics for ${chainId}:`, error);
            throw error;
        }
    }

    private async ensureChainExists(chainId: string, chainConfig: ChainConfig, db: Pool) {
        try {
            // Check if chain already exists
            const { rows } = await db.query(
                'SELECT chain_id FROM chains WHERE chain_id = $1',
                [chainId]
            );

            if (rows.length === 0) {
                // Insert new chain
                await db.query(
                    'INSERT INTO chains (chain_id, name, rpc_url, start_block) VALUES ($1, $2, $3, $4)',
                    [chainId, chainConfig.name, chainConfig.rpcUrls[0], chainConfig.startBlock]
                );
                logger.info(`Added new chain to database: ${chainConfig.name} (${chainId})`);
            } else {
                // Update existing chain
                await db.query(
                    'UPDATE chains SET name = $2, rpc_url = $3, start_block = $4, updated_at = NOW() WHERE chain_id = $1',
                    [chainId, chainConfig.name, chainConfig.rpcUrls[0], chainConfig.startBlock]
                );
                logger.debug(`Updated existing chain in database: ${chainConfig.name} (${chainId})`);
            }
        } catch (error) {
            logger.error(`Error ensuring chain exists in database for ${chainConfig.name}:`, error);
            throw error;
        }
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