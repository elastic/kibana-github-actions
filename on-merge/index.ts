import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { backportRun } from 'backport';
import { resolveTargets } from './backportTargets';
import { getPrPackageVersion, getPrBackportData, labelsContain } from './util';
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
    }

    const targets = resolveTargets(
      versions,
      pullRequest.labels.map((label) => label.name),
    );

    if (!labelsContain(pullRequest.labels, 'backport:skip') && targets.length) {
      try {
        await github.pulls.update({
          ...repo,
          pull_number: pullRequest.number,
          body: `${pullRequest.body}\n\n<!--ONMERGE ${JSON.stringify({
            backportTargets: targets,
          })} ONMERGE-->`,
        });
      } catch (error) {
        console.error('An error occurred', error);
        core.setFailed(error.message);
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
          publishStatusCommentOnSuccess: true, // TODO this will flip to false once we have backport summaries implemented
        },
      });
    }
  } else if (labelsContain(pullRequest.labels, 'backport')) {
    const prData = getPrBackportData(pullRequest.body);
    if (prData) {
      const version = await getPrPackageVersion(github, repo.owner, repo.repo, pullRequest.base.ref);

      for (const pr of prData) {
        if (!pr.sourcePullRequest) {
          continue;
        }

        await github.issues.addLabels({
          ...context.repo,
          issue_number: pr.sourcePullRequest.number,
          labels: [`v${version}`], // TODO switch this to use getVersionLabel when it's appropriate to increment patch versions after BCs
        });
      }
    }
  }
}

init().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
