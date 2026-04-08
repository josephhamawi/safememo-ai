#!/bin/bash
set -euo pipefail

echo "========================================="
echo "  Noomachy - Firebase Emulator Suite"
echo "========================================="
echo ""

# Build functions first
echo "Building Cloud Functions..."
cd functions
npm run build 2>/dev/null || echo "Warning: Functions build had issues (may be OK for first run)"
cd ..

# Check for seed data flag
if [[ "${1:-}" == "--seed" ]]; then
  echo "Will seed data after emulators start..."
  export SEED_ON_START=true
fi

# Start emulators
echo "Starting Firebase Emulators..."
echo "  Auth:      http://localhost:9099"
echo "  Firestore: http://localhost:8080"
echo "  Functions: http://localhost:5001"
echo "  Hosting:   http://localhost:5000"
echo "  Storage:   http://localhost:9199"
echo "  UI:        http://localhost:4000"
echo ""

firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
