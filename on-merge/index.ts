import * as core from '@actions/core';
import { context } from '@actions/github';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { backportRun } from 'backport';
import { BACKPORT_LABELS, resolveTargets } from './backportTargets';
import { getGithubActionURL, getPrBackportData, getVersionLabels, labelsContain } from './util';
import { parseVersions } from './versions';
import { GithubWrapper } from './github';

let workflowWasInterrupted = false;
process.on('SIGTERM', () => {
  if (!workflowWasInterrupted) {
    core.warning('Workflow terminated. Finishing current tasks before exiting...');
    workflowWasInterrupted = true;
  }
});

async function main() {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const accessToken = core.getInput('github_token', { required: true });
  const githubWrapper = new GithubWrapper({ accessToken, owner: repo.owner, repo: repo.repo });

  const backportConfig = await githubWrapper.getFileContent('.backportrc.json');
  const versionMap = backportConfig?.branchLabelMapping || {};

  const versionsConfig = await githubWrapper.getFileContent('versions.json');
  const versions = parseVersions(versionsConfig);
  const currentLabel = `v${versions.current.version}`;

  const pullRequestPayload = payload as PullRequestEvent;
  const pullRequest = pullRequestPayload.pull_request;

  if (pullRequest.base.ref === 'main') {
    // Fix the backport:version label, if the only version label is the current version
    if (isPRBackportToCurrentRelease(pullRequest, currentLabel)) {
      await githubWrapper.removeLabels(pullRequest, [BACKPORT_LABELS.VERSION]);
      await githubWrapper.addLabels(pullRequest, [BACKPORT_LABELS.SKIP]);
      core.info("Adjusted labels: removing 'backport:version' and adding 'backport:skip'");
    }

    // Add current target label
    if (!labelsContain(pullRequest.labels, currentLabel)) {
      await githubWrapper.addLabels(pullRequest, [currentLabel]);
    }

    // Skip backport if skip label is present
    if (labelsContain(pullRequest.labels, BACKPORT_LABELS.SKIP)) {
      core.info("Backport skipped because 'backport:skip' label is present");
      return;
    }

    // Find backport targets
    const labelNames = pullRequest.labels.map((label) => label.name);
    const targets = resolveTargets(versions, versionMap, labelNames);

    if (!targets.length) {
      core.info(`Backport skipped, because no backport targets found.`);
      return;
    }

    // Sleep for 15s to debounce multiple concurrent runs
    core.info('Waiting 15s to debounce multiple concurrent runs...');
    await new Promise((resolve) => setTimeout(resolve, 15000));
    if (workflowWasInterrupted) {
      core.warning('Workflow was interrupted. Exiting before starting backport...');
      return;
    } else {
      core.info(
        `Backporting to target branches: ${targets.join(', ')} based on labels: ${labelNames.join(', ')}`,
      );
    }

    // Add comment about planned backports and update PR body with backport metadata
    await updatePRWithBackportInfo(githubWrapper, pullRequest, targets);

    // Start backport for the calculated targets
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
  } else if (labelsContain(pullRequest.labels, 'backport')) {
    // Mark original PR with backport target labels
    const prData = getPrBackportData(pullRequest.body);
    if (prData) {
      const prPackageVersion = (await githubWrapper.getFileContent('package.json', pullRequest.base.ref))
        .version;

      for (const pr of prData) {
        if (!pr.sourcePullRequest) {
          continue;
        }

        await githubWrapper.addLabels(
          pr.sourcePullRequest as any,
          [`v${prPackageVersion}`], // TODO switch this to use getVersionLabel when it's appropriate to increment patch versions after BCs
        );
      }
    }
  }
}

function isPRBackportToCurrentRelease(pullRequest: { labels: { name: string }[] }, currentLabel: string) {
  return (
    getVersionLabels(pullRequest.labels).length === 1 &&
    getVersionLabels(pullRequest.labels)[0] === currentLabel &&
    labelsContain(pullRequest.labels, BACKPORT_LABELS.VERSION)
  );
}

async function updatePRWithBackportInfo(
  githubWrapper: GithubWrapper,
  pullRequest: { number: number; body: string },
  targets: string[],
) {
  try {
    const actionUrl = getGithubActionURL(process.env);
    await githubWrapper.createComment(
      pullRequest.number,
      [`Starting backport for target branches: ${targets.join(', ')}`, actionUrl]
        .filter(Boolean)
        .join('\n\n'),
    );

    // Mark PR body with backport targets
    await githubWrapper.updatePullRequest(pullRequest.number, {
      body: `${pullRequest.body}\n\n<!--ONMERGE ${JSON.stringify({
        backportTargets: targets,
      })} ONMERGE-->`,
    });
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
  });
}
