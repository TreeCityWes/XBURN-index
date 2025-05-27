"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chainLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const customFormat = winston_1.default.format.printf(({ level, message, timestamp, chainName, blockNumber, latency, error }) => {
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
        }
        else {
            output += `\nError: ${error}`;
        }
    }
    return output;
});
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }), winston_1.default.format.errors({ stack: true }), customFormat),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), customFormat)
        }),
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston_1.default.transports.File({
            filename: 'logs/indexer.log',
        })
    ]
});
exports.logger = logger;
const chainLogger = {
    info: (message, info) => {
        logger.info(message, info);
    },
    error: (message, info) => {
        logger.error(message, info);
    },
    warn: (message, info) => {
        logger.warn(message, info);
    },
    debug: (message, info) => {
        logger.debug(message, info);
    }
};
exports.chainLogger = chainLogger;
