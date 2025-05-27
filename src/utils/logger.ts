import winston from 'winston';

const customFormat = winston.format.printf(({ level, message, timestamp, chainName, blockNumber, latency, error }) => {
    let output = `${timestamp} [${level.toUpperCase()}]`;
    
    if (chainName) {
        output += ` [${chainName}]`;
    }
    
    output += `: ${message}`;

    if (blockNumber !== undefined) {
        output += ` (Block: ${blockNumber})`;
    }
    
    if (latency !== undefined) {
        output += ` (Latency: ${latency}ms)`;
    }

    if (error) {
        if (error instanceof Error) {
            output += `\nError: ${error.message}\nStack: ${error.stack}`;
        } else {
            output += `\nError: ${error}`;
        }
    }

    return output;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        customFormat
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                customFormat
            )
        }),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
        }),
        new winston.transports.File({ 
            filename: 'logs/indexer.log',
        })
    ]
});

// Add custom logging methods for chain-specific events
interface ChainLogInfo {
    chainName: string;
    message?: string;
    blockNumber?: number;
    latency?: number;
    error?: Error | unknown;
}

const chainLogger = {
    info: (message: string, info: ChainLogInfo) => {
        logger.info(message, info);
    },
    error: (message: string, info: ChainLogInfo) => {
        logger.error(message, info);
    },
    warn: (message: string, info: ChainLogInfo) => {
        logger.warn(message, info);
    },
    debug: (message: string, info: ChainLogInfo) => {
        logger.debug(message, info);
    }
};

export { logger, chainLogger }; 