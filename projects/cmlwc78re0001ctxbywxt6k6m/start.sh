#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlwc78re0001ctxbywxt6k6m..."
node sync-client.js --auto-approve
