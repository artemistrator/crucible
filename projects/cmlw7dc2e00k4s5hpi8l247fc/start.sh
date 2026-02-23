#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlw7dc2e00k4s5hpi8l247fc..."
node sync-client.js --auto-approve
