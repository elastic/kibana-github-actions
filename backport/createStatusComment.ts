import { BackportResponse } from 'backport';
import { Octokit } from '@octokit/rest';

export const getCommentFromResponse = (
  pullNumber: number,
  backportCommandTemplate: string,
  backportResponse: BackportResponse,
  repoOwner: string,
  repoName: string,
): string => {
  const hasAnySuccessful = backportResponse.results.some((r) => r.success);
  const hasAllSuccessful = backportResponse.results.every((r) => r.success);

  const header = backportResponse.success ? '## 💚 Backport successful' : '## 💔 Backport failed';

  const tableHeader = `| Status | Branch | Result |\n|:------:|:------:|:------:|\n`;
  const tableBody = backportResponse.results
    .map((result) => {
      // this is gross - `result` should include the pullNumber
      const backportPullNumber = result.pullRequestUrl?.split('/')[6];

      if (result.success) {
        return `| ✅ |  [${result.targetBranch}](${result.pullRequestUrl})  | [<img src="https://img.shields.io/github/pulls/detail/state/${repoOwner}/${repoName}/${backportPullNumber}">](${result.pullRequestUrl}) |`;
      }

      return `| ❌ |  ${result.targetBranch}  | ${result.errorMessage} |`;
    })
    .join('\n');

  const table = backportResponse.results?.length ? tableHeader + tableBody : '';

  const generalErrorMessage =
    'errorMessage' in backportResponse
      ? `The backport operation could not be completed due to the following error:\n${backportResponse.errorMessage}`
      : '';

  const helpParts = [];

  if (hasAllSuccessful) {
    if (backportResponse.results.length === 1) {
      helpParts.push('This backport PR will be merged automatically after passing CI.');
    } else {
      helpParts.push('The backport PRs will be merged automatically after passing CI.');
    }
  } else if (hasAnySuccessful) {
    helpParts.push('Successful backport PRs will be merged automatically after passing CI.');
  }

  if (!backportResponse.success) {
    helpParts.push(
      [
        'To backport manually run:',
        `\`${backportCommandTemplate.replace('%pullNumber%', pullNumber.toString())}\``,
      ].join('\n'),
    );
  }

  const helpMessage = helpParts.join('\n\n');

  return [header, table, generalErrorMessage, helpMessage].filter((m) => m).join('\n\n');
};

export default async function createStatusComment(options: {
  accessToken: string;
  repoOwner: string;
  repoName: string;
  pullNumber: number;
  backportCommandTemplate: string;
  backportResponse: BackportResponse;
}) {
  const { accessToken, repoOwner, repoName, pullNumber, backportCommandTemplate, backportResponse } = options;

  const octokit = new Octokit({
    auth: accessToken,
  });

  return octokit.issues.createComment({
    owner: repoOwner,
    repo: repoName,
    issue_number: pullNumber,
    body: getCommentFromResponse(pullNumber, backportCommandTemplate, backportResponse, repoOwner, repoName),
  });
}
