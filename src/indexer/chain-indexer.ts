import { ethers } from 'ethers';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { RPCProvider } from '../provider';
import { ChainConfig } from '../config';
import { indexerConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

const REORG_DEPTH = 20;
const MAX_RETRIES = 10;
const MAX_BACKOFF_DELAY = 60000; // Maximum backoff delay of 60 seconds

interface ProcessedEvent {
    contract: string;
    event: ethers.EventLog;
    args: ethers.Result;
}

// Define ABIs centrally
const XEN_CONTRACT_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const BURN_CONTRACT_ABI = ['event XENBurned(address indexed user, uint256 amount)'];
// const NFT_CONTRACT_ABI = ['event BurnLockCreated(address indexed user, uint256 indexed tokenId, uint256 amount, uint256 lockDuration)']; // Assuming not used based on processEvents

export class ChainIndexer {
    private provider: RPCProvider;
    private db: Pool;
    private chainConfig: ChainConfig;
    private chainId: string;
    private running: boolean = false;
    private stopRequested: boolean = false;
    private lastProcessedBlock: number | null = null;
    private _batchSize: number;

    constructor(chainId: string, provider: RPCProvider, db: Pool, chainConfig: ChainConfig) {
        this.chainId = chainId;
        this.provider = provider;
        this.db = db;
        this.chainConfig = chainConfig;
        // Use chain-specific batch size if defined, otherwise use global config
        this._batchSize = chainConfig.batchSize || indexerConfig.batchSize;
    }

    async start() {
        if (this.running) {
            logger.warn(`Indexer already running for chain ${this.chainId}`, {
                chainName: this.chainConfig.name
            });
            return;
        }

        this.running = true;
        this.stopRequested = false;

        try {
            // Get the last indexed block from the database
            const { rows } = await this.db.query(
                'SELECT last_indexed_block FROM chains WHERE chain_id = $1',
                [this.chainId]
            );

            let startBlock = this.chainConfig.startBlock;
            if (rows.length > 0 && rows[0].last_indexed_block) {
                // If we have processed blocks before, start from the last processed block
                // minus REORG_DEPTH to handle potential chain reorganizations
                startBlock = Math.max(this.chainConfig.startBlock, rows[0].last_indexed_block - REORG_DEPTH);
            }

            logger.info(`Starting indexer for ${this.chainConfig.name} from block ${startBlock}`, {
                chainName: this.chainConfig.name
            });

            this.lastProcessedBlock = startBlock;
            this.indexLoop();
        } catch (error) {
            logger.error(`Error starting indexer for chain ${this.chainId}:`, {
                chainName: this.chainConfig.name,
                error: error instanceof Error ? error : new Error(String(error))
            });
            this.running = false;
        }
    }

    async stop() {
        logger.info(`Stopping indexer for ${this.chainConfig.name}`);
        this.stopRequested = true;
        // Wait for current operations to complete
        while (this.running) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    private async exponentialBackoff(retryCount: number): Promise<void> {
        // Use global retryDelay and maxBackoffDelay from indexerConfig for consistency
        const delay = Math.min(indexerConfig.retryDelay * Math.pow(2, retryCount), indexerConfig.maxBackoffDelay);
        logger.debug(`Exponential backoff: waiting ${delay}ms for chain ${this.chainConfig.name}`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    private async processBatch(startBlock: number, endBlock: number, retryCount: number = 0): Promise<void> {
        try {
            const events = await Promise.all([
                this.getTransferEvents(startBlock, endBlock),
                this.getBurnEvents(startBlock, endBlock)
            ]);

            await this.processEvents(events.flat());

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const shouldRetry = (
                errorMessage.includes('rate limit') || 
                errorMessage.includes('429') ||
                errorMessage.includes('exceeded') ||
                errorMessage.includes('too many requests') ||
                errorMessage.includes('timeout')
            );

            if (shouldRetry && retryCount < MAX_RETRIES) {
                logger.warn(`Rate limit hit for ${this.chainConfig.name}, retry ${retryCount + 1}/${MAX_RETRIES}`);
                await this.exponentialBackoff(retryCount);
                return this.processBatch(startBlock, endBlock, retryCount + 1);
            }
            throw error;
        }
    }

    private async indexLoop() {
        if (!this.running || this.stopRequested) {
            this.running = false;
            return;
        }

        try {
            const provider = await this.provider.getProvider();
            const latestBlock = await provider.getBlockNumber();
            
            if (this.lastProcessedBlock === null) {
                throw new Error(`Last processed block is null for chain ${this.chainId}`);
            }

            // Only proceed if there are new blocks to process
            if (latestBlock > this.lastProcessedBlock) {
                // Calculate end block for this batch
                const endBlock = Math.min(
                    this.lastProcessedBlock + this.batchSize, // Use the chain-specific batch size
                    latestBlock
                );

                logger.info(`Processing batch for ${this.chainConfig.name}: ${this.lastProcessedBlock + 1} to ${endBlock} (latest: ${latestBlock})`, {
                    chainName: this.chainConfig.name
                });

                await this.processBatch(this.lastProcessedBlock + 1, endBlock);
                this.lastProcessedBlock = endBlock;

                // Update the last indexed block in the database
                await this.db.query(
                    'UPDATE chains SET last_indexed_block = $1, updated_at = NOW() WHERE chain_id = $2',
                    [endBlock, this.chainId]
                );
            }

            // Schedule the next iteration
            setTimeout(() => this.indexLoop(), indexerConfig.pollingInterval);
        } catch (error) {
            logger.error(`Error in indexing loop for ${this.chainConfig.name}: ${error}`, {
                chainName: this.chainConfig.name,
                error: error instanceof Error ? error : new Error(String(error))
            });

            // On error, wait and retry
            setTimeout(() => this.indexLoop(), indexerConfig.pollingInterval);
        }
    }

    private async getTransferEvents(startBlock: number, endBlock: number): Promise<ProcessedEvent[]> {
        const currentProvider = await this.provider.getProvider();
        const xenContract = new ethers.Contract(this.chainConfig.contracts.xen, XEN_CONTRACT_ABI, currentProvider);
        const xenEvents = await xenContract.queryFilter('Transfer', startBlock, endBlock);
        return xenEvents.map(event => ({
            contract: 'xen',
            event: event as ethers.EventLog,
            args: (event as ethers.EventLog).args
        }));
    }

    private async getBurnEvents(startBlock: number, endBlock: number): Promise<ProcessedEvent[]> {
        const currentProvider = await this.provider.getProvider();
        const burnContract = new ethers.Contract(this.chainConfig.contracts.xburnMinter, BURN_CONTRACT_ABI, currentProvider);
        const burnEvents = await burnContract.queryFilter('XENBurned', startBlock, endBlock);
        return burnEvents.map(event => ({
            contract: 'burn',
            event: event as ethers.EventLog,
            args: (event as ethers.EventLog).args
        }));
    }

    private async processEvents(events: ProcessedEvent[]) {
        if (!events.length) return;

        const startTime = Date.now();
        let burnsIndexed = 0;
        let positionsIndexed = 0;

        try {
            logger.debug(`Processing blocks ${events[0].event.blockNumber} to ${events[events.length - 1].event.blockNumber} on ${this.chainConfig.name}`);

            // Start a transaction
            const client = await this.db.connect();
            try {
                await client.query('BEGIN');

                // Process events
                for (const { contract, event, args } of events) {
                    if (contract === 'xen') {
                        if (args['to'].toLowerCase() === this.chainConfig.contracts.xburnMinter.toLowerCase()) {
                            await client.query(
                                'INSERT INTO xen_burns (chain_id, tx_hash, block_number, from_address, amount) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
                                [this.chainConfig.id.toString(), event.transactionHash, event.blockNumber, args['from'], args['value'].toString()]
                            );
                            burnsIndexed++;
                        }
                    } else if (contract === 'burn') {
                        await client.query(
                            'INSERT INTO xen_burns (chain_id, tx_hash, block_number, from_address, amount) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
                            [this.chainConfig.id.toString(), event.transactionHash, event.blockNumber, args['user'], args['amount'].toString()]
                        );
                        burnsIndexed++;
                    }
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

            // Log performance metrics
            const duration = Date.now() - startTime;
            await this.db.query(
                'SELECT log_indexing_performance($1, $2, $3, $4, $5, $6)',
                [this.chainConfig.id.toString(), events[0].event.blockNumber, events[events.length - 1].event.blockNumber, burnsIndexed, positionsIndexed, duration]
            );

            // Update statistics if needed
            if (events[events.length - 1].event.blockNumber % 1000 === 0) {
                await this.updateChainStats();
            }

        } catch (error) {
            logger.error(`Error processing batch ${events[0].event.blockNumber}-${events[events.length - 1].event.blockNumber} on ${this.chainConfig.name}:`, error);
            throw error;
        }
    }

    private async updateChainStatus(lastBlock: number) {
        await this.db.query(
            'UPDATE chains SET last_indexed_block = $1, updated_at = NOW() WHERE chain_id = $2',
            [lastBlock, this.chainId]
        );
    }

    private async updateChainStats() {
        try {
            await this.db.query('SELECT update_chain_token_stats($1)', [this.chainConfig.id.toString()]);
            await this.db.query('SELECT update_chain_stats($1)', [this.chainConfig.id.toString()]);
        } catch (error) {
            logger.error(`Error updating chain stats for ${this.chainConfig.name}:`, error);
        }
    }

    // Add a batch size getter to be used in indexLoop
    get batchSize() {
        return this._batchSize;
    }
}

// Add a function to execute the schema.sql file on startup
export async function ensureSchemaIsApplied(db: Pool): Promise<void> {
    try {
        const schemaPath = path.resolve(__dirname, '../../schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the schema SQL in a way that ignores already existing constraints
        const client = await db.connect();
        try {
            // Begin transaction
            await client.query('BEGIN');
            
            // Set client_min_messages to warning to suppress notices
            await client.query('SET client_min_messages TO warning');
            
            // Execute the schema
            await client.query(schema);
            
            // Commit the transaction
            await client.query('COMMIT');
            
            logger.info('Schema applied successfully', {
                chainName: 'System'
            });
        } catch (error) {
            // Rollback transaction on error
            await client.query('ROLLBACK');
            
            // Check if this is a duplicate constraint error
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('already exists')) {
                logger.warn('Schema partially applied - some objects already exist', {
                    chainName: 'System',
                    error: errorMsg
                });
                // Continue execution even though there was an error with duplicate constraints
                return;
            }
            
            // Re-throw other errors
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Error applying schema:', {
            chainName: 'System',
            error: error instanceof Error ? error : new Error(String(error))
        });
        
        // Re-throw the error to be handled by the caller
        throw error;
    }
} 