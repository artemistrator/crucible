#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltek2ss00vl13nhbn2lbgi6..."
node sync-client.js --auto-approve
