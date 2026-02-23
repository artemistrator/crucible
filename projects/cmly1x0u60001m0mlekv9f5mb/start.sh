#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmly1x0u60001m0mlekv9f5mb..."
node sync-client.js --auto-approve
