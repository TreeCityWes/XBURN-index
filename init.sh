#!/bin/bash
set -e

echo "Starting database initialization..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 5

# Initialize databases for each chain
echo "Running database initialization..."
npm run init-db

echo "Database initialization complete." 