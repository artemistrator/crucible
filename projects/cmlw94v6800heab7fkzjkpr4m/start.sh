#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlw94v6800heab7fkzjkpr4m..."
node sync-client.js --auto-approve
