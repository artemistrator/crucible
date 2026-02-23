#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlwqeer0000zflygqtj6rnf6..."
node sync-client.js --auto-approve
