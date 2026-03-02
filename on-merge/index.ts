import * as core from '@actions/core';
import { context } from '@actions/github';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { backportRun } from 'backport';
import * as os from 'os';
import * as path from 'path';
import { BACKPORT_LABELS, resolveTargets } from './backportTargets';
import {
  getGithubActionURL,
  getPrBackportData,
  getVersionLabels,
  labelsContain,
  tailFileToActions,
} from './util';
import { parseVersions } from './versions';
import { GithubWrapper } from './github';

export const DEFAULT_DEBOUNCE_TIMEOUT = 15000;

const workflowState = {
  wasInterrupted: false,
  terminate: () => {
    if (!workflowState.wasInterrupted) {
      core.warning('Workflow terminated. Finishing current tasks before exiting...');
      workflowState.wasInterrupted = true;
    }
  },
};

export async function main() {
  process.on('SIGINT', workflowState.terminate);
  process.on('SIGTERM', workflowState.terminate);

  await runOnMergeAction().finally(() => {
    process.off('SIGINT', workflowState.terminate);
    process.off('SIGTERM', workflowState.terminate);
  });
}

async function runOnMergeAction() {
  const { payload, repo } = context;
  const debounceTimeout =
    parseInt(process.env.BACKPORT_DEBOUNCE_TIMEOUT ?? '', 10) || DEFAULT_DEBOUNCE_TIMEOUT;

  core.info(`[INIT] Starting on-merge action for repo: ${repo.owner}/${repo.repo}`);
  core.info(`[INIT] Payload action: ${payload.action}, event: ${context.eventName}`);

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const accessToken = core.getInput('github_token', { required: true });
  const githubWrapper = new GithubWrapper({ accessToken, owner: repo.owner, repo: repo.repo });
  core.info(`[INIT] GitHub wrapper initialized for ${repo.owner}/${repo.repo}`);

  core.info('[CONFIG] Fetching .backportrc.json...');
  const backportConfig = await githubWrapper.getFileContent('.backportrc.json');
  const versionMap = backportConfig?.branchLabelMapping || {};
  core.info(`[CONFIG] Loaded branchLabelMapping with ${Object.keys(versionMap).length} mappings`);

  core.info('[CONFIG] Fetching versions.json...');
  const versionsConfig = await githubWrapper.getFileContent('versions.json');
  const versions = parseVersions(versionsConfig);
  const currentLabel = `v${versions.current.version}`;
  core.info(
    `[CONFIG] Current version: ${versions.current.version}, branch: ${versions.current.branch}, total versions: ${versions.all.length}`,
  );

  const pullRequestPayload = payload as PullRequestEvent;
  const pullRequest = pullRequestPayload.pull_request;
  core.info(`[PR] Processing PR #${pullRequest.number}: ${pullRequest.title}`);
  core.info(`[PR] Base branch: ${pullRequest.base.ref}, Head branch: ${pullRequest.head.ref}`);
  core.info(
    `[PR] PR state: ${pullRequest.state}, merged: ${pullRequest.merged}, labels: ${pullRequest.labels
      .map((l) => l.name)
      .join(', ')}`,
  );

  if (pullRequest.base.ref === 'main') {
    core.info('[WORKFLOW] PR base is main branch, processing backport logic...');
    // Fix the backport:version label, only when the PR is closed:
    // - if the only version label is the current version, or no version labels => replace backport:version with backport:skip
    if (
      payload.action !== 'labeled' &&
      (isPRBackportToCurrentRelease(pullRequest, currentLabel) || hasBackportVersionWithNoTarget(pullRequest))
    ) {
      core.info(`[LABELS] Auto-adjusting labels: detected backport to current release or no target`);
      await githubWrapper.removeLabels(pullRequest, [BACKPORT_LABELS.VERSION]);
      await githubWrapper.addLabels(pullRequest, [BACKPORT_LABELS.SKIP]);
      core.info("Adjusted labels: removing 'backport:version' and adding 'backport:skip'");
    }

    // Add current target label
    if (!labelsContain(pullRequest.labels, currentLabel)) {
      core.info(`[LABELS] Adding current version label: ${currentLabel}`);
      await githubWrapper.addLabels(pullRequest, [currentLabel]);
    } else {
      core.info(`[LABELS] Current version label already present: ${currentLabel}`);
    }

    // Skip backport if skip label is present
    if (labelsContain(pullRequest.labels, BACKPORT_LABELS.SKIP)) {
      core.info("[EXIT] Backport skipped because 'backport:skip' label is present");
      return;
    }

    // Find backport targets
    const labelNames = pullRequest.labels.map((label) => label.name);
    core.info(`[TARGETS] Resolving backport targets from labels: ${labelNames.join(', ')}`);
    const targets = resolveTargets(versions, versionMap, labelNames);

    if (!targets.length) {
      core.info(
        `[EXIT] Backport skipped, because no backport targets found. Labels checked: ${labelNames.join(
          ', ',
        )}`,
      );
      return;
    }

    core.info(`[TARGETS] Resolved ${targets.length} backport target(s): ${targets.join(', ')}`);

    // Sleep for debounceTimeout to debounce multiple concurrent runs
    core.info(
      `[DEBOUNCE] Waiting ${(debounceTimeout / 1000).toFixed(1)}s to debounce multiple concurrent runs...`,
    );
    await new Promise((resolve) => setTimeout(resolve, debounceTimeout));
    if (workflowState.wasInterrupted) {
      core.warning('[EXIT] Workflow was interrupted. Exiting before starting backport...');
      return;
    } else {
      core.info(
        `[BACKPORT] Starting backport to target branches: ${targets.join(
          ', ',
        )} based on labels: ${labelNames.join(', ')}`,
      );
    }

    // Add comment about planned backports and update PR body with backport metadata
    core.info('[PR-UPDATE] Updating PR with backport info...');
    await updatePRWithBackportInfo(githubWrapper, pullRequest, targets);
    core.info('[PR-UPDATE] PR updated successfully');

    // Start backport for the calculated targets
    core.info(
      `[BACKPORT-RUN] Initiating backport for PR #${pullRequest.number} to ${targets.length} target(s)`,
    );
    core.info(
      `[BACKPORT-RUN] Backport config: assignees=[${pullRequest.user.login}], autoMerge=true, autoMergeMethod=squash`,
    );
    const logFilePath = path.join(os.tmpdir(), `backport-${pullRequest.number}.log`);
    core.info(`[BACKPORT-RUN] Log file: ${logFilePath}`);
    const stopTailing = tailFileToActions({ filePath: logFilePath, logger: core });
    try {
      const result = await backportRun({
        options: {
          repoOwner: repo.owner,
          repoName: repo.repo,
          accessToken,
          interactive: false,
          logFilePath,
          pullNumber: pullRequest.number,
          assignees: [pullRequest.user.login],
          autoMerge: true,
          autoMergeMethod: 'squash',
          targetBranches: targets,
          publishStatusCommentOnFailure: true,
          publishStatusCommentOnSuccess: true, // TODO this will flip to false once we have backport summaries implemented
        },
      });
      stopTailing();
      core.info(`[BACKPORT-RUN] Backport completed with status: ${result.status}`);
      if (result.status === 'failure') {
        core.error(`[BACKPORT-RUN] Backport failed with error type: ${typeof result.error}`);
        if (typeof result.error === 'string') {
          throw new Error(result.error);
        } else if (result.error instanceof Error) {
          throw result.error;
        } else {
          throw new Error('Backport failed for an unknown reason');
        }
      }
      core.info('[SUCCESS] Backport process completed successfully');
    } catch (err) {
      stopTailing();
      core.error(`[BACKPORT-ERROR] Backport failed for PR #${pullRequest.number}: ${err.message}`);
      core.error('[BACKPORT-ERROR] Full error:');
      core.error(err);
      core.setFailed(err.message);
      githubWrapper
        .createComment(
          pullRequest.number,
          `Backport failed. Please check the action logs for details. \n\n${getGithubActionURL(process.env)}`,
        )
        .catch(() => {
          core.error('[BACKPORT-ERROR] Failed to create comment on PR about backport failure');
        });
    }
  } else if (labelsContain(pullRequest.labels, 'backport')) {
    core.info(
      `[WORKFLOW] PR base is not main (${pullRequest.base.ref}), checking if this is a backport PR...`,
    );
    // Mark original PR with backport target labels
    const prData = getPrBackportData(pullRequest.body);
    if (prData) {
      core.info(`[BACKPORT-LABEL] Found ${prData.length} source PR(s) to label`);
      const prPackageVersion = (await githubWrapper.getFileContent('package.json', pullRequest.base.ref))
        .version;
      core.info(`[BACKPORT-LABEL] Package version for branch ${pullRequest.base.ref}: ${prPackageVersion}`);

      for (const pr of prData) {
        if (!pr.sourcePullRequest) {
          core.info(`[BACKPORT-LABEL] Skipping PR data entry without sourcePullRequest`);
          continue;
        }

        core.info(`[BACKPORT-LABEL] Adding label v${prPackageVersion} to source PR #${pr.sourcePullRequest}`);
        await githubWrapper.addLabels(
          pr.sourcePullRequest as any,
          [`v${prPackageVersion}`], // TODO switch this to use getVersionLabel when it's appropriate to increment patch versions after BCs
        );
      }
      core.info('[SUCCESS] Backport labeling completed');
    } else {
      core.info('[WORKFLOW] No backport PR data found in PR body');
    }
  } else {
    core.info(
      `[EXIT] PR base is not main (${pullRequest.base.ref}) and no backport label present. Nothing to do.`,
    );
  }
}

function isPRBackportToCurrentRelease(pullRequest: { labels: { name: string }[] }, currentLabel: string) {
  return (
    getVersionLabels(pullRequest.labels).length === 1 &&
    getVersionLabels(pullRequest.labels)[0] === currentLabel &&
    labelsContain(pullRequest.labels, BACKPORT_LABELS.VERSION)
  );
}

function hasBackportVersionWithNoTarget(pullRequest: { labels: { name: string }[] }) {
  return (
    getVersionLabels(pullRequest.labels).length === 0 &&
    labelsContain(pullRequest.labels, BACKPORT_LABELS.VERSION)
  );
}

async function updatePRWithBackportInfo(
  githubWrapper: GithubWrapper,
  pullRequest: { number: number; body: string },
  targets: string[],
) {
  try {
    core.info(
      `[PR-COMMENT] Creating comment for PR #${pullRequest.number} about backport to: ${targets.join(', ')}`,
    );
    const actionUrl = getGithubActionURL(process.env);
    await githubWrapper.createComment(
      pullRequest.number,
      [`Starting backport for target branches: ${targets.join(', ')}`, actionUrl]
        .filter(Boolean)
        .join('\n\n'),
    );
    core.info('[PR-COMMENT] Comment created successfully');

    // Mark PR body with backport targets
    core.info('[PR-BODY] Updating PR body with backport metadata...');
    await githubWrapper.updatePullRequest(pullRequest.number, {
      body: `${pullRequest.body}\n\n<!--ONMERGE ${JSON.stringify({
        backportTargets: targets,
      })} ONMERGE-->`,
    });
    core.info('[PR-BODY] PR body updated successfully');
  } catch (error) {
    core.error(`[PR-UPDATE-ERROR] Failed to update PR #${pullRequest.number}: ${error.message}`);
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
