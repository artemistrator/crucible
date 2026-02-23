#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmly2ak1r00x4m0mlxgr9y0eo..."
node sync-client.js --auto-approve
