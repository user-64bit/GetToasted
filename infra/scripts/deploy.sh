#!/bin/bash
set -e

echo "=== GetToasted Deploy ==="

# Pull latest
git pull origin main

# Build and restart containers
docker-compose build --no-cache
docker-compose down
docker-compose up -d

# Wait for api to be healthy then run migrations
echo "Waiting for API to be healthy..."
timeout 60 bash -c 'until docker-compose exec api wget -qO- http://localhost:3001/health > /dev/null 2>&1; do sleep 2; done'

# Run DB migrations via the db package (requires DATABASE_URL in .env)
export $(grep -v '^#' .env | xargs)
cd packages/db && npx tsx src/migrate.ts && cd -

echo "=== Deploy complete ==="
docker-compose ps
