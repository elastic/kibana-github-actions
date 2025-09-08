# On-Merge Github Action

This github action is run when a pull request is merged into the default branch (usually "main"). It is responsible for backporting the changes to the appropriate branches, and adjusting labels on the PR.

The current logic is as follows:

1. If the PR has a `backport` label - indicating that a backport PR was closed, it will find the original PR, and append the version to the labels.
2. If the PR has a `backport:version` label, and a `vX.Y.Z` label that points to the current target branch's version, the label will be fixed to `backport:skip`.
3. If the PR has a `backport:version` label, backports will be initiated through the `backport` tool to all target branches (all `vX.Y.Z` labels, if `backport:all-open` is set, then all open branches derived from `versions.json`).
