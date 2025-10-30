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
exports.main = exports.DEFAULT_DEBOUNCE_TIMEOUT = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const backport_1 = require("backport");
const backportTargets_1 = require("./backportTargets");
const util_1 = require("./util");
const versions_1 = require("./versions");
const github_2 = require("./github");
exports.DEFAULT_DEBOUNCE_TIMEOUT = 15000;
const workflowState = {
    wasInterrupted: false,
    terminate: () => {
        if (!workflowState.wasInterrupted) {
            core.warning('Workflow terminated. Finishing current tasks before exiting...');
            workflowState.wasInterrupted = true;
        }
    },
};
async function main() {
    process.on('SIGINT', workflowState.terminate);
    process.on('SIGTERM', workflowState.terminate);
    await runOnMergeAction().finally(() => {
        process.off('SIGINT', workflowState.terminate);
        process.off('SIGTERM', workflowState.terminate);
    });
}
exports.main = main;
async function runOnMergeAction() {
    var _a;
    const { payload, repo } = github_1.context;
    const debounceTimeout = parseInt((_a = process.env.BACKPORT_DEBOUNCE_TIMEOUT) !== null && _a !== void 0 ? _a : '', 10) || exports.DEFAULT_DEBOUNCE_TIMEOUT;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const accessToken = core.getInput('github_token', { required: true });
    const githubWrapper = new github_2.GithubWrapper({ accessToken, owner: repo.owner, repo: repo.repo });
    const backportConfig = await githubWrapper.getFileContent('.backportrc.json');
    const versionMap = (backportConfig === null || backportConfig === void 0 ? void 0 : backportConfig.branchLabelMapping) || {};
    const versionsConfig = await githubWrapper.getFileContent('versions.json');
    const versions = (0, versions_1.parseVersions)(versionsConfig);
    const currentLabel = `v${versions.current.version}`;
    const pullRequestPayload = payload;
    const pullRequest = pullRequestPayload.pull_request;
    if (pullRequest.base.ref === 'main') {
        // Fix the backport:version label, only when the PR is closed:
        // - if the only version label is the current version, or no version labels => replace backport:version with backport:skip
        if (payload.action !== 'labeled' &&
            (isPRBackportToCurrentRelease(pullRequest, currentLabel) || hasBackportVersionWithNoTarget(pullRequest))) {
            await githubWrapper.removeLabels(pullRequest, [backportTargets_1.BACKPORT_LABELS.VERSION]);
            await githubWrapper.addLabels(pullRequest, [backportTargets_1.BACKPORT_LABELS.SKIP]);
            core.info("Adjusted labels: removing 'backport:version' and adding 'backport:skip'");
        }
        // Add current target label
        if (!(0, util_1.labelsContain)(pullRequest.labels, currentLabel)) {
            await githubWrapper.addLabels(pullRequest, [currentLabel]);
        }
        // Skip backport if skip label is present
        if ((0, util_1.labelsContain)(pullRequest.labels, backportTargets_1.BACKPORT_LABELS.SKIP)) {
            core.info("Backport skipped because 'backport:skip' label is present");
            return;
        }
        // Find backport targets
        const labelNames = pullRequest.labels.map((label) => label.name);
        const targets = (0, backportTargets_1.resolveTargets)(versions, versionMap, labelNames);
        if (!targets.length) {
            core.info(`Backport skipped, because no backport targets found.`);
            return;
        }
        // Sleep for debounceTimeout to debounce multiple concurrent runs
        core.info(`Waiting ${(debounceTimeout / 1000).toFixed(1)}s to debounce multiple concurrent runs...`);
        await new Promise((resolve) => setTimeout(resolve, debounceTimeout));
        if (workflowState.wasInterrupted) {
            core.warning('Workflow was interrupted. Exiting before starting backport...');
            return;
        }
        else {
            core.info(`Backporting to target branches: ${targets.join(', ')} based on labels: ${labelNames.join(', ')}`);
        }
        // Add comment about planned backports and update PR body with backport metadata
        await updatePRWithBackportInfo(githubWrapper, pullRequest, targets);
        // Start backport for the calculated targets
        try {
            const result = await (0, backport_1.backportRun)({
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
            if (result.status === 'failure') {
                if (typeof result.error === 'string') {
                    throw new Error(result.error);
                }
                else if (result.error instanceof Error) {
                    throw result.error;
                }
                else {
                    throw new Error('Backport failed for an unknown reason');
                }
            }
        }
        catch (err) {
            core.error('Backport failed');
            core.setFailed(err.message);
            githubWrapper
                .createComment(pullRequest.number, `Backport failed. Please check the action logs for details. \n\n${(0, util_1.getGithubActionURL)(process.env)}`)
                .catch(() => {
                core.error('Failed to create comment on PR about backport failure');
            });
        }
    }
    else if ((0, util_1.labelsContain)(pullRequest.labels, 'backport')) {
        // Mark original PR with backport target labels
        const prData = (0, util_1.getPrBackportData)(pullRequest.body);
        if (prData) {
            const prPackageVersion = (await githubWrapper.getFileContent('package.json', pullRequest.base.ref))
                .version;
            for (const pr of prData) {
                if (!pr.sourcePullRequest) {
                    continue;
                }
                await githubWrapper.addLabels(pr.sourcePullRequest, [`v${prPackageVersion}`]);
            }
        }
    }
}
function isPRBackportToCurrentRelease(pullRequest, currentLabel) {
    return ((0, util_1.getVersionLabels)(pullRequest.labels).length === 1 &&
        (0, util_1.getVersionLabels)(pullRequest.labels)[0] === currentLabel &&
        (0, util_1.labelsContain)(pullRequest.labels, backportTargets_1.BACKPORT_LABELS.VERSION));
}
function hasBackportVersionWithNoTarget(pullRequest) {
    return ((0, util_1.getVersionLabels)(pullRequest.labels).length === 0 &&
        (0, util_1.labelsContain)(pullRequest.labels, backportTargets_1.BACKPORT_LABELS.VERSION));
}
async function updatePRWithBackportInfo(githubWrapper, pullRequest, targets) {
    try {
        const actionUrl = (0, util_1.getGithubActionURL)(process.env);
        await githubWrapper.createComment(pullRequest.number, [`Starting backport for target branches: ${targets.join(', ')}`, actionUrl]
            .filter(Boolean)
            .join('\n\n'));
        // Mark PR body with backport targets
        await githubWrapper.updatePullRequest(pullRequest.number, {
            body: `${pullRequest.body}\n\n<!--ONMERGE ${JSON.stringify({
                backportTargets: targets,
            })} ONMERGE-->`,
        });
    }
    catch (error) {
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
//# sourceMappingURL=index.js.map