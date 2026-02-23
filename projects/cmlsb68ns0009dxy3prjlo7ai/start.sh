#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlsb68ns0009dxy3prjlo7ai..."
node sync-client.js --auto-approve
