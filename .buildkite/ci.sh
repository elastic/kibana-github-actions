#!/usr/bin/env bash

set -euxo pipefail

echo '--- npm install'
npm install

echo '--- Lint'
npm run lint

echo '--- Test'
npm run test

echo '--- Build'
npm run build
