#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlw5w5wc0003nmi86b5hnpem..."
node sync-client.js --auto-approve
