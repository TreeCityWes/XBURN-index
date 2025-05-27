import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chains, getDbConfig } from '../config';

async function createDatabase(dbName: string, adminPool: Pool) {
    try {
        await adminPool.query(`CREATE DATABASE ${dbName}`);
        console.log(`Created database: ${dbName}`);
    } catch (error: any) {
        if (error.code === '42P04') { // Database already exists error code
            console.log(`Database ${dbName} already exists`);
        } else {
            throw error;
        }
    }
}

async function initializeDatabase() {
    // Connect to default postgres database first to create other databases
    const adminPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.DB_SSL === 'true'
    });

    try {
        // Create databases for each chain
        for (const [chainName, chainConfig] of Object.entries(chains)) {
            const dbName = `xburn_${chainConfig.id}`;
            await createDatabase(dbName, adminPool);

            // Connect to the new database and initialize schema
            const chainPool = new Pool(getDbConfig(chainConfig.id.toString()));
            const client = await chainPool.connect();

            try {
                // Start transaction
                await client.query('BEGIN');

                // Read and execute schema.sql
                const schemaPath = join(__dirname, '..', '..', 'schema.sql');
                const schemaSql = readFileSync(schemaPath, 'utf8');
                await client.query(schemaSql);

                // Initialize chain configuration
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
                
                // Initialize chain statistics
                await client.query(`
                    SELECT update_chain_stats($1)
                `, [chainConfig.id.toString()]);

                await client.query('COMMIT');
                console.log(`Initialized schema for chain: ${chainConfig.name} (${chainConfig.id})`);

            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`Error initializing schema for chain ${chainConfig.name}:`, error);
                throw error;
            } finally {
                client.release();
                await chainPool.end();
            }
        }

        console.log('Database initialization completed successfully');

    } catch (error) {
        console.error('Error during database initialization:', error);
        throw error;
    } finally {
        await adminPool.end();
    }
}

initializeDatabase().catch(console.error); 