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
}

export const chains: { [key: string]: ChainConfig } = {
  base: {
    id: 8453,
    name: 'Base',
    rpcUrls: [
      `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      'https://mainnet.base.org',
      'https://base.blockpi.network/v1/rpc/public',
      'https://base.publicnode.com',
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org'
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
      `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      'https://eth-mainnet.public.blastapi.io',
      'https://eth.drpc.org',
      'https://rpc.ankr.com/eth',
      'https://cloudflare-eth.com',
      'https://ethereum.publicnode.com',
      'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      'https://rpc.flashbots.net',
      'https://api.securerpc.com/v1',
      'https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7'
    ],
    contracts: {
      xen: '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8',
      xburnMinter: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF',
      xburnNft: '0x3b762aA4902e1D2b3CDb89B27E1BCF2012Edd22F'
    },
    startBlock: 17000000,
    gasPrice: '5'
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    rpcUrls: [
      `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      'https://polygon-rpc.com',
      'https://polygon-bor.publicnode.com',
      'https://polygon.drpc.org',
      'https://rpc.ankr.com/polygon',
      'https://polygon-mainnet.public.blastapi.io',
      'https://polygon.blockpi.network/v1/rpc/public',
      'https://polygon.rpc.blxrbdn.com',
      'https://matic-mainnet-archive-rpc.bwarelabs.com',
      'https://matic-mainnet-full-rpc.bwarelabs.com',
      'https://matic-mainnet.chainstacklabs.com',
      'https://polygon.llamarpc.com',
      'https://rpc-mainnet.matic.network',
      'https://rpc-mainnet.maticvigil.com',
      'https://endpoints.omniatech.io/v1/matic/mainnet/public',
      'https://polygon.api.onfinality.io/public',
      'https://poly-rpc.gateway.pokt.network'
    ],
    contracts: {
      xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
      xburnMinter: '0xF6143C6134Be3c3FD3431467D1252A2d18C89CDE',
      xburnNft: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A'
    },
    startBlock: 45000000,
    gasPrice: '300'
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    rpcUrls: [
      `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      'https://mainnet.optimism.io',
      'https://optimism.publicnode.com',
      'https://1rpc.io/op',
      'https://rpc.ankr.com/optimism',
      'https://optimism-mainnet.public.blastapi.io',
      'https://optimism.blockpi.network/v1/rpc/public',
      'https://endpoints.omniatech.io/v1/op/mainnet/public'
    ],
    contracts: {
      xen: '0xeB585163DEbB1E637c6D617de3bEF99347cd75c8',
      xburnMinter: '0x9d16374c01Cf785b6dB5B02A830E00C40c5381D8',
      xburnNft: '0xd7dd1997ed8d5b836099e5d28fed1a9d8e9cc723'
    },
    startBlock: 108000000,
    gasPrice: '0.0001'
  },
  pulsechain: {
    id: 369,
    name: 'PulseChain',
    rpcUrls: [
      'https://rpc.pulsechain.com',
      'https://pulsechain.publicnode.com',
      'https://rpc-pulsechain.g4mm4.io',
      'https://pulsechain-rpc.publicnode.com'
    ],
    contracts: {
      xen: '0x8a7FDcA264e87b6da72D000f22186B4403081A2a',
      xburnMinter: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A',
      xburnNft: '0x305C60D2fEf49FADfEe67EC530DE98f67bac861D'
    },
    startBlock: 17000000,
    gasPrice: '2500000'
  },
  bsc: {
    id: 56,
    name: 'BSC',
    rpcUrls: [
      'https://bsc.publicnode.com',
      'https://binance.nodereal.io',
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.binance.org',
      'https://bsc-dataseed2.binance.org',
      'https://bsc-dataseed3.binance.org',
      'https://bsc-dataseed4.binance.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed2.defibit.io',
      'https://bsc-dataseed3.defibit.io',
      'https://bsc-dataseed4.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://bsc-dataseed2.ninicoin.io',
      'https://bsc-dataseed3.ninicoin.io',
      'https://bsc-dataseed4.ninicoin.io',
      'https://bsc.drpc.org',
      'https://1rpc.io/bnb',
      'https://bsc-mainnet.public.blastapi.io',
      'https://bsc.blockpi.network/v1/rpc/public',
      'https://bsc.rpc.blxrbdn.com',
      'https://bscrpc.com',
      'https://bnb.api.onfinality.io/public'
    ],
    contracts: {
      xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
      xburnMinter: '0x12cf65e044a59e85f38497c413f24de6d33250ba',
      xburnNft: '0xf0ca18f2462936df8332f88c4cf27a03d829dbb2'
    },
    startBlock: 28000000,
    gasPrice: '0.1'
  },
  avalanche: {
    id: 43114,
    name: 'Avalanche',
    rpcUrls: [
      `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-evm.publicnode.com',
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://rpc.ankr.com/avalanche',
      'https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc',
      'https://avalanche.blockpi.network/v1/rpc/public',
      'https://endpoints.omniatech.io/v1/avax/mainnet/public',
      'https://avalanche.api.onfinality.io/public/ext/bc/C/rpc',
      'https://avax-mainnet.gateway.pokt.network/v1/lb/605238bf6b986eea7cf36d5e/ext/bc/C/rpc',
      'https://avalanche-c-chain.publicnode.com',
      'https://avax.rpcgator.com/',
      'https://avalanche.drpc.org',
      'https://1rpc.io/avax/c'
    ],
    contracts: {
      xen: '0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389',
      xburnMinter: '0xE2D8836925B8684F47CaD8A90fbC27868f5B3922',
      xburnNft: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF'
    },
    startBlock: 30000000,
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
  batchSize: parseInt(process.env.BATCH_SIZE || '3'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
  maxBackoffDelay: parseInt(process.env.MAX_BACKOFF_DELAY || '60000'),
  minProviderSwitchInterval: 10000
}; 