#!/bin/sh
# Start API server in background, wait for it, then start Vite
node server/index.js &
API_PID=$!

# Wait for API server to be ready
echo "Waiting for API server..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8080/api/data > /dev/null 2>&1; then
    echo "API server ready"
    break
  fi
  sleep 0.5
done

# Start Vite in foreground
npx vite

# Cleanup API server when Vite exits
kill $API_PID 2>/dev/null
