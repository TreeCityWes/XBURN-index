import { ethers } from 'ethers';
import { Pool } from 'pg';
import { chainLogger } from '../utils/logger';
import { RPCProvider } from '../provider';
import { ChainConfig as AppChainConfig } from '../config';

export class IndexerHealthMonitor {
    private db: Pool;
    private rpcProviders: Map<string, RPCProvider>;
    private appChains: AppChainConfig[];
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(db: Pool, rpcProviders: Map<string, RPCProvider>) {
        this.db = db;
        this.rpcProviders = rpcProviders;
        this.appChains = Object.values(require('../config').chains);
    }

    async start(intervalMs: number = 60000) {
        this.checkInterval = setInterval(() => this.checkAllChains(), intervalMs);
        await this.checkAllChains(); // Initial check
        
        chainLogger.info('Health monitoring started', {
            chainName: 'System',
            message: `Monitoring ${this.rpcProviders.size} chains with ${intervalMs}ms interval`
        });
    }

    cleanup() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    private async checkAllChains() {
        for (const [chainId, rpcProvider] of this.rpcProviders.entries()) {
            const appChainConfig = this.appChains.find(c => c.id.toString() === chainId);
            const chainName = appChainConfig ? appChainConfig.name : `Chain ${chainId}`;
            try {
                await this.checkChainHealth(chainId, chainName, rpcProvider);
            } catch (error) {
                chainLogger.error('Chain health check failed', {
                    chainName: chainName,
                    error,
                    message: `Failed to check health for chain ${chainId}`
                });
            }
        }
    }

    private async checkChainHealth(chainId: string, chainName: string, rpcProvider: RPCProvider) {
        const startTime = Date.now();
        let currentProviderForHealthCheck: ethers.Provider | null = null;
        let currentRpcUrlForHealthCheck: string = 'unknown';

        try {
            currentProviderForHealthCheck = await rpcProvider.getProvider();
            currentRpcUrlForHealthCheck = rpcProvider.getCurrentProviderUrl();
            
            // Check RPC connection and get latest block
            const latestBlock = await currentProviderForHealthCheck.getBlockNumber();
            const rpcLatencyMs = Date.now() - startTime;

            // Get last indexed block from database
            const { rows: [chainData] } = await this.db.query(
                'SELECT last_indexed_block FROM chains WHERE chain_id = $1',
                [chainId]
            );

            const lastIndexedBlock = chainData?.last_indexed_block || 0;
            const blocksBehind = latestBlock - lastIndexedBlock;

            // Update chain health status
            await this.db.query(
                'SELECT update_chain_health($1, $2, $3, $4, $5, $6)',
                [chainId, true, null, blocksBehind, rpcLatencyMs, currentRpcUrlForHealthCheck]
            );

            chainLogger.info('Chain health status', {
                chainName: chainName,
                blockNumber: latestBlock,
                latency: rpcLatencyMs,
                message: `RPC: ${currentRpcUrlForHealthCheck}, Blocks behind: ${blocksBehind}, Last indexed: ${lastIndexedBlock}`
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            await this.db.query(
                'SELECT update_chain_health($1, $2, $3, $4, $5, $6)',
                [chainId, false, errorMessage, null, null, currentRpcUrlForHealthCheck]
            );

            chainLogger.error('Chain health check error', {
                chainName: chainName,
                error: error instanceof Error ? error : new Error(String(error)),
                message: `Failed to get chain health status for RPC: ${currentRpcUrlForHealthCheck}`
            });
        }
    }

    async logIndexingPerformance(
        chainId: string,
        startBlock: number,
        endBlock: number,
        burnsIndexed: number,
        positionsIndexed: number,
        durationMs: number
    ) {
        try {
            await this.db.query(
                'SELECT log_indexing_performance($1, $2, $3, $4, $5, $6)',
                [chainId, startBlock, endBlock, burnsIndexed, positionsIndexed, durationMs]
            );
        } catch (error) {
            chainLogger.error(`Error logging indexing performance for chain ${chainId}:`, {
                chainName: chainId,
                error: error instanceof Error ? error : new Error(String(error))
            });
        }
    }

    async getChainHealthSummary() {
        try {
            const { rows } = await this.db.query('SELECT * FROM chain_health ORDER BY chain_id');
            return rows;
        } catch (error) {
            chainLogger.error('Error getting chain health summary', {
                chainName: 'System',
                error: error instanceof Error ? error : new Error(String(error))
            });
            throw error;
        }
    }
} 