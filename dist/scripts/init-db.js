"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
async function initializeDatabase() {
    const pool = new pg_1.Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'xen_burn_analytics',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.DB_SSL === 'true'
    });
    const client = await pool.connect();
    try {
        // Start transaction
        await client.query('BEGIN');
        // Drop existing tables and functions
        await client.query(`
            DROP TABLE IF EXISTS chain_token_stats CASCADE;
            DROP TABLE IF EXISTS xen_burns CASCADE;
            DROP TABLE IF EXISTS burn_nft_positions CASCADE;
            DROP TABLE IF EXISTS chains CASCADE;
            DROP FUNCTION IF EXISTS update_chain_token_stats CASCADE;
        `);
        console.log('Dropped existing tables');
        // Read and execute schema.sql
        const schemaPath = (0, path_1.join)(__dirname, '..', '..', 'schema.sql');
        const schemaSql = (0, fs_1.readFileSync)(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('Schema created successfully');
        // Initialize all supported chains
        for (const [chainName, chainConfig] of Object.entries(config_1.chains)) {
            const rpcUrl = process.env[`${chainName.toUpperCase()}_RPC_URL`] || chainConfig.rpcUrls[0];
            const startBlock = parseInt(process.env[`START_BLOCK_${chainName.toUpperCase()}`] || chainConfig.startBlock.toString());
            await client.query(`
                INSERT INTO chains (chain_id, name, rpc_url, start_block)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (chain_id) DO UPDATE 
                SET name = EXCLUDED.name,
                    rpc_url = EXCLUDED.rpc_url,
                    start_block = EXCLUDED.start_block
            `, [chainConfig.id.toString(), chainConfig.name, rpcUrl, startBlock]);
            // Initialize chain stats
            await client.query(`
                INSERT INTO chain_token_stats (chain_id, total_supply, total_burned)
                VALUES ($1, 0, 0)
                ON CONFLICT (chain_id) DO NOTHING
            `, [chainConfig.id.toString()]);
            console.log(`Initialized chain: ${chainConfig.name}`);
        }
        // Test queries
        const { rows: chainsRows } = await client.query('SELECT * FROM chains');
        console.log('Chains in database:', chainsRows);
        const { rows: stats } = await client.query('SELECT * FROM chain_token_stats');
        console.log('Chain stats:', stats);
        // Commit transaction
        await client.query('COMMIT');
        console.log('Database initialization completed successfully');
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing database:', error);
        throw error;
    }
    finally {
        client.release();
        await pool.end();
    }
}
initializeDatabase().catch(console.error);
