#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi
echo "Starting sync client for project cmlz16xb7010b4ym7emt1eg3w..."
node sync-client.js --auto-approve
