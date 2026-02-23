#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlunk4vb006fgfolaugl5xpg..."
node sync-client.js --auto-approve
