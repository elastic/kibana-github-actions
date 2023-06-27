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
const rest_1 = require("@octokit/rest");
main().catch((error) => {
    core.error(error);
    core.setFailed(error.message);
});
async function main() {
    const { payload } = github_1.context;
    const accessToken = core.getInput('github_token', { required: true });
    const allowedAuthors = ensureArray(core.getInput('allowed_authors', { required: true }));
    const approvalMessage = core.getInput('approval_message', { required: false }) || 'Automated Approval';
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const pullRequest = payload.pull_request;
    const prAuthor = pullRequest.user.login;
    if (!allowedAuthors.includes(prAuthor)) {
        throw new Error("Only pull-requests by 'allowed_authors' can be auto-approved");
    }
    const octokit = new rest_1.Octokit({
        auth: accessToken,
    });
    await octokit.pulls.createReview({
        owner: 'elastic',
        repo: 'kibana',
        pull_number: pullRequest.number,
        event: 'APPROVE',
        body: approvalMessage,
    });
    core.info('Pull request approved!');
}
function ensureArray(input) {
    if (Array.isArray(input)) {
        return input;
    }
    else {
        return [input];
    }
}
//# sourceMappingURL=index.js.map