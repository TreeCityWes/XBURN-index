"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCProvider = void 0;
const ethers_1 = require("ethers");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
class RPCProvider {
    constructor(chainConfig) {
        this.healthCheckInterval = null;
        this.lastProviderSwitch = 0;
        this.minSwitchInterval = config_1.indexerConfig.minProviderSwitchInterval;
        this.currentProviderIndex = 0;
        this.chainConfig = chainConfig;
        this.providers = new Map();
        this.providerHealth = new Map();
        this.maxRetries = config_1.indexerConfig.maxRetries;
        this.retryDelay = config_1.indexerConfig.retryDelay;
        // Initialize providers and health tracking
        chainConfig.rpcUrls.forEach(url => {
            const provider = new ethers_1.ethers.JsonRpcProvider(url, {
                chainId: chainConfig.id,
                name: chainConfig.name
            });
            // Set polling interval
            provider.pollingInterval = config_1.indexerConfig.pollingInterval;
            this.providers.set(url, provider);
            this.providerHealth.set(url, {
                url,
                lastSuccess: Date.now(),
                lastFailure: 0,
                failureCount: 0,
                latency: 0,
                isHealthy: true
            });
        });
        this.currentProviderUrl = chainConfig.rpcUrls[0];
        // Start health checks
        this.startHealthChecks();
        logger_1.chainLogger.info('Provider initialized', {
            chainName: this.chainConfig.name,
            message: `Initialized with ${chainConfig.rpcUrls.length} RPC endpoints`
        });
    }
    startHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(async () => {
            await this.checkProvidersHealth();
        }, 15000); // Check every 15 seconds
    }
    async checkProvidersHealth() {
        for (const [url, provider] of this.providers.entries()) {
            try {
                const start = Date.now();
                const blockNumber = await provider.getBlockNumber();
                const latency = Date.now() - start;
                if (!blockNumber) {
                    throw new Error('Invalid block number response');
                }
                const health = this.providerHealth.get(url);
                health.lastSuccess = Date.now();
                health.latency = latency;
                health.isHealthy = true;
                health.failureCount = 0;
                health.currentBlock = blockNumber;
                logger_1.chainLogger.debug('RPC health check success', {
                    chainName: this.chainConfig.name,
                    blockNumber,
                    latency,
                    message: `Provider ${url} is healthy`
                });
            }
            catch (error) {
                const health = this.providerHealth.get(url);
                health.lastFailure = Date.now();
                health.failureCount++;
                health.isHealthy = false;
                logger_1.chainLogger.warn('RPC health check failed', {
                    chainName: this.chainConfig.name,
                    error,
                    message: `Provider ${url} failed health check`
                });
                if (url === this.currentProviderUrl && (this.shouldSwitchProvider(error) ||
                    health.failureCount >= this.maxRetries)) {
                    await this.switchProvider();
                }
            }
        }
    }
    shouldSwitchProvider(error) {
        const errorMessage = error?.message?.toLowerCase() || '';
        return (errorMessage.includes('rate limit') ||
            errorMessage.includes('too many requests') ||
            errorMessage.includes('exceeded') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('econnrefused') ||
            errorMessage.includes('network error'));
    }
    async switchProvider() {
        const now = Date.now();
        if (now - this.lastProviderSwitch < this.minSwitchInterval) {
            return;
        }
        const healthyProviders = Array.from(this.providerHealth.entries())
            .filter(([url, health]) => health.isHealthy && url !== this.currentProviderUrl)
            .sort((a, b) => a[1].latency - b[1].latency);
        if (healthyProviders.length > 0) {
            const [newUrl] = healthyProviders[0];
            this.currentProviderUrl = newUrl;
            this.lastProviderSwitch = now;
            logger_1.chainLogger.info('Switched RPC provider', {
                chainName: this.chainConfig.name,
                message: `Switched to ${newUrl}`
            });
        }
        else {
            logger_1.chainLogger.warn('No healthy providers available', {
                chainName: this.chainConfig.name,
                message: 'Continuing with current provider despite issues'
            });
        }
    }
    async getProvider() {
        return this.providers.get(this.currentProviderUrl);
    }
    getProviderHealth() {
        return Array.from(this.providerHealth.values());
    }
    getCurrentProviderUrl() {
        return this.currentProviderUrl;
    }
    cleanup() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        // Cleanup all providers
        for (const provider of this.providers.values()) {
            try {
                provider.destroy();
            }
            catch (error) {
                logger_1.chainLogger.error('Error destroying provider', {
                    chainName: this.chainConfig.name,
                    error
                });
            }
        }
    }
}
exports.RPCProvider = RPCProvider;
