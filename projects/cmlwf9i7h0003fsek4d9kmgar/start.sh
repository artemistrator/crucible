#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlwf9i7h0003fsek4d9kmgar..."
node sync-client.js --auto-approve
