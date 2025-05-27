import { Pool } from 'pg';
import { logger } from './utils/logger';
import { chains, getDbConfig, ChainConfig } from './config';
import { RPCProvider } from './provider';
import { ChainIndexer, ensureSchemaIsApplied } from './indexer/chain-indexer';
import { IndexerHealthMonitor } from './indexer/health';

class IndexerManager {
    private db: Pool; // Single database for all chains
    private providers: Map<string, RPCProvider>;
    private indexers: Map<string, ChainIndexer>;
    private healthMonitor: IndexerHealthMonitor | null = null;
    private enabledChains: string[];

    constructor() {
        this.providers = new Map();
        this.indexers = new Map();

        // Parse enabled chains from environment variable
        const enabledChainsEnv = process.env.ENABLED_CHAINS || '';
        this.enabledChains = enabledChainsEnv 
            ? enabledChainsEnv.split(',').map(chain => chain.trim())
            : Object.keys(chains);

        logger.info(`ENABLED_CHAINS: ${enabledChainsEnv}, effective enabledChains: ${this.enabledChains.join(',')}`);

        // Initialize single database connection
        this.db = new Pool(getDbConfig());
    }

    async start() {
        try {
            // Test database connection
            await this.db.connect();
            logger.info('Database connection established');

            // Ensure schema is applied to the single database
            await ensureSchemaIsApplied(this.db);

            // Initialize providers and indexers for each enabled chain
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
        // Create a map with the single database for all chains
        const dbMap = new Map<string, Pool>();
        for (const chainKey of this.enabledChains) {
            const chainConfig = chains[chainKey];
            if (chainConfig) {
                dbMap.set(chainConfig.id.toString(), this.db);
            }
        }
        
        // Also add a 'System' entry for global health queries
        dbMap.set('System', this.db);

        this.healthMonitor = new IndexerHealthMonitor(dbMap, this.providers);
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

            // Create indexer instance using the shared database
            const indexer = new ChainIndexer(chainId, provider, this.db, chainConfig);
            this.indexers.set(chainId, indexer);

            // Ensure chain exists in database
            await this.ensureChainExists(chainId, chainConfig);

            // Create or update chain statistics record
            await this.initializeChainStats(chainId);

        } catch (error) {
            logger.error(`Error initializing chain ${chainKey}:`, error);
            throw error; // Re-throw to prevent partial initialization
        }
    }

    private async initializeChainStats(chainId: string) {
        try {
            await this.db.query(`SELECT update_chain_stats($1)`, [chainId]);
            logger.info(`Initialized chain statistics for chain ${chainId}`);
        } catch (error) {
            logger.error(`Error initializing chain statistics for ${chainId}:`, error);
            // Don't throw here, just log the error
        }
    }

    private async ensureChainExists(chainId: string, chainConfig: ChainConfig) {
        try {
            // Check if chain already exists
            const { rows } = await this.db.query(
                'SELECT chain_id FROM chains WHERE chain_id = $1',
                [chainId]
            );

            if (rows.length === 0) {
                // Insert new chain
                await this.db.query(
                    'INSERT INTO chains (chain_id, name, rpc_url, start_block) VALUES ($1, $2, $3, $4)',
                    [chainId, chainConfig.name, chainConfig.rpcUrls[0], chainConfig.startBlock]
                );
                logger.info(`Added new chain to database: ${chainConfig.name} (${chainId})`);
            } else {
                // Update existing chain
                await this.db.query(
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