import { Pool } from 'pg';
import { ethers } from 'ethers';
import { chains, dbConfig } from '../config';
import { RPCProvider } from '../provider';

// Database connection
const db = new Pool(dbConfig);

// Cache for block timestamps to reduce RPC calls
const blockTimestampCache = new Map<string, number>();

async function getBlockTimestamp(provider: ethers.Provider, blockNumber: number): Promise<number> {
  const cacheKey = `${provider.network.chainId}-${blockNumber}`;
  
  if (blockTimestampCache.has(cacheKey)) {
    return blockTimestampCache.get(cacheKey)!;
  }
  
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`Block ${blockNumber} not found`);
  }
  
  const timestamp = block.timestamp;
  blockTimestampCache.set(cacheKey, timestamp);
  return timestamp;
}

async function backfillXenBurns(chainId: string, provider: ethers.Provider) {
  console.log(`Backfilling timestamps for xen_burns on chain ${chainId}...`);
  
  // Get all records without timestamps
  const { rows } = await db.query(
    'SELECT id, block_number FROM xen_burns WHERE chain_id = $1 AND (timestamp IS NULL OR timestamp = created_at)',
    [chainId]
  );
  
  console.log(`Found ${rows.length} records to update on chain ${chainId}`);
  
  // Process in batches to avoid memory issues
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}/${Math.ceil(rows.length / batchSize)} on chain ${chainId}`);
    
    // Create a transaction for the batch
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      for (const row of batch) {
        try {
          const timestamp = await getBlockTimestamp(provider, row.block_number);
          await client.query(
            'UPDATE xen_burns SET timestamp = to_timestamp($1) WHERE id = $2',
            [timestamp, row.id]
          );
        } catch (error) {
          console.error(`Error updating record ${row.id}:`, error);
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error processing batch on chain ${chainId}:`, error);
    } finally {
      client.release();
    }
  }
}

async function backfillNftPositions(chainId: string, provider: ethers.Provider) {
  console.log(`Backfilling timestamps for burn_nft_positions on chain ${chainId}...`);
  
  // Get all records without timestamps
  const { rows } = await db.query(
    'SELECT id, block_number, lock_duration FROM burn_nft_positions WHERE chain_id = $1 AND (timestamp IS NULL OR timestamp = created_at)',
    [chainId]
  );
  
  console.log(`Found ${rows.length} records to update on chain ${chainId}`);
  
  // Process in batches to avoid memory issues
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}/${Math.ceil(rows.length / batchSize)} on chain ${chainId}`);
    
    // Create a transaction for the batch
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      for (const row of batch) {
        try {
          const timestamp = await getBlockTimestamp(provider, row.block_number);
          
          // Calculate maturity date from lock duration
          const maturityTimestamp = timestamp + (Number(row.lock_duration) * 86400); // lock_duration in days, convert to seconds
          
          await client.query(
            'UPDATE burn_nft_positions SET timestamp = to_timestamp($1), maturity_date = to_timestamp($2) WHERE id = $3',
            [timestamp, maturityTimestamp, row.id]
          );
        } catch (error) {
          console.error(`Error updating record ${row.id}:`, error);
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error processing batch on chain ${chainId}:`, error);
    } finally {
      client.release();
    }
  }
}

async function main() {
  try {
    console.log('Starting timestamp backfill...');
    
    // Process each chain
    for (const [chainKey, chainConfig] of Object.entries(chains)) {
      const chainId = chainConfig.id.toString();
      console.log(`Processing chain ${chainKey} (${chainId})...`);
      
      // Create provider
      const provider = new RPCProvider(chainId, chainConfig.name, chainConfig.rpcUrls);
      const ethersProvider = await provider.getProvider();
      
      // Backfill timestamps
      await backfillXenBurns(chainId, ethersProvider);
      await backfillNftPositions(chainId, ethersProvider);
    }
    
    console.log('Timestamp backfill completed');
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await db.end();
  }
}

main().catch(console.error); 