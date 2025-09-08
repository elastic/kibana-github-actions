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
const backport_1 = require("backport");
const backportTargets_1 = require("./backportTargets");
const util_1 = require("./util");
const versions_1 = require("./versions");
const github_2 = require("./github");
async function main() {
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const accessToken = core.getInput('github_token', { required: true });
    const githubWrapper = new github_2.GithubWrapper({ accessToken, owner: repo.owner, repo: repo.repo });
    const backportConfig = await githubWrapper.getFileContent('.backportrc.json');
    const versionMap = (backportConfig === null || backportConfig === void 0 ? void 0 : backportConfig.branchLabelMapping) || {};
    const versionsConfig = await githubWrapper.getFileContent('versions.json');
    const versions = (0, versions_1.parseVersions)(versionsConfig);
    const pullRequestPayload = payload;
    const pullRequest = pullRequestPayload.pull_request;
    if (pullRequest.base.ref === 'main') {
        const currentLabel = `v${versions.current.version}`;
        // Fix the backport:version label, if the only version label is the current version
        if ((0, util_1.getVersionLabels)(pullRequest.labels).length === 1 &&
            (0, util_1.getVersionLabels)(pullRequest.labels)[0] === currentLabel &&
            (0, util_1.labelsContain)(pullRequest.labels, backportTargets_1.BACKPORT_LABELS.VERSION)) {
            await githubWrapper.removeLabel(pullRequest.number, backportTargets_1.BACKPORT_LABELS.VERSION);
            await githubWrapper.addLabels(pullRequest.number, [backportTargets_1.BACKPORT_LABELS.SKIP]);
            console.log("Adjusted labels: removing 'backport:version' and adding 'backport:skip'");
        }
        // Add current target label
        if (!(0, util_1.labelsContain)(pullRequest.labels, currentLabel)) {
            await githubWrapper.addLabels(pullRequest.number, [currentLabel]);
        }
        // Find backport targets
        const targets = (0, backportTargets_1.resolveTargets)(versions, versionMap, pullRequest.labels.map((label) => label.name));
        if ((0, util_1.labelsContain)(pullRequest.labels, backportTargets_1.BACKPORT_LABELS.SKIP)) {
            console.log("Backport skipped because 'backport:skip' label is present");
            return;
        }
        if (!targets.length) {
            console.log(`No backport targets found.`);
        }
        try {
            // Log action URL
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
            console.error('An error occurred', error);
            core.setFailed(error.message);
        }
        // Start backport for the calculated targets
        await (0, backport_1.backportRun)({
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
                await githubWrapper.addLabels(pr.sourcePullRequest.number, [`v${prPackageVersion}`]);
            }
        }
    }
}
main().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map