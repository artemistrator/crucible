#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi
echo "Starting sync client for project cmlyyz8fl00014ym7odows8aj..."
node sync-client.js --auto-approve
