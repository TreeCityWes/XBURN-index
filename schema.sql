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

-- Create event processing log table
CREATE TABLE IF NOT EXISTS event_processing_log (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(10) NOT NULL REFERENCES chains(chain_id),
    contract_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    processed_at TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to create chain-specific tables
CREATE OR REPLACE FUNCTION create_chain_tables(chain_id_param VARCHAR(10))
RETURNS void AS $$
DECLARE
    table_prefix VARCHAR;
BEGIN
    table_prefix := 'chain_' || chain_id_param || '_';
    
    -- Create xen burns table for this chain
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            tx_hash VARCHAR(66) NOT NULL UNIQUE,
            block_number BIGINT NOT NULL,
            from_address VARCHAR(42) NOT NULL,
            amount NUMERIC NOT NULL,
            block_timestamp TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'xen_burns'
    );

    -- Create NFT positions table for this chain
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            tx_hash VARCHAR(66) NOT NULL UNIQUE,
            block_number BIGINT NOT NULL,
            user_address VARCHAR(42) NOT NULL,
            token_id NUMERIC NOT NULL,
            amount NUMERIC NOT NULL,
            lock_duration NUMERIC NOT NULL,
            block_timestamp TIMESTAMP NOT NULL,
            maturity_date TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'burn_nft_positions'
    );

    -- Create swap burns table for this chain
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            tx_hash VARCHAR(66) NOT NULL UNIQUE,
            block_number BIGINT NOT NULL,
            user_address VARCHAR(42) NOT NULL,
            token_address VARCHAR(42) NOT NULL,
            token_amount NUMERIC NOT NULL,
            xen_amount NUMERIC NOT NULL,
            block_timestamp TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'swap_burns'
    );

    -- Create liquidity added table for this chain
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            tx_hash VARCHAR(66) NOT NULL UNIQUE,
            block_number BIGINT NOT NULL,
            user_address VARCHAR(42) NOT NULL,
            token_address VARCHAR(42) NOT NULL,
            token_amount NUMERIC NOT NULL,
            xen_amount NUMERIC NOT NULL,
            block_timestamp TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'liquidity_added'
    );

    -- Create NFT claims table for this chain
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            tx_hash VARCHAR(66) NOT NULL UNIQUE,
            block_number BIGINT NOT NULL,
            user_address VARCHAR(42) NOT NULL,
            token_id NUMERIC NOT NULL,
            base_amount NUMERIC NOT NULL,
            bonus_amount NUMERIC NOT NULL,
            block_timestamp TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'nft_claims'
    );

    -- Create chain statistics table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            total_xen_burned NUMERIC NOT NULL DEFAULT 0,
            total_burn_events INTEGER NOT NULL DEFAULT 0,
            total_unique_burners INTEGER NOT NULL DEFAULT 0,
            total_nft_positions INTEGER NOT NULL DEFAULT 0,
            total_xen_locked NUMERIC NOT NULL DEFAULT 0,
            total_swap_burns INTEGER NOT NULL DEFAULT 0,
            total_xen_swapped NUMERIC NOT NULL DEFAULT 0,
            biggest_burn_amount NUMERIC NOT NULL DEFAULT 0,
            biggest_burn_tx_hash VARCHAR(66),
            biggest_burn_address VARCHAR(42),
            biggest_burn_timestamp TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'chain_stats'
    );

    -- Create user statistics table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            user_address VARCHAR(42) NOT NULL UNIQUE,
            total_xen_burned NUMERIC NOT NULL DEFAULT 0,
            burn_count INTEGER NOT NULL DEFAULT 0,
            nft_position_count INTEGER NOT NULL DEFAULT 0,
            total_xen_locked NUMERIC NOT NULL DEFAULT 0,
            swap_burn_count INTEGER NOT NULL DEFAULT 0,
            total_xen_swapped NUMERIC NOT NULL DEFAULT 0,
            first_activity_timestamp TIMESTAMP,
            last_activity_timestamp TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )', table_prefix || 'user_stats'
    );

    -- Create indexes for the chain-specific tables
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(from_address)', 
        table_prefix || 'xen_burns_from_address_idx', 
        table_prefix || 'xen_burns'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(block_number)', 
        table_prefix || 'xen_burns_block_number_idx', 
        table_prefix || 'xen_burns'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(block_timestamp)', 
        table_prefix || 'xen_burns_timestamp_idx', 
        table_prefix || 'xen_burns'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(amount)', 
        table_prefix || 'xen_burns_amount_idx', 
        table_prefix || 'xen_burns'
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_address)', 
        table_prefix || 'burn_nft_positions_user_address_idx', 
        table_prefix || 'burn_nft_positions'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(token_id)', 
        table_prefix || 'burn_nft_positions_token_id_idx', 
        table_prefix || 'burn_nft_positions'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(block_timestamp)', 
        table_prefix || 'burn_nft_positions_timestamp_idx', 
        table_prefix || 'burn_nft_positions'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(maturity_date)', 
        table_prefix || 'burn_nft_positions_maturity_idx', 
        table_prefix || 'burn_nft_positions'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(amount)', 
        table_prefix || 'burn_nft_positions_amount_idx', 
        table_prefix || 'burn_nft_positions'
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_address)', 
        table_prefix || 'swap_burns_user_address_idx', 
        table_prefix || 'swap_burns'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(block_timestamp)', 
        table_prefix || 'swap_burns_timestamp_idx', 
        table_prefix || 'swap_burns'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(xen_amount)', 
        table_prefix || 'swap_burns_xen_amount_idx', 
        table_prefix || 'swap_burns'
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_address)', 
        table_prefix || 'user_stats_address_idx', 
        table_prefix || 'user_stats'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(total_xen_burned)', 
        table_prefix || 'user_stats_total_burned_idx', 
        table_prefix || 'user_stats'
    );
END;
$$ LANGUAGE plpgsql;

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
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20),
    error_message TEXT
);

-- Create indexes for event processing log
CREATE INDEX IF NOT EXISTS idx_event_processing_chain_id ON event_processing_log(chain_id);
CREATE INDEX IF NOT EXISTS idx_event_processing_status ON event_processing_log(status);
CREATE INDEX IF NOT EXISTS idx_event_processing_processed_at ON event_processing_log(processed_at);
CREATE INDEX IF NOT EXISTS idx_event_processing_block_number ON event_processing_log(block_number);

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
        checked_at, 
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
        checked_at = EXCLUDED.checked_at,
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

-- Function to update user statistics
CREATE OR REPLACE FUNCTION update_user_stats(
    p_chain_id VARCHAR(10),
    p_user_address VARCHAR(42),
    p_xen_burned NUMERIC,
    p_burn_count INTEGER,
    p_nft_position_count INTEGER,
    p_xen_locked NUMERIC,
    p_swap_burn_count INTEGER,
    p_xen_swapped NUMERIC,
    p_timestamp TIMESTAMP
)
RETURNS void AS $$
DECLARE
    table_name VARCHAR;
    query_text TEXT;
BEGIN
    table_name := 'chain_' || p_chain_id || '_user_stats';
    
    query_text := format('
        INSERT INTO %I (
            user_address, 
            total_xen_burned, 
            burn_count, 
            nft_position_count, 
            total_xen_locked, 
            swap_burn_count, 
            total_xen_swapped,
            first_activity_timestamp,
            last_activity_timestamp,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
        ON CONFLICT (user_address) DO UPDATE SET
            total_xen_burned = %I.total_xen_burned + $2,
            burn_count = %I.burn_count + $3,
            nft_position_count = %I.nft_position_count + $4,
            total_xen_locked = %I.total_xen_locked + $5,
            swap_burn_count = %I.swap_burn_count + $6,
            total_xen_swapped = %I.total_xen_swapped + $7,
            first_activity_timestamp = LEAST(%I.first_activity_timestamp, $8),
            last_activity_timestamp = GREATEST(%I.last_activity_timestamp, $8),
            updated_at = NOW()',
        table_name, table_name, table_name, table_name, table_name, 
        table_name, table_name, table_name, table_name
    );
    
    EXECUTE query_text USING 
        p_user_address, p_xen_burned, p_burn_count, p_nft_position_count, 
        p_xen_locked, p_swap_burn_count, p_xen_swapped, p_timestamp;
END;
$$ LANGUAGE plpgsql;

-- Function to update chain statistics
CREATE OR REPLACE FUNCTION update_chain_stats(p_chain_id VARCHAR(10))
RETURNS void AS $$
DECLARE
    burn_table VARCHAR;
    position_table VARCHAR;
    swap_table VARCHAR;
    stats_table VARCHAR;
    v_total_xen_burned NUMERIC;
    v_total_burn_events INTEGER;
    v_total_unique_burners INTEGER;
    v_total_nft_positions INTEGER;
    v_total_xen_locked NUMERIC;
    v_total_swap_burns INTEGER;
    v_total_xen_swapped NUMERIC;
    v_biggest_burn_amount NUMERIC;
    v_biggest_burn_tx_hash VARCHAR(66);
    v_biggest_burn_address VARCHAR(42);
    v_biggest_burn_timestamp TIMESTAMP;
BEGIN
    burn_table := 'chain_' || p_chain_id || '_xen_burns';
    position_table := 'chain_' || p_chain_id || '_burn_nft_positions';
    swap_table := 'chain_' || p_chain_id || '_swap_burns';
    stats_table := 'chain_' || p_chain_id || '_chain_stats';
    
    -- Calculate burn statistics
    EXECUTE format('SELECT COALESCE(SUM(amount), 0) FROM %I', burn_table) INTO v_total_xen_burned;
    EXECUTE format('SELECT COUNT(*) FROM %I', burn_table) INTO v_total_burn_events;
    EXECUTE format('SELECT COUNT(DISTINCT from_address) FROM %I', burn_table) INTO v_total_unique_burners;
    
    -- Calculate NFT position statistics
    EXECUTE format('SELECT COUNT(*) FROM %I', position_table) INTO v_total_nft_positions;
    EXECUTE format('SELECT COALESCE(SUM(amount), 0) FROM %I', position_table) INTO v_total_xen_locked;
    
    -- Calculate swap burn statistics
    EXECUTE format('SELECT COUNT(*) FROM %I', swap_table) INTO v_total_swap_burns;
    EXECUTE format('SELECT COALESCE(SUM(xen_amount), 0) FROM %I', swap_table) INTO v_total_xen_swapped;
    
    -- Find biggest burn
    EXECUTE format('
        SELECT amount, tx_hash, from_address, block_timestamp
        FROM %I
        ORDER BY amount DESC
        LIMIT 1', burn_table
    ) INTO v_biggest_burn_amount, v_biggest_burn_tx_hash, v_biggest_burn_address, v_biggest_burn_timestamp;
    
    -- Update or insert chain stats
    EXECUTE format('
        INSERT INTO %I (
            total_xen_burned,
            total_burn_events,
            total_unique_burners,
            total_nft_positions,
            total_xen_locked,
            total_swap_burns,
            total_xen_swapped,
            biggest_burn_amount,
            biggest_burn_tx_hash,
            biggest_burn_address,
            biggest_burn_timestamp,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
            total_xen_burned = $1,
            total_burn_events = $2,
            total_unique_burners = $3,
            total_nft_positions = $4,
            total_xen_locked = $5,
            total_swap_burns = $6,
            total_xen_swapped = $7,
            biggest_burn_amount = $8,
            biggest_burn_tx_hash = $9,
            biggest_burn_address = $10,
            biggest_burn_timestamp = $11,
            updated_at = NOW()
    ', stats_table) USING 
        v_total_xen_burned, v_total_burn_events, v_total_unique_burners,
        v_total_nft_positions, v_total_xen_locked, v_total_swap_burns, 
        v_total_xen_swapped, v_biggest_burn_amount, v_biggest_burn_tx_hash,
        v_biggest_burn_address, v_biggest_burn_timestamp;
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
SET name = EXCLUDED.name,
    rpc_url = EXCLUDED.rpc_url,
    start_block = EXCLUDED.start_block;

-- Create tables for each chain
DO $$ 
DECLARE 
    chain_record RECORD;
BEGIN
    FOR chain_record IN SELECT chain_id FROM chains
    LOOP
        PERFORM create_chain_tables(chain_record.chain_id);
    END LOOP;
END $$;

-- Create initial stats entries for each chain
DO $$
DECLARE
    chain_record RECORD;
BEGIN
    FOR chain_record IN SELECT chain_id FROM chains
    LOOP
        EXECUTE format('
            INSERT INTO chain_%s_chain_stats (
                total_xen_burned, total_burn_events, total_unique_burners,
                total_nft_positions, total_xen_locked, total_swap_burns,
                total_xen_swapped, biggest_burn_amount
            ) 
            VALUES (0, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (id) DO NOTHING', 
            chain_record.chain_id
        );
    END LOOP;
END $$;

-- Create views for analytics

-- Top burns by chain
CREATE OR REPLACE FUNCTION create_top_burns_view(chain_id_param VARCHAR(10))
RETURNS void AS $$
BEGIN
    -- Drop view if exists to avoid conflicts
    EXECUTE format('DROP VIEW IF EXISTS top_burns_%s CASCADE', chain_id_param);
    
    EXECUTE format('
        CREATE VIEW top_burns_%s AS
        SELECT 
            from_address,
            amount,
            tx_hash,
            block_timestamp::timestamp as block_timestamp,
            block_number
        FROM chain_%s_xen_burns
        ORDER BY amount DESC
        LIMIT 100
    ', chain_id_param, chain_id_param);
END;
$$ LANGUAGE plpgsql;

-- Daily burns by chain
CREATE OR REPLACE FUNCTION create_daily_burns_view(chain_id_param VARCHAR(10))
RETURNS void AS $$
BEGIN
    -- Drop view if exists to avoid conflicts
    EXECUTE format('DROP VIEW IF EXISTS daily_burns_%s CASCADE', chain_id_param);
    
    EXECUTE format('
        CREATE VIEW daily_burns_%s AS
        SELECT 
            DATE_TRUNC(''day'', block_timestamp::timestamp) as burn_date,
            COUNT(*) as num_burns,
            SUM(amount) as total_amount_burned,
            COUNT(DISTINCT from_address) as unique_burners,
            AVG(amount) as avg_burn_amount,
            MAX(amount) as max_burn_amount
        FROM chain_%s_xen_burns
        GROUP BY DATE_TRUNC(''day'', block_timestamp::timestamp)
        ORDER BY burn_date DESC
    ', chain_id_param, chain_id_param);
END;
$$ LANGUAGE plpgsql;

-- Top users by chain
CREATE OR REPLACE FUNCTION create_top_users_view(chain_id_param VARCHAR(10))
RETURNS void AS $$
BEGIN
    EXECUTE format('
        CREATE OR REPLACE VIEW top_users_%s AS
        SELECT 
            user_address,
            total_xen_burned,
            burn_count,
            nft_position_count,
            total_xen_locked,
            swap_burn_count,
            total_xen_swapped,
            first_activity_timestamp,
            last_activity_timestamp
        FROM chain_%s_user_stats
        ORDER BY total_xen_burned DESC
        LIMIT 100
    ', chain_id_param, chain_id_param);
END;
$$ LANGUAGE plpgsql;

-- Create views for each chain
DO $$ 
DECLARE 
    chain_record RECORD;
BEGIN
    FOR chain_record IN SELECT chain_id FROM chains
    LOOP
        PERFORM create_top_burns_view(chain_record.chain_id);
        PERFORM create_daily_burns_view(chain_record.chain_id);
        PERFORM create_top_users_view(chain_record.chain_id);
    END LOOP;
END $$;

-- Log that schema has been applied
DO $$ BEGIN RAISE NOTICE 'Schema and views applied successfully!'; END $$; 