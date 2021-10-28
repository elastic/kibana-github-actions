"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = void 0;
const axios_1 = require("axios");
const core = require("@actions/core");
const github_1 = require("@actions/github");
const fixGaps_1 = require("./fixGaps");
const getConfig = async (repoOwner, repoName, branch) => {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
    const resp = await axios_1.default.get(url);
    return resp.data;
};
exports.getConfig = getConfig;
async function run() {
    const { payload } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const accessToken = core.getInput('github_token', { required: true });
    const pullRequestPayload = payload;
    const pullRequest = pullRequestPayload.pull_request;
    const backportConfig = await exports.getConfig(pullRequest.base.repo.owner.login, pullRequest.base.repo.name, 'main');
    await fixGaps_1.fixGaps(accessToken, backportConfig, pullRequest);
}
run().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map