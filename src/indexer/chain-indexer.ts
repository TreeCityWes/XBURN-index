import { ethers, EventLog, Result } from 'ethers';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { RPCProvider } from '../provider';
import { ChainConfig } from '../config';
import { indexerConfig } from '../config';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REORG_DEPTH = 20;
const MAX_RETRIES = 10;
const MAX_BACKOFF_DELAY = 60000; // Maximum backoff delay of 60 seconds

interface ProcessedEvent {
    contract: string;
    event: ethers.EventLog;
    args: Result;
    blockTimestamp: number;
}

interface BlockEvent {
    blockNumber: number;
    transactionHash: string;
    eventName: string;
}

interface EventData extends BlockEvent {
    args: Record<string, any>;
}

// Cache for block timestamps to reduce RPC calls
const blockTimestampCache = new Map<number, number>();

// Define ABIs centrally
const XEN_CONTRACT_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const BURN_CONTRACT_ABI = [
    'event XENBurned(address indexed user, uint256 amount)',
    'event SwapAndBurn(address indexed user, address token, uint256 tokenAmount, uint256 xenAmount)',
    'event LiquidityAdded(address indexed user, address token, uint256 tokenAmount, uint256 xenAmount)'
];
const NFT_CONTRACT_ABI = ['event BurnLockCreated(address indexed user, uint256 indexed tokenId, uint256 amount, uint256 lockDuration)'];

interface ChainValidation {
    isValid: boolean;
    errors: string[];
}

async function validateChainConfig(chainConfig: ChainConfig, provider: ethers.Provider): Promise<ChainValidation> {
    const errors: string[] = [];
    
    try {
        // Check if we can get the current block
        const currentBlock = await provider.getBlockNumber();
        
        // Validate start block
        if (chainConfig.startBlock > currentBlock) {
            errors.push(`Start block (${chainConfig.startBlock}) is greater than current block (${currentBlock})`);
        }

        // Validate gas price if specified
        if (chainConfig.gasPrice) {
            const currentGasPrice = await provider.getFeeData();
            const configGasPrice = ethers.parseUnits(chainConfig.gasPrice, 'gwei');
            if (currentGasPrice.gasPrice && configGasPrice > currentGasPrice.gasPrice) {
                errors.push(`Configured gas price (${chainConfig.gasPrice} gwei) is higher than current network gas price`);
            }
        }

        // Validate batch size
        if (chainConfig.batchSize) {
            if (chainConfig.batchSize < 10 || chainConfig.batchSize > 10000) {
                errors.push(`Invalid batch size: ${chainConfig.batchSize} (must be between 10 and 10000)`);
            }
        }

    } catch (error) {
        errors.push(`Chain validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

async function verifyContract(provider: ethers.Provider, address: string, abi: string[]): Promise<boolean> {
    try {
        const code = await provider.getCode(address);
        return code !== '0x' && code !== '0x0';
    } catch (error) {
        logger.error(`Error verifying contract at ${address}:`, error);
        return false;
    }
}

export class ChainIndexer {
    private provider: RPCProvider;
    private db: Pool;
    private chainConfig: ChainConfig;
    private chainId: string;
    private running: boolean = false;
    private stopRequested: boolean = false;
    private lastProcessedBlock: number | null = null;
    private _batchSize: number;
    private contracts: {
        xen: ethers.Contract;
        burn: ethers.Contract;
        nft: ethers.Contract;
    } | null = null;

    constructor(chainId: string, provider: RPCProvider, db: Pool, chainConfig: ChainConfig) {
        this.chainId = chainId;
        this.provider = provider;
        this.db = db;
        this.chainConfig = chainConfig;
        this._batchSize = chainConfig.batchSize || indexerConfig.batchSize;
    }

    private async initializeContracts() {
        if (this.contracts) return;

        const provider = await this.provider.getProvider();

        // Verify contracts exist
        const xenValid = await verifyContract(provider, this.chainConfig.contracts.xen, XEN_CONTRACT_ABI);
        const burnValid = await verifyContract(provider, this.chainConfig.contracts.xburnMinter, BURN_CONTRACT_ABI);
        const nftValid = await verifyContract(provider, this.chainConfig.contracts.xburnNft, NFT_CONTRACT_ABI);

        if (!xenValid || !burnValid || !nftValid) {
            throw new Error(
                `Invalid contract addresses for chain ${this.chainConfig.name}:\n` +
                `XEN: ${this.chainConfig.contracts.xen} (${xenValid})\n` +
                `Burn: ${this.chainConfig.contracts.xburnMinter} (${burnValid})\n` +
                `NFT: ${this.chainConfig.contracts.xburnNft} (${nftValid})`
            );
        }

        this.contracts = {
            xen: new ethers.Contract(this.chainConfig.contracts.xen, XEN_CONTRACT_ABI, provider),
            burn: new ethers.Contract(this.chainConfig.contracts.xburnMinter, BURN_CONTRACT_ABI, provider),
            nft: new ethers.Contract(this.chainConfig.contracts.xburnNft, NFT_CONTRACT_ABI, provider)
        };

        logger.info(`Contracts verified for chain ${this.chainConfig.name}`, {
            chainName: this.chainConfig.name,
            contracts: {
                xen: this.chainConfig.contracts.xen,
                burn: this.chainConfig.contracts.xburnMinter,
                nft: this.chainConfig.contracts.xburnNft
            }
        });
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
            // Validate chain configuration
            const provider = await this.provider.getProvider();
            const validation = await validateChainConfig(this.chainConfig, provider);
            
            if (!validation.isValid) {
                throw new Error(
                    `Invalid chain configuration for ${this.chainConfig.name}:\n` +
                    validation.errors.join('\n')
                );
            }

            await this.initializeContracts();

            // Get the last indexed block from the database
            const { rows } = await this.db.query(
                'SELECT last_indexed_block FROM chains WHERE chain_id = $1',
                [this.chainId]
            );

            let startBlock = this.chainConfig.startBlock;
            if (rows.length > 0 && rows[0].last_indexed_block) {
                startBlock = Math.max(this.chainConfig.startBlock, rows[0].last_indexed_block - REORG_DEPTH);
            }

            logger.info(`Starting indexer for ${this.chainConfig.name} from block ${startBlock}`, {
                chainName: this.chainConfig.name,
                config: {
                    batchSize: this._batchSize,
                    gasPrice: this.chainConfig.gasPrice,
                    startBlock: startBlock
                }
            });

            this.lastProcessedBlock = startBlock;
            await this.indexLoop();
        } catch (error) {
            logger.error(`Error starting indexer for chain ${this.chainId}:`, {
                chainName: this.chainConfig.name,
                error: error instanceof Error ? error : new Error(String(error))
            });
            this.running = false;
            throw error;
        }
    }

    async stop() {
        logger.info(`Stopping indexer for ${this.chainConfig.name}`);
        this.stopRequested = true;
        while (this.running) {
            await new Promise<void>(resolve => setTimeout(resolve, 1000));
        }
    }

    private async exponentialBackoff(retryCount: number): Promise<void> {
        const delay = Math.min(indexerConfig.retryDelay * Math.pow(2, retryCount), indexerConfig.maxBackoffDelay);
        logger.debug(`Exponential backoff: waiting ${delay}ms for chain ${this.chainConfig.name}`);
        await new Promise<void>(resolve => setTimeout(resolve, delay));
    }

    private async getBlockTimestamp(blockNumber: number): Promise<number> {
        // Check cache first
        const cachedTimestamp = blockTimestampCache.get(blockNumber);
        if (cachedTimestamp) return cachedTimestamp;

        const provider = await this.provider.getProvider();
        const block = await provider.getBlock(blockNumber);
        const timestamp = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);

        // Cache the result
        blockTimestampCache.set(blockNumber, timestamp);

        // Clear old cache entries (keep last 1000 blocks)
        if (blockTimestampCache.size > 1000) {
            const oldestBlock = Math.min(...blockTimestampCache.keys());
            blockTimestampCache.delete(oldestBlock);
        }

        return timestamp;
    }

    private async fetchBlockTimestamps(events: ethers.EventLog[]): Promise<Map<number, number>> {
        const blockNumbers = [...new Set(events.map(event => event.blockNumber))];
        const timestamps = new Map<number, number>();

        await Promise.all(
            blockNumbers.map(async (blockNum) => {
                const timestamp = await this.getBlockTimestamp(blockNum);
                timestamps.set(blockNum, timestamp);
            })
        );

        return timestamps;
    }

    private async processBatch(startBlock: number, endBlock: number, retryCount: number = 0): Promise<void> {
        try {
            // Fetch all events in parallel
            const xenEvents: ethers.EventLog[] = (await this.contracts?.xen.queryFilter('Transfer', startBlock, endBlock)) as ethers.EventLog[] || [];
            const burnEvents: ethers.EventLog[] = (await this.contracts?.burn.queryFilter('XENBurned', startBlock, endBlock)) as ethers.EventLog[] || [];
            const nftEvents: ethers.EventLog[] = (await this.contracts?.nft.queryFilter('BurnLockCreated', startBlock, endBlock)) as ethers.EventLog[] || [];
            const swapEvents: ethers.EventLog[] = (await this.contracts?.burn.queryFilter('SwapAndBurn', startBlock, endBlock)) as ethers.EventLog[] || [];
            const liquidityEvents: ethers.EventLog[] = (await this.contracts?.burn.queryFilter('LiquidityAdded', startBlock, endBlock)) as ethers.EventLog[] || [];

            // Get timestamps for all blocks at once
            const allEvents: ethers.EventLog[] = [...xenEvents, ...burnEvents, ...nftEvents, ...swapEvents, ...liquidityEvents];
            const blockTimestamps = await this.fetchBlockTimestamps(allEvents);

            // Process events in batches of 100 to avoid memory issues
            const BATCH_SIZE = 100;
            const processedEvents: ProcessedEvent[] = [];

            for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
                const batch = allEvents.slice(i, i + BATCH_SIZE);
                const batchProcessed = batch.map(event => {
                    const timestamp = blockTimestamps.get(event.blockNumber) || Math.floor(Date.now() / 1000);
                    let contract = 'unknown';
                    
                    if (event.address.toLowerCase() === this.chainConfig.contracts.xen.toLowerCase()) {
                        contract = 'xen';
                    } else if (event.address.toLowerCase() === this.chainConfig.contracts.xburnMinter.toLowerCase()) {
                        contract = event.eventName === 'XENBurned' ? 'burn' :
                                 event.eventName === 'SwapAndBurn' ? 'swapAndBurn' :
                                 event.eventName === 'LiquidityAdded' ? 'liquidityAdded' : 'unknown';
                    } else if (event.address.toLowerCase() === this.chainConfig.contracts.xburnNft.toLowerCase()) {
                        contract = 'nft';
                    }

                    return {
                        contract,
                        event: event,
                        args: event.args,
                        blockTimestamp: timestamp
                    };
                });

                processedEvents.push(...batchProcessed);
            }

            await this.processEvents(processedEvents);

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
            
            if (!this.lastProcessedBlock) {
                throw new Error(`Last processed block is null for chain ${this.chainId}`);
            }

            if (latestBlock > this.lastProcessedBlock) {
                const endBlock = Math.min(
                    this.lastProcessedBlock + this.batchSize,
                    latestBlock
                );

                logger.info(`Processing batch for ${this.chainConfig.name}: ${this.lastProcessedBlock + 1} to ${endBlock} (latest: ${latestBlock})`, {
                    chainName: this.chainConfig.name
                });

                await this.processBatch(this.lastProcessedBlock + 1, endBlock);
                this.lastProcessedBlock = endBlock;

                await this.db.query(
                    'UPDATE chains SET last_indexed_block = $1, updated_at = NOW() WHERE chain_id = $2',
                    [endBlock, this.chainId]
                );
            }

            setTimeout(() => this.indexLoop(), indexerConfig.pollingInterval);
        } catch (error) {
            logger.error(`Error in indexing loop for ${this.chainConfig.name}: ${error}`, {
                chainName: this.chainConfig.name,
                error: error instanceof Error ? error : new Error(String(error))
            });

            setTimeout(() => this.indexLoop(), indexerConfig.pollingInterval);
        }
    }

    private async processEvents(events: ProcessedEvent[]) {
        if (!events.length) return;

        const startTime = Date.now();
        let burnsIndexed = 0;
        let positionsIndexed = 0;
        let swapsIndexed = 0;
        let liquidityAddedIndexed = 0;

        // Prepare batch inserts
        const xenBurns: any[] = [];
        const nftPositions: any[] = [];
        const swapBurns: any[] = [];
        const liquidityAdds: any[] = [];
        const eventLogs: any[] = [];

        // Group events by type
        for (const { contract, event, args, blockTimestamp } of events) {
            const baseEventLog = {
                chain_id: this.chainConfig.id.toString(),
                contract_type: contract,
                event_type: event.eventName,
                block_number: event.blockNumber,
                tx_hash: event.transactionHash,
                processed_at: new Date(),
                status: 'success'
            };

            try {
                if (contract === 'xen' && args['to']?.toLowerCase() === this.chainConfig.contracts.xburnMinter.toLowerCase()) {
                    xenBurns.push([
                        event.transactionHash,
                        event.blockNumber,
                        args['from'],
                        args['value'].toString(),
                        new Date(blockTimestamp * 1000)
                    ]);
                    burnsIndexed++;
                } else if (contract === 'nft') {
                    nftPositions.push([
                        event.transactionHash,
                        event.blockNumber,
                        args['user'],
                        args['tokenId'].toString(),
                        args['amount'].toString(),
                        args['lockDuration'].toString(),
                        new Date(blockTimestamp * 1000),
                        new Date(blockTimestamp * 1000 + parseInt(args['lockDuration']) * 86400000)
                    ]);
                    positionsIndexed++;
                } else if (contract === 'swapAndBurn') {
                    swapBurns.push([
                        event.transactionHash,
                        event.blockNumber,
                        args['user'],
                        args['token'],
                        args['tokenAmount'].toString(),
                        args['xenAmount'].toString(),
                        new Date(blockTimestamp * 1000)
                    ]);
                    swapsIndexed++;
                } else if (contract === 'liquidityAdded') {
                    liquidityAdds.push([
                        event.transactionHash,
                        event.blockNumber,
                        args['user'],
                        args['token'],
                        args['tokenAmount'].toString(),
                        args['xenAmount'].toString(),
                        new Date(blockTimestamp * 1000)
                    ]);
                    liquidityAddedIndexed++;
                }

                eventLogs.push({ ...baseEventLog });
            } catch (error) {
                eventLogs.push({
                    ...baseEventLog,
                    status: 'error',
                    error_message: error instanceof Error ? error.message : String(error)
                });
                throw error;
            }
        }

        // Execute batch inserts in a transaction
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // Batch insert events
            if (xenBurns.length > 0) {
                await client.query(
                    `INSERT INTO chain_${this.chainId}_xen_burns 
                     (tx_hash, block_number, from_address, amount, block_timestamp)
                     SELECT * FROM UNNEST ($1::text[], $2::bigint[], $3::text[], $4::numeric[], $5::timestamp[])
                     ON CONFLICT (tx_hash) DO NOTHING`,
                    [
                        xenBurns.map(x => x[0]),
                        xenBurns.map(x => x[1]),
                        xenBurns.map(x => x[2]),
                        xenBurns.map(x => x[3]),
                        xenBurns.map(x => x[4])
                    ]
                );
                
                // Update user stats for each burn
                for (const burn of xenBurns) {
                    await client.query(
                        'SELECT update_user_stats($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                        [
                            this.chainId,              // p_chain_id
                            burn[2],                   // p_user_address
                            burn[3],                   // p_xen_burned
                            1,                         // p_burn_count
                            0,                         // p_nft_position_count
                            0,                         // p_xen_locked
                            0,                         // p_swap_burn_count
                            0,                         // p_xen_swapped
                            burn[4]                    // p_timestamp
                        ]
                    );
                }
            }

            if (nftPositions.length > 0) {
                await client.query(
                    `INSERT INTO chain_${this.chainId}_burn_nft_positions 
                     (tx_hash, block_number, user_address, token_id, amount, lock_duration, block_timestamp, maturity_date)
                     SELECT * FROM UNNEST ($1::text[], $2::bigint[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::timestamp[], $8::timestamp[])
                     ON CONFLICT (tx_hash) DO NOTHING`,
                    [
                        nftPositions.map(x => x[0]),
                        nftPositions.map(x => x[1]),
                        nftPositions.map(x => x[2]),
                        nftPositions.map(x => x[3]),
                        nftPositions.map(x => x[4]),
                        nftPositions.map(x => x[5]),
                        nftPositions.map(x => x[6]),
                        nftPositions.map(x => x[7])
                    ]
                );
                
                // Update user stats for each NFT position
                for (const position of nftPositions) {
                    await client.query(
                        'SELECT update_user_stats($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                        [
                            this.chainId,              // p_chain_id
                            position[2],               // p_user_address
                            0,                         // p_xen_burned
                            0,                         // p_burn_count
                            1,                         // p_nft_position_count
                            position[4],               // p_xen_locked
                            0,                         // p_swap_burn_count
                            0,                         // p_xen_swapped
                            position[6]                // p_timestamp
                        ]
                    );
                }
            }

            if (swapBurns.length > 0) {
                await client.query(
                    `INSERT INTO chain_${this.chainId}_swap_burns 
                     (tx_hash, block_number, user_address, token_address, token_amount, xen_amount, block_timestamp)
                     SELECT * FROM UNNEST ($1::text[], $2::bigint[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::timestamp[])
                     ON CONFLICT (tx_hash) DO NOTHING`,
                    [
                        swapBurns.map(x => x[0]),
                        swapBurns.map(x => x[1]),
                        swapBurns.map(x => x[2]),
                        swapBurns.map(x => x[3]),
                        swapBurns.map(x => x[4]),
                        swapBurns.map(x => x[5]),
                        swapBurns.map(x => x[6])
                    ]
                );
                
                // Update user stats for each swap burn
                for (const swap of swapBurns) {
                    await client.query(
                        'SELECT update_user_stats($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                        [
                            this.chainId,              // p_chain_id
                            swap[2],                   // p_user_address
                            0,                         // p_xen_burned
                            0,                         // p_burn_count
                            0,                         // p_nft_position_count
                            0,                         // p_xen_locked
                            1,                         // p_swap_burn_count
                            swap[5],                   // p_xen_swapped
                            swap[6]                    // p_timestamp
                        ]
                    );
                }
            }

            if (liquidityAdds.length > 0) {
                await client.query(
                    `INSERT INTO chain_${this.chainId}_liquidity_added 
                     (tx_hash, block_number, user_address, token_address, token_amount, xen_amount, block_timestamp)
                     SELECT * FROM UNNEST ($1::text[], $2::bigint[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::timestamp[])
                     ON CONFLICT (tx_hash) DO NOTHING`,
                    [
                        liquidityAdds.map(x => x[0]),
                        liquidityAdds.map(x => x[1]),
                        liquidityAdds.map(x => x[2]),
                        liquidityAdds.map(x => x[3]),
                        liquidityAdds.map(x => x[4]),
                        liquidityAdds.map(x => x[5]),
                        liquidityAdds.map(x => x[6])
                    ]
                );
            }

            // Batch insert event logs
            if (eventLogs.length > 0) {
                await client.query(
                    `INSERT INTO event_processing_log 
                     (chain_id, contract_type, event_type, block_number, tx_hash, processed_at, status, error_message)
                     SELECT * FROM UNNEST ($1::text[], $2::text[], $3::text[], $4::bigint[], $5::text[], $6::timestamp[], $7::text[], $8::text[])`,
                    [
                        eventLogs.map(x => x.chain_id),
                        eventLogs.map(x => x.contract_type),
                        eventLogs.map(x => x.event_type),
                        eventLogs.map(x => x.block_number),
                        eventLogs.map(x => x.tx_hash),
                        eventLogs.map(x => x.processed_at),
                        eventLogs.map(x => x.status),
                        eventLogs.map(x => x.error_message || null)
                    ]
                );
            }

            // Update chain statistics
            await client.query('SELECT update_chain_stats($1)', [this.chainId]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        // Log performance metrics
        const duration = Date.now() - startTime;
        logger.info(
            `Processed ${events.length} events in ${duration}ms (${Math.round(events.length / (duration / 1000))} events/sec) on ${this.chainConfig.name}`,
            {
                chainName: this.chainConfig.name,
                burnsIndexed,
                positionsIndexed,
                swapsIndexed,
                liquidityAddedIndexed,
                duration,
                eventsPerSecond: Math.round(events.length / (duration / 1000))
            }
        );
    }

    private async insertXenBurn(event: EventData, args: Record<string, any>, timestamp: number) {
        await this.db.query(
            `INSERT INTO chain_${this.chainId}_xen_burns (tx_hash, block_number, from_address, amount, block_timestamp) 
             VALUES ($1, $2, $3, $4, to_timestamp($5)) 
             ON CONFLICT DO NOTHING`,
            [event.transactionHash, event.blockNumber, args['from'], args['value'].toString(), timestamp]
        );
    }

    private async insertBurnNftPosition(event: EventData, args: Record<string, any>, timestamp: number) {
        const maturityDate = new Date(timestamp * 1000);
        maturityDate.setSeconds(maturityDate.getSeconds() + parseInt(args['lockDuration']));

        await this.db.query(
            `INSERT INTO chain_${this.chainId}_burn_nft_positions 
             (tx_hash, block_number, user_address, token_id, amount, lock_duration, block_timestamp, maturity_date) 
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8) 
             ON CONFLICT DO NOTHING`,
            [
                event.transactionHash,
                event.blockNumber,
                args['user'],
                args['tokenId'].toString(),
                args['amount'].toString(),
                args['lockDuration'].toString(),
                timestamp,
                maturityDate
            ]
        );
    }

    private async insertSwapBurn(event: EventData, args: Record<string, any>, timestamp: number) {
        await this.db.query(
            `INSERT INTO chain_${this.chainId}_swap_burns 
             (tx_hash, block_number, user_address, token_address, token_amount, xen_amount, block_timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7)) 
             ON CONFLICT DO NOTHING`,
            [
                event.transactionHash,
                event.blockNumber,
                args['user'],
                args['token'],
                args['tokenAmount'].toString(),
                args['xenAmount'].toString(),
                timestamp
            ]
        );
    }

    private async insertLiquidityAdded(event: EventData, args: Record<string, any>, timestamp: number) {
        await this.db.query(
            `INSERT INTO chain_${this.chainId}_liquidity_added 
             (tx_hash, block_number, user_address, token_address, token_amount, xen_amount, block_timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7)) 
             ON CONFLICT DO NOTHING`,
            [
                event.transactionHash,
                event.blockNumber,
                args['user'],
                args['token'],
                args['tokenAmount'].toString(),
                args['xenAmount'].toString(),
                timestamp
            ]
        );
    }

    private async insertNftClaim(event: EventData, args: Record<string, any>, timestamp: number) {
        await this.db.query(
            `INSERT INTO chain_${this.chainId}_nft_claims 
             (tx_hash, block_number, user_address, token_id, base_amount, bonus_amount, block_timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7)) 
             ON CONFLICT DO NOTHING`,
            [
                event.transactionHash,
                event.blockNumber,
                args['user'],
                args['tokenId'].toString(),
                args['baseAmount'].toString(),
                args['bonusAmount'].toString(),
                timestamp
            ]
        );
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