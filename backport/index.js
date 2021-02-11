"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = void 0;
const axios_1 = require("axios");
const core = require("@actions/core");
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const backport_1 = require("backport");
const createStatusComment_1 = require("./createStatusComment");
exports.getConfig = async (repoOwner, repoName, branch) => {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
    const resp = await axios_1.default.get(url);
    return resp.data;
};
async function backport() {
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const pullRequest = payload.pull_request;
    const owner = pullRequest.user.login;
    const branch = core.getInput('branch', { required: true });
    const accessToken = core.getInput('github_token', { required: true });
    const commitUser = core.getInput('commit_user', { required: true });
    const commitEmail = core.getInput('commit_email', { required: true });
    await exec_1.exec(`git config --global user.name "${commitUser}"`);
    await exec_1.exec(`git config --global user.email "${commitEmail}"`);
    const config = await exports.getConfig(repo.owner, repo.repo, branch);
    const backportResponse = await backport_1.run({
        ...config,
        accessToken,
        fork: true,
        username: commitUser,
        ci: true,
        pullNumber: pullRequest.number,
        labels: ['backport'],
        assignees: [owner],
    });
    await createStatusComment_1.default({
        accessToken,
        repoOwner: repo.owner,
        repoName: repo.repo,
        pullNumber: pullRequest.number,
        backportResponse,
    });
}
backport().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map