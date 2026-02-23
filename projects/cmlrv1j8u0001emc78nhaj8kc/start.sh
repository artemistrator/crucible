#!/bin/bash

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

echo "Starting sync client for project cmlrv1j8u0001emc78nhaj8kc..."
node sync-client.js --auto-approve
