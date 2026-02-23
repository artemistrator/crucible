#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlxz6dcd0007lc3dve4hb1xb..."
node sync-client.js --auto-approve
