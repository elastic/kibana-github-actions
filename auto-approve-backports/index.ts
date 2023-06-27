import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';

main().catch((error) => {
  core.error(error);
  core.setFailed(error.message);
});

async function main() {
  const { payload } = context;
  const accessToken = core.getInput('github_token', { required: true });
  const allowedAuthors = ensureArray(core.getInput('allowed_authors', { required: true }));
  const approvalMessage = core.getInput('approval_message', { required: false }) || 'Automated Approval';

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const pullRequest = payload.pull_request;
  const prAuthor: string = pullRequest.user.login;

  if (!allowedAuthors.includes(prAuthor)) {
    throw new Error("Only pull-requests by 'allowed_authors' can be auto-approved");
  }

  const octokit = new Octokit({
    auth: accessToken,
  });

  await octokit.pulls.createReview({
    owner: 'elastic',
    repo: 'kibana',
    pull_number: pullRequest.number,
    event: 'APPROVE',
    body: approvalMessage,
  });

  core.info('Pull request approved!');
}

function ensureArray<T>(input: T | T[]): T[] {
  if (Array.isArray(input)) {
    return input;
  } else {
    return [input];
  }
}
