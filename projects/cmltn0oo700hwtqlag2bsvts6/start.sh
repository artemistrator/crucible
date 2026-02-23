#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltn0oo700hwtqlag2bsvts6..."
node sync-client.js --auto-approve
