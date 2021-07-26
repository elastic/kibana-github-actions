import axios from 'axios';
import * as core from '@actions/core';
import { context } from '@actions/github';
import { ConfigOptions } from 'backport';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { fixGaps } from './fixGaps';

export const getConfig = async (repoOwner: string, repoName: string, branch: string) => {
  const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
  const resp = await axios.get(url);
  return resp.data as ConfigOptions;
};

async function run() {
  const { payload } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const accessToken = core.getInput('github_token', { required: true });

  const pullRequestPayload = payload as PullRequestEvent;
  const pullRequest = pullRequestPayload.pull_request;
  const backportConfig = await getConfig(
    pullRequest.base.repo.owner.login,
    pullRequest.base.repo.name,
    'master',
  );

  await fixGaps(accessToken, backportConfig, pullRequest);
}

run().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
