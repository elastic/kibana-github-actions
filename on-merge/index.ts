import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { backportRun } from 'backport';
import { resolveTargets } from './backportTargets';
import { parseVersions } from './versions';

async function init() {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const accessToken = core.getInput('github_token', { required: true });

  const github = getOctokit(accessToken).rest;
  const { data } = await github.repos.getContent({
    ...context.repo,
    ref: 'main',
    path: 'versions.json',
  });
  const json = Buffer.from((data as any).content, 'base64').toString();
  const versionsRaw = JSON.parse(json);
  const versions = parseVersions(versionsRaw);

  const pullRequestPayload = payload as PullRequestEvent;
  const pullRequest = pullRequestPayload.pull_request;

  if (pullRequest.base.ref === 'main') {
    const currentLabel = `v${versions.currentMinor.version}`;
    if (!pullRequest.labels.some((label) => label.name === currentLabel)) {
      await github.issues.addLabels({
        ...context.repo,
        issue_number: pullRequest.number,
        labels: [currentLabel],
      });

      if (
        [
          'backport:prev-minor',
          'backport:prev-major',
          'backport:all-open',
          'backport:auto-version', // temporary opt-in label
        ].some((gateLabel) => pullRequest.labels.some((label) => label.name === gateLabel))
      ) {
        const targets = resolveTargets(
          versions,
          pullRequest.labels.map((label) => label.name),
        );

        // versionLabelsToAdd is temporary until the new process is complete that adds the label AFTER the backport PR is merged
        const versionLabelsToAdd = versions.all
          .filter((version) => targets.includes(version.branch))
          .map((version) => `v${version.version}`);

        if (versionLabelsToAdd.length) {
          await github.issues.addLabels({
            ...context.repo,
            issue_number: pullRequest.number,
            labels: versionLabelsToAdd,
          });
        }

        await backportRun({
          options: {
            repoOwner: repo.owner,
            repoName: repo.repo,
            accessToken,
            interactive: false,
            pullNumber: pullRequest.number,
            assignees: [pullRequest.user.login],
            autoMerge: true,
            autoMergeMethod: 'squash',
            targetBranches: targets,
            publishStatusCommentOnFailure: true,
            publishStatusCommentOnSuccess: false,
          },
        });
      }
    }
  } else if (pullRequest.labels.some((label) => label.name === 'backport')) {
    // Add version from upstream package.json label to original PR
    // Leave status comment if final backport
    //  Include note about recently-changed versions.json if it was changed in the last 24 hours
  }
}

init().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
