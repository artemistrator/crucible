#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmltkzsef09h54cpoxx0q7u5b..."
node sync-client.js --auto-approve
