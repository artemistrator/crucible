#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi
echo "Starting sync client for project cmly33gig01s5m0mlmux6sh2w..."
node sync-client.js --auto-approve
