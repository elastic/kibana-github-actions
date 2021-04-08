#!/usr/bin/env bash

set -euxo pipefail

.buildkite/ci.sh

echo '--- Verify No Changes'
GIT_CHANGES="$(git ls-files --modified)"
if [[ "$GIT_CHANGES" ]]; then
  echo "ERROR: 'yarn build' caused changes to the following files:"
  echo "$GIT_CHANGES"
  exit 1
fi
