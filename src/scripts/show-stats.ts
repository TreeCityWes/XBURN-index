import { Pool } from 'pg';
import { chains, getDbConfig } from '../config';

async function showChainStats() {
    console.log('Fetching chain statistics...');
    
    for (const [chainName, chainConfig] of Object.entries(chains)) {
        const chainId = chainConfig.id.toString();
        console.log(`\n=== Chain: ${chainName} (${chainId}) ===`);
        
        try {
            const db = new Pool(getDbConfig(chainId));
            
            // Get chain stats
            const { rows: statsRows } = await db.query(`SELECT * FROM chain_${chainId}_chain_stats LIMIT 1`);
            if (statsRows.length > 0) {
                const stats = statsRows[0];
                console.log('\nChain Statistics:');
                console.log(`Total XEN Burned: ${Number(stats.total_xen_burned).toLocaleString()}`);
                console.log(`Total Burn Events: ${stats.total_burn_events}`);
                console.log(`Unique Burners: ${stats.total_unique_burners}`);
                console.log(`NFT Positions: ${stats.total_nft_positions}`);
                console.log(`Total XEN Locked: ${Number(stats.total_xen_locked).toLocaleString()}`);
                console.log(`Swap Burns: ${stats.total_swap_burns}`);
                console.log(`XEN Swapped: ${Number(stats.total_xen_swapped).toLocaleString()}`);
                
                if (stats.biggest_burn_amount > 0) {
                    console.log('\nBiggest Burn:');
                    console.log(`Amount: ${Number(stats.biggest_burn_amount).toLocaleString()}`);
                    console.log(`Address: ${stats.biggest_burn_address}`);
                    console.log(`TX Hash: ${stats.biggest_burn_tx_hash}`);
                    console.log(`Time: ${new Date(stats.biggest_burn_timestamp).toLocaleString()}`);
                }
            } else {
                console.log('No chain statistics available');
            }
            
            // Get top burns
            const { rows: topBurns } = await db.query(`
                SELECT from_address, amount, tx_hash, block_timestamp 
                FROM chain_${chainId}_xen_burns 
                ORDER BY amount DESC LIMIT 5
            `);
            
            if (topBurns.length > 0) {
                console.log('\nTop 5 Burns:');
                topBurns.forEach((burn, index) => {
                    console.log(`${index + 1}. Address: ${burn.from_address}, Amount: ${Number(burn.amount).toLocaleString()}, Time: ${new Date(burn.block_timestamp).toLocaleString()}`);
                });
            } else {
                console.log('\nNo burns recorded yet');
            }
            
            // Get top users
            const { rows: topUsers } = await db.query(`
                SELECT user_address, total_xen_burned, burn_count
                FROM chain_${chainId}_user_stats
                ORDER BY total_xen_burned DESC LIMIT 5
            `);
            
            if (topUsers.length > 0) {
                console.log('\nTop 5 Users by Burn Amount:');
                topUsers.forEach((user, index) => {
                    console.log(`${index + 1}. Address: ${user.user_address}, Total Burned: ${Number(user.total_xen_burned).toLocaleString()}, Burn Count: ${user.burn_count}`);
                });
            } else {
                console.log('\nNo user statistics available');
            }
            
            await db.end();
        } catch (error) {
            console.error(`Error fetching stats for chain ${chainName}:`, error);
        }
    }
}

showChainStats().catch(console.error); 