#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlp13ej30001dq2s9n70mv7a..."
node sync-client.js --auto-approve
