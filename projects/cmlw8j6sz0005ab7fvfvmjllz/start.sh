#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlw8j6sz0005ab7fvfvmjllz..."
node sync-client.js --auto-approve
