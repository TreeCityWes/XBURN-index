import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chains, getDbConfig } from '../config';

async function initializeDatabase() {
    // Connect to the single database
    const db = new Pool(getDbConfig());

    try {
        // Test connection
        await db.connect();
        console.log('Connected to database successfully');

        // Read and execute schema.sql
        const schemaPath = join(__dirname, '..', '..', 'schema.sql');
        const schemaSql = readFileSync(schemaPath, 'utf8');
        
        console.log('Applying database schema...');
        await db.query(schemaSql);
        console.log('Schema applied successfully');

        // Initialize chain configurations
        for (const [chainName, chainConfig] of Object.entries(chains)) {
            console.log(`Initializing chain: ${chainConfig.name} (${chainConfig.id})`);
            
            // Initialize chain configuration
            const rpcUrl = process.env[`${chainName.toUpperCase()}_RPC_URL`] || chainConfig.rpcUrls[0];
            const startBlock = parseInt(process.env[`START_BLOCK_${chainName.toUpperCase()}`] || chainConfig.startBlock.toString());
            
            await db.query(`
                INSERT INTO chains (chain_id, name, rpc_url, start_block)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (chain_id) DO UPDATE 
                SET name = EXCLUDED.name,
                    rpc_url = EXCLUDED.rpc_url,
                    start_block = EXCLUDED.start_block,
                    updated_at = NOW()
            `, [chainConfig.id.toString(), chainConfig.name, rpcUrl, startBlock]);
            
            console.log(`✅ Initialized chain: ${chainConfig.name} (${chainConfig.id})`);
        }

        console.log('🎉 Database initialization completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during database initialization:', error);
        throw error;
    } finally {
        await db.end();
    }
}

initializeDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
}); 