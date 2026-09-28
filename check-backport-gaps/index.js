"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const gaps_1 = require("./gaps");
const SEARCH_PAGES = 5;
async function run() {
    const token = core.getInput('github_token', { required: true });
    const sinceDays = Number(core.getInput('since_days') || '180');
    const dryRun = core.getInput('dry_run') === 'true';
    const maxComments = Number(core.getInput('max_comments') || '25');
    const octokit = (0, github_1.getOctokit)(token);
    const { owner, repo } = github_1.context.repo;
    const repository = `${owner}/${repo}`;
    const versions = await loadVersions(octokit, owner, repo);
    const branchInput = core.getInput('branch') || (0, gaps_1.branchFromTag)(core.getInput('tag')) || '';
    const target = (0, gaps_1.releaseTarget)(versions, branchInput);
    if (!target) {
        core.info(`[EXIT] ${branchInput || '(none)'} is not a release branch in versions.json`);
        return;
    }
    const olderBranches = (0, gaps_1.olderSameMajorReleaseBranches)(versions, target);
    if (!olderBranches.length) {
        core.info(`[EXIT] No older ${target.major}.x release branch to compare with ${target.branch}`);
        return;
    }
    const since = (0, gaps_1.isoDateDaysAgo)(sinceDays);
    core.info(`[SCAN] ${target.branch} against ${olderBranches
        .map((branch) => branch.branch)
        .join(', ')} since ${since}`);
    const olderBackports = [];
    for (const older of olderBranches) {
        const titles = await searchMergedPulls(octokit, (0, gaps_1.backportSearchQuery)(repository, older.branch, since));
        for (const pull of titles) {
            const sourcePullNumber = (0, gaps_1.sourcePullNumberFromTitle)(pull.title);
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
    const presentOnTarget = new Set();
    const targetPulls = await searchMergedPulls(octokit, (0, gaps_1.backportSearchQuery)(repository, target.branch, since));
    for (const pull of targetPulls) {
        const sourcePullNumber = (0, gaps_1.sourcePullNumberFromTitle)(pull.title);
        if (sourcePullNumber) {
            presentOnTarget.add(sourcePullNumber);
        }
    }
    const missing = (0, gaps_1.pullsMissingFromTarget)(olderBackports, presentOnTarget);
    core.info(`[SCAN] ${missing.length} candidate(s) backported to an older branch but not to ${target.branch}`);
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
async function notifyIfMissing(args) {
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
    if ((0, gaps_1.isCommitOnBranch)(compare.data.ahead_by)) {
        core.info(`[SKIP] #${candidate.sourcePullNumber} merge commit is already on ${targetBranch}`);
        return false;
    }
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: candidate.sourcePullNumber,
        per_page: 100,
    });
    if ((0, gaps_1.alreadyNotified)(comments.map((comment) => { var _a; return (_a = comment.body) !== null && _a !== void 0 ? _a : ''; }), targetBranch)) {
        core.info(`[SKIP] #${candidate.sourcePullNumber} was already notified for ${targetBranch}`);
        return false;
    }
    const body = (0, gaps_1.gapComment)({
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
async function loadVersions(octokit, owner, repo) {
    const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'versions.json',
        ref: 'main',
    });
    const content = Buffer.from(response.data.content, 'base64').toString();
    return JSON.parse(content);
}
async function searchMergedPulls(octokit, q) {
    const pulls = [];
    for (let page = 1; page <= SEARCH_PAGES; page++) {
        const response = await octokit.request('GET /search/issues', {
            q,
            per_page: 100,
            page,
        });
        const items = response.data.items;
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
//# sourceMappingURL=index.js.map