#!/bin/bash

# Wait for PostgreSQL to be ready
until PGPASSWORD=postgres psql -h postgres -U postgres -d postgres -c '\q'; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "Postgres is up - executing schema"

# Create database if it doesn't exist
PGPASSWORD=postgres psql -h postgres -U postgres -d postgres -c "CREATE DATABASE xen_burn_analytics;" || true

# Apply schema
PGPASSWORD=postgres psql -h postgres -U postgres -d xen_burn_analytics -f /app/schema.sql

echo "Schema applied successfully" 