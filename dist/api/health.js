"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
exports.setupHealthRoutes = setupHealthRoutes;
const express_1 = __importDefault(require("express"));
const logger_1 = require("../utils/logger");
exports.healthRouter = express_1.default.Router();
function setupHealthRoutes(healthMonitor) {
    // Get health status for all chains
    exports.healthRouter.get('/chains', async (req, res) => {
        try {
            const healthSummary = await healthMonitor.getChainHealthSummary();
            res.json({
                status: 'success',
                data: healthSummary
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting chain health:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to get chain health status'
            });
        }
    });
    // Get detailed health status for a specific chain
    exports.healthRouter.get('/chains/:chainId', async (req, res) => {
        try {
            const healthSummary = await healthMonitor.getChainHealthSummary();
            const chainHealth = healthSummary.find((h) => h.chain_id === req.params.chainId);
            if (!chainHealth) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chain not found'
                });
            }
            res.json({
                status: 'success',
                data: chainHealth
            });
        }
        catch (error) {
            logger_1.logger.error(`Error getting chain ${req.params.chainId} health:`, error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to get chain health status'
            });
        }
    });
    return exports.healthRouter;
}
