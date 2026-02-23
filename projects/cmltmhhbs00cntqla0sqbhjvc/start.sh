#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltmhhbs00cntqla0sqbhjvc..."
node sync-client.js --auto-approve
