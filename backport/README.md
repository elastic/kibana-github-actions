# backport action

Example usage:

```yml
on:
  pull_request_target:
    branches:
      - master
    types:
      - labeled
      - closed

jobs:
  backport:
    name: Backport PR
    if: |
      github.event.pull_request.merged == true
      && contains(github.event.pull_request.labels.*.name, 'auto-backport')
      && (
        (github.event.action == 'labeled' && github.event.label.name == 'auto-backport')
        || (github.event.action == 'closed')
      )
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Actions
        uses: actions/checkout@v2
        with:
          repository: 'elastic/kibana-github-actions'
          ref: main
          path: ./actions

      - name: Install Actions
        run: npm install --production --prefix ./actions

      - name: Run Backport
        uses: ./actions/backport
        with:
          github_token: ${{secrets.KIBANAMACHINE_TOKEN}}
          commit_user: <YOUR_USERNAME>
          commit_email: <YOUR_EMAIL>
          auto_merge: 'true'
          auto_merge_method: 'squash'
          manual_backport_command_template: 'node scripts/backport --pr %pullNumber%'
```

Borrows heavily from https://github.com/sqren/backport-github-action
