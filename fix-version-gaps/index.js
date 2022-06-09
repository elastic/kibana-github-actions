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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = void 0;
const axios_1 = __importDefault(require("axios"));
const core = __importStar(require("@actions/core"));
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
    const backportConfig = await (0, exports.getConfig)(pullRequest.base.repo.owner.login, pullRequest.base.repo.name, 'main');
    await (0, fixGaps_1.fixGaps)(accessToken, backportConfig, pullRequest);
}
run().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map