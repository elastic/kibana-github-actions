#!/usr/bin/env bash

set -euo pipefail

echo '--- npm install'
npm install

echo '--- Lint'
npm run lint

echo '--- Test'
npm run test

echo '--- Build'
npm run build

echo '--- Verify no changes'
GIT_CHANGES="$(git ls-files --modified)"
if [[ "$GIT_CHANGES" ]]; then
  echo "ERROR: 'npm run build' caused changes to the following files:"
  echo "$GIT_CHANGES"
  exit 1
fi
