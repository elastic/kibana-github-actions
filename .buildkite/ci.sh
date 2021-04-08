#!/usr/bin/env bash

set -euxo pipefail

echo '--- yarn install'
yarn install

echo '--- Lint'
yarn lint

echo '--- Test'
yarn test

echo '--- Build'
yarn build
