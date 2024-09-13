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
async function init() {
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const accessToken = core.getInput('github_token', { required: true });
    const github = (0, github_1.getOctokit)(accessToken).rest;
    const versionsConfig = await github.repos.getContent({
        ...github_1.context.repo,
        ref: 'main',
        path: 'versions.json',
    });
    const backportConfig = await github.repos.getContent({
        ...github_1.context.repo,
        ref: 'main',
        path: '.backportrc.json',
    });
    const versionsJSON = Buffer.from(versionsConfig.data.content, 'base64').toString();
    const backportJSON = Buffer.from(backportConfig.data.content, 'base64').toString();
    const versionsRaw = JSON.parse(versionsJSON);
    const backportRaw = JSON.parse(backportJSON);
    const versions = (0, versions_1.parseVersions)(versionsRaw);
    const versionMap = (backportRaw === null || backportRaw === void 0 ? void 0 : backportRaw.branchLabelMapping) || {};
    const pullRequestPayload = payload;
    const pullRequest = pullRequestPayload.pull_request;
    if (pullRequest.base.ref === 'main') {
        const currentLabel = `v${versions.currentMinor.version}`;
        if (!pullRequest.labels.some((label) => label.name === currentLabel)) {
            await github.issues.addLabels({
                ...github_1.context.repo,
                issue_number: pullRequest.number,
                labels: [currentLabel],
            });
        }
        const targets = (0, backportTargets_1.resolveTargets)(versions, versionMap, pullRequest.labels.map((label) => label.name));
        if (!(0, util_1.labelsContain)(pullRequest.labels, 'backport:skip') && targets.length) {
            try {
                await github.pulls.update({
                    ...repo,
                    pull_number: pullRequest.number,
                    body: `${pullRequest.body}\n\n<!--ONMERGE ${JSON.stringify({
                        backportTargets: targets,
                    })} ONMERGE-->`,
                });
            }
            catch (error) {
                console.error('An error occurred', error);
                core.setFailed(error.message);
            }
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
    }
    else if ((0, util_1.labelsContain)(pullRequest.labels, 'backport')) {
        const prData = (0, util_1.getPrBackportData)(pullRequest.body);
        if (prData) {
            const version = await (0, util_1.getPrPackageVersion)(github, repo.owner, repo.repo, pullRequest.base.ref);
            for (const pr of prData) {
                if (!pr.sourcePullRequest) {
                    continue;
                }
                await github.issues.addLabels({
                    ...github_1.context.repo,
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
//# sourceMappingURL=index.js.map