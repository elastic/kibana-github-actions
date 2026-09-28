# Check backport gaps

Comments on a pull request when a release branch is missing a change that is already on `main` and on an older release branch of the same major.

A backport commit has a different SHA than the `main` commit, so the check matches the source pull number in backport titles (`(#277098)` at the end). It skips a pull request when:

- a merged backport into the release branch already references it
- its `main` merge commit is already contained in the release branch
- this check has already commented, via a hidden `<!-- backport-gap-check:<branch> -->` marker

It does not open a backport.
