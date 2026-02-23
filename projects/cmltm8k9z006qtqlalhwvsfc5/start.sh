#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltm8k9z006qtqlalhwvsfc5..."
node sync-client.js --auto-approve
