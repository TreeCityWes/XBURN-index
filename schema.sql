-- Log that schema is being applied
DO $$ BEGIN RAISE NOTICE 'Applying schema...'; END $$;

-- Create chain configuration table first (as it's referenced by foreign keys)
CREATE TABLE IF NOT EXISTS chains (
    chain_id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    rpc_url VARCHAR(255) NOT NULL,
    start_block BIGINT NOT NULL,
    last_indexed_block BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tables for XEN burns and NFT positions
CREATE TABLE IF NOT EXISTS xen_burns (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS burn_nft_positions (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    token_id NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    lock_duration NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chain-specific token stats
CREATE TABLE IF NOT EXISTS chain_token_stats (
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    total_supply NUMERIC NOT NULL DEFAULT 0,
    total_burned NUMERIC NOT NULL DEFAULT 0,
    holders_count INTEGER NOT NULL DEFAULT 0,
    burn_rate_24h NUMERIC NOT NULL DEFAULT 0,
    avg_burn_amount NUMERIC NOT NULL DEFAULT 0,
    max_burn_amount NUMERIC NOT NULL DEFAULT 0,
    min_burn_amount NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chain_id)
);

-- Create chain-specific price tracking
CREATE TABLE IF NOT EXISTS token_prices (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    token_symbol VARCHAR(10) NOT NULL,
    price_usd NUMERIC NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    UNIQUE(chain_id, token_symbol, timestamp)
);

-- Create chain statistics table
CREATE TABLE IF NOT EXISTS chain_stats (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    total_burns NUMERIC NOT NULL DEFAULT 0,
    total_burn_value_usd NUMERIC NOT NULL DEFAULT 0,
    total_positions BIGINT NOT NULL DEFAULT 0,
    active_positions BIGINT NOT NULL DEFAULT 0,
    unique_burners BIGINT NOT NULL DEFAULT 0,
    last_24h_burns NUMERIC NOT NULL DEFAULT 0,
    avg_lock_period NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chain_id)
);

-- Create chain health status table
CREATE TABLE IF NOT EXISTS chain_health (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    is_healthy BOOLEAN DEFAULT false,
    last_successful_index TIMESTAMP,
    error_message TEXT,
    blocks_behind BIGINT,
    rpc_latency_ms INTEGER,
    status VARCHAR(20) DEFAULT 'unknown',
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_rpc_url TEXT,
    UNIQUE(chain_id)
);

-- Create chain indexing history for tracking performance
CREATE TABLE IF NOT EXISTS indexing_history (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    start_block BIGINT NOT NULL,
    end_block BIGINT NOT NULL,
    burns_indexed INTEGER,
    positions_indexed INTEGER,
    duration_ms INTEGER,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_xen_burns_chain_id ON xen_burns(chain_id);
CREATE INDEX IF NOT EXISTS idx_xen_burns_from_address ON xen_burns(from_address);
CREATE INDEX IF NOT EXISTS idx_xen_burns_block_number ON xen_burns(block_number);
CREATE INDEX IF NOT EXISTS idx_xen_burns_created_at ON xen_burns(created_at);

CREATE INDEX IF NOT EXISTS idx_burn_nft_positions_chain_id ON burn_nft_positions(chain_id);
CREATE INDEX IF NOT EXISTS idx_burn_nft_positions_user_address ON burn_nft_positions(user_address);
CREATE INDEX IF NOT EXISTS idx_burn_nft_positions_token_id ON burn_nft_positions(token_id);
CREATE INDEX IF NOT EXISTS idx_burn_nft_positions_block_number ON burn_nft_positions(block_number);
CREATE INDEX IF NOT EXISTS idx_burn_nft_positions_created_at ON burn_nft_positions(created_at);

-- Add foreign key constraints to existing tables
ALTER TABLE xen_burns
ADD CONSTRAINT fk_xen_burns_chain
FOREIGN KEY (chain_id) REFERENCES chains(chain_id);

ALTER TABLE burn_nft_positions
ADD CONSTRAINT fk_burn_nft_positions_chain
FOREIGN KEY (chain_id) REFERENCES chains(chain_id);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_token_prices_chain_timestamp ON token_prices(chain_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_chain_stats_updated_at ON chain_stats(updated_at);

-- Create function to update chain stats
CREATE OR REPLACE FUNCTION update_chain_stats(chain_id_param VARCHAR(10))
RETURNS void AS $$
BEGIN
    INSERT INTO chain_stats (
        chain_id,
        total_burns,
        total_positions,
        active_positions,
        unique_burners,
        last_24h_burns,
        avg_lock_period
    )
    SELECT 
        chain_id_param,
        COALESCE(SUM(amount), 0) as total_burns,
        COUNT(DISTINCT token_id) as total_positions,
        COUNT(DISTINCT CASE WHEN (created_at + (lock_duration * interval '1 day')) > NOW() THEN token_id END) as active_positions,
        COUNT(DISTINCT user_address) as unique_burners,
        COALESCE((
            SELECT SUM(amount)
            FROM xen_burns
            WHERE chain_id = chain_id_param
            AND created_at >= NOW() - interval '24 hours'
        ), 0) as last_24h_burns,
        COALESCE(AVG(lock_duration), 0) as avg_lock_period
    FROM burn_nft_positions
    WHERE chain_id = chain_id_param
    ON CONFLICT (chain_id)
    DO UPDATE SET
        total_burns = EXCLUDED.total_burns,
        total_positions = EXCLUDED.total_positions,
        active_positions = EXCLUDED.active_positions,
        unique_burners = EXCLUDED.unique_burners,
        last_24h_burns = EXCLUDED.last_24h_burns,
        avg_lock_period = EXCLUDED.avg_lock_period,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update chain health status
CREATE OR REPLACE FUNCTION update_chain_health(
    p_chain_id VARCHAR,
    p_is_healthy BOOLEAN,
    p_error_message TEXT,
    p_blocks_behind BIGINT,
    p_rpc_latency_ms INTEGER,
    p_current_rpc_url TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO chain_health (
        chain_id, 
        is_healthy, 
        last_checked, 
        error_message, 
        blocks_behind, 
        rpc_latency_ms,
        current_rpc_url
    )
    VALUES (
        p_chain_id, 
        p_is_healthy, 
        NOW(), 
        p_error_message, 
        p_blocks_behind, 
        p_rpc_latency_ms,
        p_current_rpc_url
    )
    ON CONFLICT (chain_id) 
    DO UPDATE SET
        is_healthy = EXCLUDED.is_healthy,
        last_checked = EXCLUDED.last_checked,
        error_message = EXCLUDED.error_message,
        blocks_behind = EXCLUDED.blocks_behind,
        rpc_latency_ms = EXCLUDED.rpc_latency_ms,
        current_rpc_url = EXCLUDED.current_rpc_url;
END;
$$ LANGUAGE plpgsql;

-- Function to log indexing performance
CREATE OR REPLACE FUNCTION log_indexing_performance(
    p_chain_id VARCHAR(10),
    p_start_block BIGINT,
    p_end_block BIGINT,
    p_burns_indexed INTEGER,
    p_positions_indexed INTEGER,
    p_duration_ms INTEGER
)
RETURNS void AS $$
BEGIN
    INSERT INTO indexing_history (
        chain_id,
        start_block,
        end_block,
        burns_indexed,
        positions_indexed,
        duration_ms
    )
    VALUES (
        p_chain_id,
        p_start_block,
        p_end_block,
        p_burns_indexed,
        p_positions_indexed,
        p_duration_ms
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get chain health summary
CREATE OR REPLACE FUNCTION get_chain_health_summary()
RETURNS TABLE (
    chain_id VARCHAR(10),
    chain_name VARCHAR(50),
    status VARCHAR(20),
    last_indexed_block BIGINT,
    blocks_behind BIGINT,
    last_successful_index TIMESTAMP,
    avg_index_duration_ms INTEGER,
    total_burns NUMERIC,
    total_positions BIGINT,
    health_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.chain_id,
        c.name as chain_name,
        ch.status,
        c.last_indexed_block,
        ch.blocks_behind,
        ch.last_successful_index,
        COALESCE((
            SELECT AVG(duration_ms)::INTEGER 
            FROM indexing_history ih 
            WHERE ih.chain_id = c.chain_id 
            AND ih.indexed_at >= NOW() - interval '1 hour'
        ), 0) as avg_index_duration_ms,
        cs.total_burns,
        cs.total_positions,
        CASE
            WHEN ch.error_message IS NOT NULL THEN 'Error: ' || ch.error_message
            WHEN ch.blocks_behind > 1000 THEN 'Warning: ' || ch.blocks_behind || ' blocks behind'
            WHEN NOW() - COALESCE(ch.last_successful_index, '1970-01-01'::timestamp) > interval '1 hour' 
                THEN 'Warning: No successful index in last hour'
            ELSE 'Healthy'
        END as health_status
    FROM chains c
    LEFT JOIN chain_health ch ON c.chain_id = ch.chain_id
    LEFT JOIN chain_stats cs ON c.chain_id = cs.chain_id
    ORDER BY c.chain_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update chain token stats
CREATE OR REPLACE FUNCTION update_chain_token_stats(chain_id_param VARCHAR(10))
RETURNS void AS $$
BEGIN
    INSERT INTO chain_token_stats (
        chain_id,
        total_burned,
        holders_count,
        burn_rate_24h,
        avg_burn_amount,
        max_burn_amount,
        min_burn_amount,
        updated_at
    )
    SELECT 
        chain_id_param,
        COALESCE(SUM(amount), 0) as total_burned,
        COUNT(DISTINCT from_address) as holders_count,
        COALESCE((
            SELECT SUM(amount)
            FROM xen_burns
            WHERE chain_id = chain_id_param
            AND created_at >= NOW() - interval '24 hours'
        ), 0) as burn_rate_24h,
        COALESCE(AVG(amount), 0) as avg_burn_amount,
        COALESCE(MAX(amount), 0) as max_burn_amount,
        COALESCE(MIN(amount), 0) as min_burn_amount,
        NOW() as updated_at
    FROM xen_burns
    WHERE chain_id = chain_id_param
    ON CONFLICT (chain_id)
    DO UPDATE SET
        total_burned = EXCLUDED.total_burned,
        holders_count = EXCLUDED.holders_count,
        burn_rate_24h = EXCLUDED.burn_rate_24h,
        avg_burn_amount = EXCLUDED.avg_burn_amount,
        max_burn_amount = EXCLUDED.max_burn_amount,
        min_burn_amount = EXCLUDED.min_burn_amount,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Insert chain data for all supported chains
INSERT INTO chains (chain_id, name, rpc_url, start_block)
VALUES 
    ('8453', 'Base', 'https://base.llamarpc.com', 29193678),
    ('1', 'Ethereum', 'https://eth.llamarpc.com', 17000000),
    ('137', 'Polygon', 'https://polygon.llamarpc.com', 45000000),
    ('10', 'Optimism', 'https://optimism.llamarpc.com', 108000000),
    ('369', 'PulseChain', 'https://rpc.pulsechain.com', 17000000),
    ('56', 'BSC', 'https://bsc.llamarpc.com', 28000000),
    ('43114', 'Avalanche', 'https://avalanche.llamarpc.com', 30000000)
ON CONFLICT (chain_id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    rpc_url = EXCLUDED.rpc_url,
    start_block = EXCLUDED.start_block,
    updated_at = CURRENT_TIMESTAMP;

-- Log that schema has been applied
DO $$ BEGIN RAISE NOTICE 'Schema applied successfully!'; END $$; 