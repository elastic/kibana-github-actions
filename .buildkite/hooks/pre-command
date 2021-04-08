#!/usr/bin/env bash

set -euo pipefail

GITHUB_TOKEN=$(vault read -field=github_token secret/kibana-issues/dev/kibanamachine)
export GITHUB_TOKEN
