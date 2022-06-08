"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const backport_1 = require("backport");
async function init() {
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const pullRequest = payload.pull_request;
    const prAuthor = pullRequest.user.login;
    const accessToken = core.getInput('github_token', { required: true });
    const commitUser = core.getInput('commit_user', { required: false });
    const commitEmail = core.getInput('commit_email', { required: false });
    const autoMerge = core.getInput('auto_merge', { required: false }) === 'true';
    const autoMergeMethod = core.getInput('auto_merge_method', { required: false });
    const targetPRLabels = core
        .getInput('target_pr_labels', { required: false })
        .split(',')
        .map((label) => label.trim());
    await (0, exec_1.exec)(`git config --global user.name "${commitUser}"`);
    await (0, exec_1.exec)(`git config --global user.email "${commitEmail}"`);
    await (0, backport_1.backportRun)({
        repoOwner: repo.owner,
        repoName: repo.repo,
        accessToken,
        ci: true,
        pullNumber: pullRequest.number,
        targetPRLabels: targetPRLabels,
        assignees: [prAuthor],
        autoMerge: autoMerge,
        autoMergeMethod: autoMergeMethod,
    });
}
init().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map