#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltgfl6100atza05hv0tnxwc..."
node sync-client.js --auto-approve
