import { ethers } from 'ethers';
import { indexerConfig } from './config';
import { chainLogger } from './utils/logger';

// Add NodeJS types declaration
declare global {
  var setInterval: (callback: (...args: any[]) => void, ms: number) => NodeJS.Timeout;
  var clearInterval: (intervalId: NodeJS.Timeout) => void;
}

interface ProviderHealth {
  url: string;
  lastSuccess: number;
  lastFailure: number;
  failureCount: number;
  latency: number;
  isHealthy: boolean;
  currentBlock?: number;
}

export class RPCProvider {
  private providers: Map<string, ethers.JsonRpcProvider>;
  private providerHealth: Map<string, ProviderHealth>;
  private currentProviderUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private chainId: string;
  private chainName: string;
  private rpcUrls: string[];
  private lastProviderSwitch: number = 0;
  private minSwitchInterval: number = indexerConfig.minProviderSwitchInterval;
  private currentProviderIndex: number = 0;

  constructor(chainId: string, chainName: string, rpcUrls: string[]) {
    this.chainId = chainId;
    this.chainName = chainName;
    this.rpcUrls = rpcUrls;
    this.providers = new Map();
    this.providerHealth = new Map();
    this.maxRetries = indexerConfig.maxRetries;
    this.retryDelay = indexerConfig.retryDelay;
    
    // Initialize providers and health tracking
    rpcUrls.forEach(url => {
      const provider = new ethers.JsonRpcProvider(url, {
        chainId: parseInt(chainId),
        name: chainName
      });
      
      // Set polling interval
      provider.pollingInterval = indexerConfig.pollingInterval;
      
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

    this.currentProviderUrl = rpcUrls[0];

    // Start health checks
    this.startHealthChecks();
    
    chainLogger.info('Provider initialized', {
      chainName: this.chainName,
      message: `Initialized with ${rpcUrls.length} RPC endpoints`
    });
  }

  private startHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkProvidersHealth();
    }, 15000); // Check every 15 seconds
  }

  private async checkProvidersHealth() {
    for (const [url, provider] of this.providers.entries()) {
      try {
        const start = Date.now();
        const blockNumber = await provider.getBlockNumber();
        const latency = Date.now() - start;

        if (!blockNumber) {
          throw new Error('Invalid block number response');
        }

        const health = this.providerHealth.get(url)!;
        health.lastSuccess = Date.now();
        health.latency = latency;
        health.isHealthy = true;
        health.failureCount = 0;
        health.currentBlock = blockNumber;

        chainLogger.debug('RPC health check success', {
          chainName: this.chainName,
          blockNumber,
          latency,
          message: `Provider ${url} is healthy`
        });
      } catch (error) {
        const health = this.providerHealth.get(url)!;
        health.lastFailure = Date.now();
        health.failureCount++;
        health.isHealthy = false;

        chainLogger.warn('RPC health check failed', {
          chainName: this.chainName,
          error,
          message: `Provider ${url} failed health check`
        });
        
        if (url === this.currentProviderUrl && (
          this.shouldSwitchProvider(error) || 
          health.failureCount >= this.maxRetries
        )) {
          await this.switchProvider();
        }
      }
    }
  }

  private shouldSwitchProvider(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('exceeded') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('network error')
    );
  }

  private async switchProvider(): Promise<void> {
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

      chainLogger.info('Switched RPC provider', {
        chainName: this.chainName,
        message: `Switched to ${newUrl}`
      });
    } else {
      chainLogger.warn('No healthy providers available', {
        chainName: this.chainName,
        message: 'Continuing with current provider despite issues'
      });
    }
  }

  async getProvider(): Promise<ethers.Provider> {
    return this.providers.get(this.currentProviderUrl)!;
  }

  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  getCurrentProviderUrl(): string {
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
      } catch (error) {
        chainLogger.error('Error destroying provider', {
          chainName: this.chainName,
          error
        });
      }
    }
  }
} 