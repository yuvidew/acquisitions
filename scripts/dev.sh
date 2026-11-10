#!/bin/bash

# Development startup script for Acquisitions App with Neon Local.
# Starts the app in development mode with a Neon Local ephemeral branch.

COMPOSE="docker compose --env-file .env.development -f docker-compose.dev.yml"

echo "🚀 Starting Acquisitions App in Development Mode"
echo "================================================"

# Check if .env.development exists
if [ ! -f .env.development ]; then
    echo "❌ Error: .env.development file not found!"
    echo "   Please create .env.development and add your Neon credentials."
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

echo "📦 Building and starting development containers..."
echo "   - Neon Local proxy will create an ephemeral database branch"
echo "   - Application will run with hot reload enabled"
echo ""

# Start detached and wait until Neon Local reports healthy
$COMPOSE up --build -d --wait || { echo "❌ Failed to start containers"; exit 1; }

# Run migrations after the database is up (the branch is new on every start)
echo "📜 Applying latest schema with Drizzle..."
$COMPOSE exec app npm run db:migrate || { echo "❌ Migration failed"; $COMPOSE down; exit 1; }

echo ""
echo "🎉 Development environment started!"
echo "   Application: http://localhost:3000"
echo "   Database:    postgres://neon:npg@localhost:5432/neondb"
echo ""
echo "Press Ctrl+C to stop the environment (the ephemeral branch is deleted)."
echo ""

# Ctrl+C -> tear everything down
trap '$COMPOSE down; exit 0' INT TERM
$COMPOSE logs -f app
