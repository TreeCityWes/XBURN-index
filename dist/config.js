"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexerConfig = exports.dbConfig = exports.chains = void 0;
exports.chains = {
    base: {
        id: 8453,
        name: 'Base',
        rpcUrls: [
            process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            'https://base.blockpi.network/v1/rpc/public',
            'https://base.publicnode.com'
        ],
        contracts: {
            xen: process.env.XEN_CONTRACT_ADDRESS_BASE || '0xffcbF84650cE02DaFE96926B37a0ac5E34932fa5',
            xburnMinter: process.env.XBURN_MINTER_CONTRACT_ADDRESS_BASE || '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A',
            xburnNft: process.env.XBURN_NFT_CONTRACT_ADDRESS_BASE || '0x305c60d2fef49fadfee67ec530de98f67bac861d'
        },
        startBlock: parseInt(process.env.START_BLOCK_BASE || '29193678'),
        gasPrice: '0.005'
    },
    ethereum: {
        id: 1,
        name: 'Ethereum',
        rpcUrls: [
            process.env.ETH_RPC_URL || 'https://eth-mainnet.public.blastapi.io',
            'https://rpc.ankr.com/eth',
            'https://cloudflare-eth.com'
        ],
        contracts: {
            xen: '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8',
            xburnMinter: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF',
            xburnNft: '0x3b762aA4902e1D2b3CDb89B27E1BCF2012Edd22F'
        },
        startBlock: parseInt(process.env.START_BLOCK_ETHEREUM || '17000000'),
        gasPrice: '5'
    },
    polygon: {
        id: 137,
        name: 'Polygon',
        rpcUrls: [
            process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon-bor.publicnode.com'
        ],
        contracts: {
            xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
            xburnMinter: '0xF6143C6134Be3c3FD3431467D1252A2d18C89CDE',
            xburnNft: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A'
        },
        startBlock: parseInt(process.env.START_BLOCK_POLYGON || '45000000'),
        gasPrice: '300'
    },
    optimism: {
        id: 10,
        name: 'Optimism',
        rpcUrls: [
            process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
            'https://rpc.ankr.com/optimism',
            'https://optimism.publicnode.com'
        ],
        contracts: {
            xen: '0xeB585163DEbB1E637c6D617de3bEF99347cd75c8',
            xburnMinter: '0x9d16374c01Cf785b6dB5B02A830E00C40c5381D8',
            xburnNft: '0xd7dd1997ed8d5b836099e5d28fed1a9d8e9cc723'
        },
        startBlock: parseInt(process.env.START_BLOCK_OPTIMISM || '108000000'),
        gasPrice: '0.0001'
    },
    pulsechain: {
        id: 369,
        name: 'PulseChain',
        rpcUrls: [
            process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com',
            'https://pulsechain.publicnode.com',
            'https://rpc-pulsechain.g4mm4.io'
        ],
        contracts: {
            xen: '0x8a7FDcA264e87b6da72D000f22186B4403081A2a',
            xburnMinter: '0xe89AFDeFeBDba033f6e750615f0A0f1A37C78c4A',
            xburnNft: '0x305C60D2fEf49FADfEe67EC530DE98f67bac861D'
        },
        startBlock: parseInt(process.env.START_BLOCK_PULSECHAIN || '17000000'),
        gasPrice: '2500000'
    },
    bsc: {
        id: 56,
        name: 'BSC',
        rpcUrls: [
            process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
            'https://bsc-dataseed2.binance.org',
            'https://bsc-dataseed3.binance.org'
        ],
        contracts: {
            xen: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
            xburnMinter: '0x12cf65e044a59e85f38497c413f24de6d33250ba',
            xburnNft: '0xf0ca18f2462936df8332f88c4cf27a03d829dbb2'
        },
        startBlock: parseInt(process.env.START_BLOCK_BSC || '28000000'),
        gasPrice: '0.1'
    },
    avalanche: {
        id: 43114,
        name: 'Avalanche',
        rpcUrls: [
            process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
            'https://rpc.ankr.com/avalanche',
            'https://avalanche-evm.publicnode.com'
        ],
        contracts: {
            xen: '0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389',
            xburnMinter: '0xE2D8836925B8684F47CaD8A90fbC27868f5B3922',
            xburnNft: '0x32714eF2eD46EDa5C23C885462a9e439F4CBD7FF'
        },
        startBlock: parseInt(process.env.START_BLOCK_AVALANCHE || '30000000'),
        gasPrice: '25'
    }
};
// Database configuration
exports.dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'xen_burn_analytics',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
};
// Indexer configuration
exports.indexerConfig = {
    pollingInterval: parseInt(process.env.INDEXER_INTERVAL_MS || '15000'),
    batchSize: parseInt(process.env.BATCH_SIZE || '3'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
    maxBackoffDelay: parseInt(process.env.MAX_BACKOFF_DELAY || '60000'),
    minProviderSwitchInterval: 10000
};
