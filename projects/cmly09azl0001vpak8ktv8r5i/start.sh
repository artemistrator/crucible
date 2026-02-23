#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmly09azl0001vpak8ktv8r5i..."
node sync-client.js --auto-approve
