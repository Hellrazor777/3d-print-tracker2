#!/bin/sh
# Production startup for 3D Print Tracker
# Run this after: npm install && npm run build:web

set -e

echo "Building frontend..."
npx vite build --outDir dist-web

echo "Starting server..."
NODE_ENV=production node server/index.js
