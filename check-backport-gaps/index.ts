import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import {
  alreadyNotified,
  backportSearchQuery,
  branchFromTag,
  gapComment,
  isCommitOnBranch,
  isoDateDaysAgo,
  olderSameMajorReleaseBranches,
  OlderBackport,
  pullsMissingFromTarget,
  releaseTarget,
  sourcePullNumberFromTitle,
  VersionsFile,
} from './gaps';

const SEARCH_PAGES = 5;

async function run() {
  const token = core.getInput('github_token', { required: true });
  const sinceDays = Number(core.getInput('since_days') || '180');
  const dryRun = core.getInput('dry_run') === 'true';
  const maxComments = Number(core.getInput('max_comments') || '25');
  const octokit = getOctokit(token);
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;

  const versions = await loadVersions(octokit, owner, repo);
  const branchInput = core.getInput('branch') || branchFromTag(core.getInput('tag')) || '';
  const target = releaseTarget(versions, branchInput);
  if (!target) {
    core.info(`[EXIT] ${branchInput || '(none)'} is not a release branch in versions.json`);
    return;
  }

  const olderBranches = olderSameMajorReleaseBranches(versions, target);
  if (!olderBranches.length) {
    core.info(`[EXIT] No older ${target.major}.x release branch to compare with ${target.branch}`);
    return;
  }

  const since = isoDateDaysAgo(sinceDays);
  core.info(
    `[SCAN] ${target.branch} against ${olderBranches
      .map((branch) => branch.branch)
      .join(', ')} since ${since}`,
  );

  const olderBackports: OlderBackport[] = [];
  for (const older of olderBranches) {
    const titles = await searchMergedPulls(octokit, backportSearchQuery(repository, older.branch, since));
    for (const pull of titles) {
      const sourcePullNumber = sourcePullNumberFromTitle(pull.title);
      if (!sourcePullNumber) {
        continue;
      }
      olderBackports.push({
        sourcePullNumber,
        olderBranch: older.branch,
        olderMinor: older.minor,
        backportPullNumber: pull.number,
      });
    }
  }

  const presentOnTarget = new Set<number>();
  const targetPulls = await searchMergedPulls(octokit, backportSearchQuery(repository, target.branch, since));
  for (const pull of targetPulls) {
    const sourcePullNumber = sourcePullNumberFromTitle(pull.title);
    if (sourcePullNumber) {
      presentOnTarget.add(sourcePullNumber);
    }
  }

  const missing = pullsMissingFromTarget(olderBackports, presentOnTarget);
  core.info(
    `[SCAN] ${missing.length} candidate(s) backported to an older branch but not to ${target.branch}`,
  );

  let commented = 0;
  for (const candidate of missing) {
    if (commented >= maxComments) {
      core.warning(`[CAP] Stopped after ${maxComments} comments. Run again to notify the rest.`);
      break;
    }
    const notified = await notifyIfMissing({
      octokit,
      owner,
      repo,
      targetBranch: target.branch,
      candidate,
      dryRun,
    });
    if (notified) {
      commented += 1;
    }
  }
  core.info(`[DONE] Commented on ${commented} pull request(s)${dryRun ? ' (dry run)' : ''}`);
}

async function notifyIfMissing(args: {
  octokit: ReturnType<typeof getOctokit>;
  owner: string;
  repo: string;
  targetBranch: string;
  candidate: OlderBackport;
  dryRun: boolean;
}): Promise<boolean> {
  const { octokit, owner, repo, targetBranch, candidate, dryRun } = args;
  const source = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: candidate.sourcePullNumber,
  });
  if (!source.data.merged || source.data.base.ref !== 'main' || !source.data.merge_commit_sha) {
    core.info(`[SKIP] #${candidate.sourcePullNumber} is not a merged main pull request`);
    return false;
  }

  const compare = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
    owner,
    repo,
    basehead: `${targetBranch}...${source.data.merge_commit_sha}`,
  });
  if (isCommitOnBranch(compare.data.ahead_by)) {
    core.info(`[SKIP] #${candidate.sourcePullNumber} merge commit is already on ${targetBranch}`);
    return false;
  }

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: candidate.sourcePullNumber,
    per_page: 100,
  });
  if (
    alreadyNotified(
      comments.map((comment) => comment.body ?? ''),
      targetBranch,
    )
  ) {
    core.info(`[SKIP] #${candidate.sourcePullNumber} was already notified for ${targetBranch}`);
    return false;
  }

  const body = gapComment({
    targetBranch,
    olderBranch: candidate.olderBranch,
    backportPullNumber: candidate.backportPullNumber,
  });
  if (dryRun) {
    core.info(`[DRY RUN] Would comment on #${candidate.sourcePullNumber}:\n${body}`);
    return true;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: candidate.sourcePullNumber,
    body,
  });
  core.info(`[COMMENT] #${candidate.sourcePullNumber}`);
  return true;
}

async function loadVersions(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
): Promise<VersionsFile> {
  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: 'versions.json',
    ref: 'main',
  });
  const content = Buffer.from((response.data as { content: string }).content, 'base64').toString();
  return JSON.parse(content) as VersionsFile;
}

async function searchMergedPulls(
  octokit: ReturnType<typeof getOctokit>,
  q: string,
): Promise<Array<{ number: number; title: string }>> {
  const pulls: Array<{ number: number; title: string }> = [];
  for (let page = 1; page <= SEARCH_PAGES; page++) {
    const response = await octokit.request('GET /search/issues', {
      q,
      per_page: 100,
      page,
    });
    const items = response.data.items as Array<{ number: number; title: string }>;
    pulls.push(...items.map((item) => ({ number: item.number, title: item.title })));
    if (items.length < 100) {
      break;
    }
    if (page === SEARCH_PAGES) {
      core.warning(`[SCAN] Search truncated at ${SEARCH_PAGES * 100} results for: ${q}`);
    }
  }
  return pulls;
}

run().catch((error) => {
  core.error(error);
  core.setFailed(error instanceof Error ? error.message : String(error));
});
