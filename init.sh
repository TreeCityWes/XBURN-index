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
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS update_chain_stats(character varying) CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS update_user_stats(character varying, character varying, numeric, integer, integer, numeric, integer, numeric, timestamp without time zone) CASCADE;" || true
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP FUNCTION IF EXISTS create_chain_tables(character varying) CASCADE;" || true

# Apply schema
echo "📋 Applying database schema..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f /app/schema.sql

# Run TypeScript initialization
echo "🔧 Running TypeScript initialization..."
cd /app && npm run init-db

echo "✅ Initialization completed successfully!" 