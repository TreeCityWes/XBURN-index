// Node.js process type declaration
declare const process: {
  env: {
    [key: string]: string | undefined;
  };
};

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrls: string[];
  contracts: {
    xen: string;
    xburnMinter: string;
    xburnNft: string;
  };
  startBlock: number;
  gasPrice?: string;
  batchSize?: number;
}

export const chains: { [key: string]: ChainConfig } = {
  base: {
    id: 8453,
    name: 'Base',
    rpcUrls: [
      'https://base.drpc.org',
      'https://1rpc.io/base',
      'https://mainnet.base.org',
      'https://developer-access-mainnet.base.org',
      'https://base-mainnet.public.blastapi.io',
      'https://base.llamarpc.com',
      'https://base.lava.build',
      'https://base-pokt.nodies.app',
      'https://base.meowrpc.com',
      'https://endpoints.omniatech.io/v1/base/mainnet/public',
      'https://rpc.therpc.io/base',
      'https://base.gateway.tenderly.co',
      'https://base.blockpi.network/v1/rpc/public',
      'https://base.api.onfinality.io/public',
      'https://base-rpc.publicnode.com',
      'https://0xrpc.io/base',
      'https://base.rpc.subquery.network/public',
      'https://gateway.tenderly.co/public/base',
      'https://rpc.owlracle.info/base/70d38ce1826c4a60bb2a8e05a6c8b20f',
      'https://api.zan.top/base-mainnet'
    ],
    contracts: {
      xen: '0xffcbF84650cE02DaFE96926B37a0ac5E34932fa5',
      xburnMinter: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A',
      xburnNft: '0x305c60d2fef49fadfee67ec530de98f67bac861d'
    },
    startBlock: 29193678,
    gasPrice: '0.005'
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    rpcUrls: [
      'https://ethereum.publicnode.com',
      'https://eth.llamarpc.com',
      'https://ethereum.blockpi.network/v1/rpc/public',
      'https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7',
      'https://eth-pokt.nodies.app'
    ],
    contracts: {
      xen: '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8',
      xburnMinter: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF',
      xburnNft: '0x3b762aA4902e1D2b3CDb89B27E1BCF2012Edd22F'
    },
    startBlock: 22551915,
    gasPrice: '5'
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    rpcUrls: [
      'https://polygon.rpc.subquery.network/public',
      'https://polygon.drpc.org',
      'https://rpc-mainnet.matic.quiknode.pro',
      'https://polygon.api.onfinality.io/public',
      'https://polygon-mainnet.g.alchemy.com/v2/demo',
      'https://1rpc.io/matic',
      'https://polygon.lava.build',
      'https://polygon-rpc.com',
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon-mainnet.public.blastapi.io',
      'https://polygon.meowrpc.com',
      'https://polygon-pokt.nodies.app',
      'https://rpc.owlracle.info/poly/70d38ce1826c4a60bb2a8e05a6c8b20f',
      'https://endpoints.omniatech.io/v1/matic/mainnet/public',
      'https://rpc.therpc.io/polygon',
      'https://api.zan.top/polygon-mainnet',
      'https://polygon.gateway.tenderly.co',
      'https://gateway.tenderly.co/public/polygon',
      'https://polygon.blockpi.network/v1/rpc/public'
    ],
    contracts: {
      xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
      xburnMinter: '0xF6143C6134Be3c3FD3431467D1252A2d18C89CDE',
      xburnNft: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A'
    },
    startBlock: 71338833,
    gasPrice: '300'
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    rpcUrls: [
      'https://optimism.rpc.subquery.network/public',
      'https://optimism.api.onfinality.io/public',
      'https://optimism.drpc.org',
      'https://optimism.blockpi.network/v1/rpc/public',
      'https://optimism-mainnet.public.blastapi.io',
      'https://op-pokt.nodies.app',
      'https://rpc.owlracle.info/opt/70d38ce1826c4a60bb2a8e05a6c8b20f',
      'https://0xrpc.io/op',
      'https://mainnet.optimism.io',
      'https://api.zan.top/opt-mainnet',
      'https://1rpc.io/op',
      'https://optimism-rpc.publicnode.com',
      'https://optimism.gateway.tenderly.co',
      'https://endpoints.omniatech.io/v1/op/mainnet/public',
      'https://rpc.therpc.io/optimism'
    ],
    contracts: {
      xen: '0xeB585163DEbB1E637c6D617de3bEF99347cd75c8',
      xburnMinter: '0x9d16374c01Cf785b6dB5B02A830E00C40c5381D8',
      xburnNft: '0xd7dd1997ed8d5b836099e5d28fed1a9d8e9cc723'
    },
    startBlock: 135077350,
    gasPrice: '0.0001',
    batchSize: 50
  },
  pulsechain: {
    id: 369,
    name: 'PulseChain',
    rpcUrls: [
      'https://rpc.pulsechain.com',
      'https://pulsechain.publicnode.com',
      'https://rpc-pulsechain.g4mm4.io'
    ],
    contracts: {
      xen: '0x8a7FDcA264e87b6da72D000f22186B4403081A2a',
      xburnMinter: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A',
      xburnNft: '0x305C60D2fEf49FADfEe67EC530DE98f67bac861D'
    },
    startBlock: 23431230,
    gasPrice: '2500000'
  },
  bsc: {
    id: 56,
    name: 'BSC',
    rpcUrls: [
      'https://bnb.rpc.subquery.network/public',
      'https://bsc.meowrpc.com',
      'https://bsc-pokt.nodies.app',
      'https://api.zan.top/bsc-mainnet',
      'https://bsc.blockrazor.xyz',
      'https://rpc-bsc.48.club',
      'https://0.48.club',
      'https://bsc-rpc.publicnode.com',
      'https://endpoints.omniatech.io/v1/bsc/mainnet/public',
      'https://rpc.therpc.io/bsc',
      'https://bsc-mainnet.public.blastapi.io',
      'https://0xrpc.io/bnb',
      'https://binance.llamarpc.com',
      'https://bsc.rpc.blxrbdn.com',
      'https://bsc.publicnode.com',
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.binance.org',
      'https://bsc-dataseed2.binance.org',
      'https://bsc-dataseed3.binance.org',
      'https://bsc-dataseed4.binance.org'
    ],
    contracts: {
      xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
      xburnMinter: '0x12cf65e044a59e85f38497c413f24de6d33250ba',
      xburnNft: '0xf0ca18f2462936df8332f88c4cf27a03d829dbb2'
    },
    startBlock: 50300000,
    gasPrice: '0.1',
    batchSize: 50
  },
  avalanche: {
    id: 43114,
    name: 'Avalanche',
    rpcUrls: [
      'https://avalanche.drpc.org',
      'https://1rpc.io/avax/c',
      'https://api.avax.network/ext/bc/C/rpc',
      'https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc',
      'https://avalanche-mainnet.gateway.tenderly.co',
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://rpc.owlracle.info/avax/70d38ce1826c4a60bb2a8e05a6c8b20f',
      'https://endpoints.omniatech.io/v1/avax/mainnet/public',
      'https://avax.meowrpc.com',
      'https://0xrpc.io/avax',
      'https://api.zan.top/avax-mainnet/ext/bc/C/rpc',
      'https://avax-pokt.nodies.app/ext/bc/C/rpc',
      'https://avalanche-evm.publicnode.com',
      'https://avalanche-c-chain.publicnode.com',
      'https://avalanche.blockpi.network/v1/rpc/public'
    ],
    contracts: {
      xen: '0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389',
      xburnMinter: '0xE2D8836925B8684F47CaD8A90fbC27868f5B3922',
      xburnNft: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF'
    },
    startBlock: 62267210,
    gasPrice: '25'
  }
};

// Database configuration
export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'xen_burn_analytics',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// Indexer configuration
export const indexerConfig = {
  pollingInterval: parseInt(process.env.INDEXER_INTERVAL_MS || '15000'),
  batchSize: parseInt(process.env.BATCH_SIZE || '250'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
  maxBackoffDelay: parseInt(process.env.MAX_BACKOFF_DELAY || '60000'),
  minProviderSwitchInterval: 10000
}; 