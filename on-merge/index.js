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
const versions_1 = require("./versions");
async function init() {
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const accessToken = core.getInput('github_token', { required: true });
    const github = (0, github_1.getOctokit)(accessToken).rest;
    const { data } = await github.repos.getContent({
        ...github_1.context.repo,
        ref: 'main',
        path: 'versions.json',
    });
    const json = Buffer.from(data.content, 'base64').toString();
    const versionsRaw = JSON.parse(json);
    const versions = (0, versions_1.parseVersions)(versionsRaw);
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
            if ([
                'backport:prev-minor',
                'backport:prev-major',
                'backport:all-open',
                'backport:auto-version', // temporary opt-in label
            ].some((gateLabel) => pullRequest.labels.some((label) => label.name === gateLabel))) {
                const targets = (0, backportTargets_1.resolveTargets)(versions, pullRequest.labels.map((label) => label.name));
                // versionLabelsToAdd is temporary until the new process is complete that adds the label AFTER the backport PR is merged
                const versionLabelsToAdd = versions.all
                    .filter((version) => targets.includes(version.branch))
                    .map((version) => `v${version.version}`);
                if (versionLabelsToAdd.length) {
                    await github.issues.addLabels({
                        ...github_1.context.repo,
                        issue_number: pullRequest.number,
                        labels: versionLabelsToAdd,
                    });
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
                        publishStatusCommentOnSuccess: true, // this will flip to false once we have backport summaries implemented
                    },
                });
            }
        }
    }
    else if (pullRequest.labels.some((label) => label.name === 'backport')) {
        // Add version from upstream package.json label to original PR
        // Leave status comment if final backport
        //  Include note about recently-changed versions.json if it was changed in the last 24 hours
    }
}
init().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map