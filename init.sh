#!/bin/bash

echo "🚀 Starting XBurn Indexer initialization..."

# Set PGPASSWORD to avoid password prompts
export PGPASSWORD=$DB_PASSWORD

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Check if database exists
DB_EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres)

if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database $DB_NAME..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" postgres
fi

# Drop existing functions to avoid conflicts
echo "🧹 Cleaning up existing functions..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS update_chain_stats CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS update_user_stats CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS create_chain_tables CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS create_top_burns_view CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS create_daily_burns_view CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS create_top_users_view CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS log_indexing_performance CASCADE;" || true

# Drop views that might depend on these functions
echo "🧹 Cleaning up existing views..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP VIEW IF EXISTS top_burns_1, top_burns_8453, top_burns_137, top_burns_10, top_burns_369, top_burns_56, top_burns_43114 CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP VIEW IF EXISTS daily_burns_1, daily_burns_8453, daily_burns_137, daily_burns_10, daily_burns_369, daily_burns_56, daily_burns_43114 CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP VIEW IF EXISTS top_users_1, top_users_8453, top_users_137, top_users_10, top_users_369, top_users_56, top_users_43114 CASCADE;" || true

# Apply schema
echo "📋 Applying database schema..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f /app/schema.sql

# Run TypeScript initialization
echo "🔧 Running TypeScript initialization..."
cd /app && npm run init-db

echo "✅ Initialization completed successfully!"

# Exit explicitly with success code
exit 0 