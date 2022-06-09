import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { context } from '@actions/github';
import { backportRun } from 'backport';

async function init() {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const pullRequest = payload.pull_request;
  const prAuthor: string = pullRequest.user.login;
  const accessToken = core.getInput('github_token', { required: true });
  const commitUser = core.getInput('commit_user', { required: false });
  const commitEmail = core.getInput('commit_email', { required: false });
  const autoMerge = core.getInput('auto_merge', { required: false }) === 'true';
  const autoMergeMethod = core.getInput('auto_merge_method', { required: false });
  const targetPRLabels = core
    .getInput('target_pr_labels', { required: false })
    .split(',')
    .map((label) => label.trim());

  await exec(`git config --global user.name "${commitUser}"`);
  await exec(`git config --global user.email "${commitEmail}"`);

  await backportRun({
    options: {
      repoOwner: repo.owner,
      repoName: repo.repo,
      accessToken,
      interactive: false,
      pullNumber: pullRequest.number,
      targetPRLabels: targetPRLabels,
      assignees: [prAuthor],
      autoMerge: autoMerge,
      autoMergeMethod: autoMergeMethod,
    },
  });
}

init().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
