#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlqfr9pp00017q779vy17qpf..."
node sync-client.js --auto-approve
