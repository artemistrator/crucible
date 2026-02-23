#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltfkcri05kyn8hod2j0fwm2..."
node sync-client.js --auto-approve
