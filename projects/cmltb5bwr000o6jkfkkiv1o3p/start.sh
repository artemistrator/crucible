#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltb5bwr000o6jkfkkiv1o3p..."
node sync-client.js --auto-approve
