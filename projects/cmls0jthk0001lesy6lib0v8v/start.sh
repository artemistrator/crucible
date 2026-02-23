#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmls0jthk0001lesy6lib0v8v..."
node sync-client.js --auto-approve
