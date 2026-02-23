#!/bin/bash
# Build with retry for TLS/network timeouts when pulling from Docker Hub
set -e

MAX_ATTEMPTS=3
cd "$(dirname "$0")/.."

echo "Pre-pulling base images (with retry)..."
for attempt in $(seq 1 $MAX_ATTEMPTS); do
  echo "Attempt $attempt/$MAX_ATTEMPTS"
  if docker pull node:20-alpine 2>/dev/null; then
    echo "Base image pulled successfully."
    break
  fi
  if [ $attempt -eq $MAX_ATTEMPTS ]; then
    echo "Failed to pull node:20-alpine after $MAX_ATTEMPTS attempts."
    echo "Check network/VPN. You can also try: docker pull node:20-alpine"
    exit 1
  fi
  echo "Retrying in 5s..."
  sleep 5
done

echo "Building and starting services..."
docker compose up --build -d
