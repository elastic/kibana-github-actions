import { BackportResponse } from 'backport';
import { Octokit } from '@octokit/rest';

export const getCommentFromResponse = (pullNumber: number, backportResponse: BackportResponse): string => {
  const hasAnySuccessful = !!backportResponse.results.find((r) => r.success);

  const header = backportResponse.success ? '## 💚 Backport successful' : '## 💔 Backport failed';

  const detailsList = backportResponse.results
    .map((result) => {
      if (result.success) {
        return `✅ [${result.targetBranch}](${result.pullRequestUrl}) / ${result.pullRequestUrl}`;
      }

      return `❌ ${result.targetBranch}: ${result.errorMessage}`;
    })
    .join('\n');

  const generalErrorMessage =
    'errorMessage' in backportResponse
      ? `The backport operation could not be completed due to the following error:\n${backportResponse.errorMessage}`
      : '';

  const helpParts = [];

  if (hasAnySuccessful) {
    helpParts.push('Successful backport PRs will be merged automatically after passing CI.');
  }

  if (!backportResponse.success) {
    helpParts.push(
      [
        'To backport manually, check out the target branch and run:',
        `\`node scripts/backport --pr ${pullNumber}\``,
      ].join('\n'),
    );
  }

  const helpMessage = helpParts.join('\n\n');

  return [header, detailsList, generalErrorMessage, helpMessage].filter((m) => m).join('\n\n');
};

export default async function createStatusComment(options: {
  accessToken: string;
  repoOwner: string;
  repoName: string;
  pullNumber: number;
  backportResponse: BackportResponse;
}) {
  const { accessToken, repoOwner, repoName, pullNumber, backportResponse } = options;

  const octokit = new Octokit({
    auth: accessToken,
  });

  return octokit.issues.createComment({
    owner: repoOwner,
    repo: repoName,
    issue_number: pullNumber,
    body: getCommentFromResponse(pullNumber, backportResponse),
  });
}
