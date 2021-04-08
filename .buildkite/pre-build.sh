#!/usr/bin/env bash

set -euxo pipefail

if [[ "${GITHUB_COMMIT_STATUS_ENABLED:-}" == "true" ]]; then
  GITHUB_COMMIT_STATUS_CONTEXT=${GITHUB_COMMIT_STATUS_CONTEXT:-"buildkite/$BUILDKITE_PIPELINE_NAME"}

  gh api "repos/elastic/kibana-github-actions/statuses/$BUILDKITE_COMMIT" -f state=pending -f target_url="$BUILDKITE_BUILD_URL" -f context="$GITHUB_COMMIT_STATUS_CONTEXT" --silent
fi