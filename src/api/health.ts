import express, { Request, Response } from 'express';
import { IndexerHealthMonitor } from '../indexer/health';
import { logger } from '../utils/logger';

export const healthRouter = express.Router();

export function setupHealthRoutes(healthMonitor: IndexerHealthMonitor) {
    // Get health status for all chains
    healthRouter.get('/chains', async (req: Request, res: Response) => {
        try {
            const healthSummary = await healthMonitor.getChainHealthSummary();
            res.json({
                status: 'success',
                data: healthSummary
            });
        } catch (error) {
            logger.error('Error getting chain health:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to get chain health status'
            });
        }
    });

    // Get detailed health status for a specific chain
    healthRouter.get('/chains/:chainId', async (req: Request, res: Response) => {
        try {
            const healthSummary = await healthMonitor.getChainHealthSummary();
            const chainHealth = healthSummary.find((h: { chain_id: string }) => h.chain_id === req.params.chainId);
            
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
        } catch (error) {
            logger.error(`Error getting chain ${req.params.chainId} health:`, error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to get chain health status'
            });
        }
    });

    return healthRouter;
} 