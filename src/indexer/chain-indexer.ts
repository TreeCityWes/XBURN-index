import { ethers } from 'ethers';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { RPCProvider } from '../provider';
import { ChainConfig } from '../config';
import { indexerConfig } from '../config';

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
    private isRunning: boolean = false;
    private shouldStop: boolean = false;
    private lastProcessedBlock: number = 0;
    // private eventHandlers: Map<string, ethers.Contract>; // Removed

    constructor(chainConfig: ChainConfig, provider: RPCProvider, db: Pool) {
        this.chainConfig = chainConfig;
        this.provider = provider;
        this.db = db;
        this.lastProcessedBlock = chainConfig.startBlock;
        // this.eventHandlers = new Map(); // Removed
        // this.initializeEventHandlers(); // Removed
    }

    // private async initializeEventHandlers() { // Removed
    //     const provider = await this.provider.getProvider();
        
    //     // Initialize contracts with minimal ABI (just the events we need)
    //     const xenContract = new ethers.Contract(
    //         this.chainConfig.contracts.xen,
    //         ['event Transfer(address indexed from, address indexed to, uint256 value)'],
    //         provider
    //     );

    //     const burnContract = new ethers.Contract(
    //         this.chainConfig.contracts.xburnMinter,
    //         ['event XENBurned(address indexed user, uint256 amount)'],
    //         provider
    //     );

    //     const nftContract = new ethers.Contract(
    //         this.chainConfig.contracts.xburnNft,
    //         ['event BurnLockCreated(address indexed user, uint256 indexed tokenId, uint256 amount, uint256 lockDuration)'],
    //         provider
    //     );

    //     this.eventHandlers.set('xen', xenContract);
    //     this.eventHandlers.set('burn', burnContract);
    //     this.eventHandlers.set('nft', nftContract);
    // }

    async start() {
        if (this.isRunning) {
            logger.warn(`Indexer for chain ${this.chainConfig.name} already running`);
            return;
        }

        this.isRunning = true;
        this.shouldStop = false;

        try {
            // Get last indexed block from database
            const { rows: [chainData] } = await this.db.query(
                'SELECT last_indexed_block FROM chains WHERE chain_id = $1',
                [this.chainConfig.id.toString()]
            );

            if (chainData?.last_indexed_block) {
                // Go back REORG_DEPTH blocks to handle chain reorganizations
                this.lastProcessedBlock = Math.max(
                    chainData.last_indexed_block - REORG_DEPTH,
                    this.chainConfig.startBlock
                );
            }

            logger.info(`Starting indexer for ${this.chainConfig.name} from block ${this.lastProcessedBlock}`);
            await this.startIndexing();
        } catch (error) {
            logger.error(`Error starting indexer for ${this.chainConfig.name}:`, error);
            this.isRunning = false;
        }
    }

    async stop() {
        logger.info(`Stopping indexer for ${this.chainConfig.name}`);
        this.shouldStop = true;
        // Wait for current operations to complete
        while (this.isRunning) {
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

    private async startIndexing() {
        this.isRunning = true;
        
        while (!this.shouldStop) {
            try {
                const provider = await this.provider.getProvider();
                const latestBlock = await provider.getBlockNumber();
                
                if (this.lastProcessedBlock >= latestBlock) {
                    // Wait for new blocks - use indexerConfig.pollingInterval
                    logger.debug(`Chain ${this.chainConfig.name} caught up to latest block ${latestBlock}. Waiting ${indexerConfig.pollingInterval}ms.`);
                    await new Promise(resolve => setTimeout(resolve, indexerConfig.pollingInterval));
                    continue;
                }

                // Use global batch size from indexerConfig
                const batchSize = indexerConfig.batchSize;
                const startBlockNum = this.lastProcessedBlock + 1;
                const endBlockNum = Math.min(startBlockNum + batchSize - 1, latestBlock);
                
                logger.info(`Processing batch for ${this.chainConfig.name}: ${startBlockNum} to ${endBlockNum} (latest: ${latestBlock})`);
                await this.processBatch(startBlockNum, endBlockNum);
                
                // Update last processed block
                this.lastProcessedBlock = endBlockNum;

                // Update chain status
                await this.updateChainStatus(this.lastProcessedBlock);

            } catch (error) {
                logger.error(`Error in indexing loop for ${this.chainConfig.name}:`, error);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        this.isRunning = false;
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
            [lastBlock, this.chainConfig.id.toString()]
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
} 