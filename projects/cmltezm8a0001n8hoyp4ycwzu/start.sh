#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltezm8a0001n8hoyp4ycwzu..."
node sync-client.js --auto-approve
