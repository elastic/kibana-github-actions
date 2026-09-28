# On-Merge Github Action

This github action is run when a pull request is merged into the default branch (usually "main"). It is responsible for backporting the changes to the appropriate branches, and adjusting labels on the PR.

The current logic is as follows:

1. If the PR has a `backport` label - indicating that a backport PR was closed, it will find the original PR, and append the version to the labels.
2. If the PR has a `backport:version` label, and a `vX.Y.Z` label that points to the current target branch's version, the label will be fixed to `backport:skip`.
3. If the PR has a `backport:version` label, used together with `vX.Y.Z` target version labels, backports will be initiated to the targets' corresponding branches (derived from the `X.Z` part of the labels).
4. If the PR has a `backport:all-open` label, backports will be initiated to all open branches, as derived from `versions.json` in Kibana's `HEAD/main`.
5. If the PR has `backport:version` and an older `vX.Y.Z` label, release branches from `versions.json` that sit between that label and main are labeled and backported in the same run. A `v8.19` label does not pull in `9.x`. Branches that already have an open or merged `backport/<branch>/pr-<number>` pull request are skipped, so a later version label can re-run the action without opening a second backport.
