export const x = [
  {
    author: { name: 'Brian Seeders', email: 'brian.seeders@elastic.co' },
    sourceCommit: {
      committedDate: '2022-06-30T14:46:47Z',
      message: '[CI] Install global npm modules with a retry and failsafe (#135437)',
      sha: '82b5d8e120c9eeb5c589966ade1beeebd1fa22ab',
      branchLabelMapping: { '^v8.4.0$': 'main', '^v(\\d+).(\\d+).\\d+$': '$1.$2' },
    },
    sourcePullRequest: {
      labels: [
        'Team:Operations',
        'release_note:skip',
        'Feature:CI',
        'v8.4.0',
        'v8.3.1',
        'backport:prev-minor',
      ],
      number: 135437,
      url: 'https://github.com/elastic/kibana/pull/135437',
      mergeCommit: {
        message: '[CI] Install global npm modules with a retry and failsafe (#135437)',
        sha: '82b5d8e120c9eeb5c589966ade1beeebd1fa22ab',
      },
    },
    sourceBranch: 'main',
    suggestedTargetBranches: [],
    targetPullRequestStates: [
      {
        branch: 'main',
        label: 'v8.4.0',
        labelRegex: '^v8.4.0$',
        isSourceBranch: true,
        state: 'MERGED',
        url: 'https://github.com/elastic/kibana/pull/135437',
        number: 135437,
        mergeCommit: {
          message: '[CI] Install global npm modules with a retry and failsafe (#135437)',
          sha: '82b5d8e120c9eeb5c589966ade1beeebd1fa22ab',
        },
      },
      {
        branch: '8.3',
        label: 'v8.3.1',
        labelRegex: '^v(\\d+).(\\d+).\\d+$',
        isSourceBranch: false,
        url: 'https://github.com/elastic/kibana/pull/135563',
        number: 135563,
        state: 'MERGED',
        mergeCommit: {
          sha: 'e6f38c7b2473bad12e70a584408469bfa1d4f2ef',
          message:
            '[CI] Install global npm modules with a retry and failsafe (#135437) (#135563)\n\n(cherry picked from commit 82b5d8e120c9eeb5c589966ade1beeebd1fa22ab)\n\nCo-authored-by: Brian Seeders <brian.seeders@elastic.co>',
        },
      },
    ],
  },
];
