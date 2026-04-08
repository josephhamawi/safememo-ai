#!/bin/bash
set -euo pipefail

echo "========================================="
echo "  Noomachy Platform - Deploy Script"
echo "========================================="
echo ""

# Check prerequisites
command -v firebase >/dev/null 2>&1 || { echo "Error: firebase CLI not found. Install with: npm i -g firebase-tools"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: Node.js not found."; exit 1; }

# Parse arguments
DEPLOY_TARGET="${1:-all}"
PROJECT_ID="${FIREBASE_PROJECT:-noomachy}"

echo "Project: $PROJECT_ID"
echo "Target:  $DEPLOY_TARGET"
echo ""

# Build functions
if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "functions" ]]; then
  echo "Building Cloud Functions..."
  cd functions
  npm ci
  npm run build
  cd ..
  echo "Functions built successfully."
  echo ""
fi

# Build web
if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "hosting" ]]; then
  echo "Building Next.js app..."
  cd web
  npm ci
  npm run build
  cd ..
  echo "Web app built successfully."
  echo ""
fi

# Deploy
echo "Deploying to Firebase..."
case "$DEPLOY_TARGET" in
  "all")
    firebase deploy --project "$PROJECT_ID"
    ;;
  "functions")
    firebase deploy --only functions --project "$PROJECT_ID"
    ;;
  "hosting")
    firebase deploy --only hosting --project "$PROJECT_ID"
    ;;
  "rules")
    firebase deploy --only firestore:rules,storage --project "$PROJECT_ID"
    ;;
  "indexes")
    firebase deploy --only firestore:indexes --project "$PROJECT_ID"
    ;;
  *)
    echo "Usage: ./scripts/deploy.sh [all|functions|hosting|rules|indexes]"
    exit 1
    ;;
esac

echo ""
echo "Deploy complete!"
echo "Dashboard: https://$PROJECT_ID.web.app"
