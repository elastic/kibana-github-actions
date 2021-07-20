import axios, { AxiosRequestConfig } from 'axios';
import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { context } from '@actions/github';
import { run, ConfigOptions } from 'backport';
import createStatusComment from './createStatusComment';

export const getConfig = async (repoOwner: string, repoName: string, branch: string, accessToken: string) => {
  const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
  const config: AxiosRequestConfig = {
    method: 'get',
    url: url,
    headers: { Authorization: `token ${accessToken}` },
  };
  const resp = await axios(config);
  return resp.data as ConfigOptions;
};

async function backport() {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const pullRequest = payload.pull_request;
  const owner: string = pullRequest.user.login;

  const branch: string = pullRequest?.base?.ref;

  if (!branch) {
    throw Error("Can't determine PR base branch.");
  }

  const accessToken = core.getInput('github_token', { required: true });
  const commitUser = core.getInput('commit_user', { required: true });
  const commitEmail = core.getInput('commit_email', { required: true });

  const autoMerge = core.getInput('auto_merge', { required: true }) === 'true';
  const autoMergeMethod = core.getInput('auto_merge_method', { required: true });
  const backportCommandTemplate = core.getInput('manual_backport_command_template', { required: true });

  await exec(`git config --global user.name "${commitUser}"`);
  await exec(`git config --global user.email "${commitEmail}"`);

  const config = await getConfig(repo.owner, repo.repo, branch, accessToken);

  const backportResponse = await run({
    ...config,
    accessToken,
    fork: true,
    username: commitUser,
    ci: true,
    pullNumber: pullRequest.number,
    labels: ['backport'],
    assignees: [owner],
    autoMerge: autoMerge,
    autoMergeMethod: autoMergeMethod,
  });

  await createStatusComment({
    accessToken,
    repoOwner: repo.owner,
    repoName: repo.repo,
    pullNumber: pullRequest.number,
    backportCommandTemplate,
    backportResponse,
    autoMerge,
  });
}

backport().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
