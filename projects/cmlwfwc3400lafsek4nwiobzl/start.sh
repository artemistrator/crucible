#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlwfwc3400lafsek4nwiobzl..."
node sync-client.js --auto-approve
