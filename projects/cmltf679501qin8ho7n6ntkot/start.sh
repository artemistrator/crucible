#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltf679501qin8ho7n6ntkot..."
node sync-client.js --auto-approve
