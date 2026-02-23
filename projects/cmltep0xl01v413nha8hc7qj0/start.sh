#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltep0xl01v413nha8hc7qj0..."
node sync-client.js --auto-approve
