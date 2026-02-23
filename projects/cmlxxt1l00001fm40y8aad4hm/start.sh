#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlxxt1l00001fm40y8aad4hm..."
node sync-client.js --auto-approve
