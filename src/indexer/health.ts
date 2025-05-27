import { ethers } from 'ethers';
import { Pool } from 'pg';
import { chainLogger } from '../utils/logger';
import { RPCProvider } from '../provider';
import { ChainConfig as AppChainConfig, chains } from '../config';

export class IndexerHealthMonitor {
    private dbs: Map<string, Pool>;
    private rpcProviders: Map<string, RPCProvider>;
    private appChains: AppChainConfig[];
    private checkInterval: ReturnType<typeof setInterval> | null = null;

    constructor(dbs: Map<string, Pool>, rpcProviders: Map<string, RPCProvider>) {
        this.dbs = dbs;
        this.rpcProviders = rpcProviders;
        this.appChains = Object.values(chains);
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
            const result = await this.dbs.get(chainId)?.query(
                'SELECT last_indexed_block FROM chains WHERE chain_id = $1',
                [chainId]
            );
            
            const chainData = result?.rows?.[0];
            const lastIndexedBlock = chainData?.last_indexed_block || 0;
            const blocksBehind = latestBlock - lastIndexedBlock;

            // Update chain health status - match SQL function parameter names
            await this.dbs.get(chainId)?.query(
                'SELECT update_chain_health($1, $2, $3, $4, $5, $6)',
                [
                    chainId,               // p_chain_id
                    true,                  // p_is_healthy
                    null,                  // p_error_message
                    blocksBehind,          // p_blocks_behind
                    rpcLatencyMs,          // p_rpc_latency_ms
                    currentRpcUrlForHealthCheck // p_current_rpc_url
                ]
            );

            chainLogger.info('Chain health status', {
                chainName: chainName,
                blockNumber: latestBlock,
                latency: rpcLatencyMs,
                message: `Blocks behind: ${blocksBehind}, Last indexed: ${lastIndexedBlock} (Block: ${latestBlock}) (Latency: ${rpcLatencyMs}ms)`
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Update chain health with error - match SQL function parameter names
            await this.dbs.get(chainId)?.query(
                'SELECT update_chain_health($1, $2, $3, $4, $5, $6)',
                [
                    chainId,               // p_chain_id
                    false,                 // p_is_healthy
                    errorMessage,          // p_error_message
                    null,                  // p_blocks_behind
                    null,                  // p_rpc_latency_ms
                    currentRpcUrlForHealthCheck // p_current_rpc_url
                ]
            );

            chainLogger.error('RPC health check failed', {
                chainName: chainName,
                error: error instanceof Error ? error : new Error(String(error)),
                message: `Provider ${currentRpcUrlForHealthCheck} failed health check`
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
            await this.dbs.get(chainId)?.query(
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
            const result = await this.dbs.get('System')?.query('SELECT * FROM chain_health ORDER BY chain_id');
            return result?.rows || [];
        } catch (error) {
            chainLogger.error('Error getting chain health summary', {
                chainName: 'System',
                error: error instanceof Error ? error : new Error(String(error))
            });
            throw error;
        }
    }
} 