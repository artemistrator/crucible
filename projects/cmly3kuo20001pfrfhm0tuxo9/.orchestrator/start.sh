#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi
echo "Starting sync client for project cmly3kuo20001pfrfhm0tuxo9..."
node sync-client.js --auto-approve
