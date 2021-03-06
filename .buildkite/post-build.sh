#!/usr/bin/env bash

set -euxo pipefail

BUILD_FAILED=$(buildkite-agent meta-data get build_failed --default "false")
export BUILD_FAILED

if [[ "${GITHUB_COMMIT_STATUS_ENABLED:-}" == "true" ]]; then
  COMMIT_STATUS=success
  if [[ "${BUILD_FAILED:-}"  == "true" ]]; then
    COMMIT_STATUS=failure
  fi

  GITHUB_COMMIT_STATUS_CONTEXT=${GITHUB_COMMIT_STATUS_CONTEXT:-"buildkite/$BUILDKITE_PIPELINE_NAME"}

  gh api "repos/elastic/kibana-github-actions/statuses/$BUILDKITE_COMMIT" -f state="$COMMIT_STATUS" -f target_url="$BUILDKITE_BUILD_URL" -f context="$GITHUB_COMMIT_STATUS_CONTEXT" --silent
fi
