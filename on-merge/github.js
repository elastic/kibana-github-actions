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
exports.GithubWrapper = void 0;
const github_1 = require("@actions/github");
const core = __importStar(require("@actions/core"));
class GithubWrapper {
    constructor({ accessToken, owner, repo }) {
        this.github = (0, github_1.getOctokit)(accessToken).rest;
        this.owner = owner;
        this.repo = repo;
    }
    async getFileContent(filePath, ref = 'main') {
        core.info(`[GH-API] Fetching file content: ${filePath} (ref: ${ref})`);
        const response = await this.github.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            ref,
            path: filePath,
        });
        const content = Buffer.from(response.data.content, 'base64').toString();
        core.info(`[GH-API] Successfully fetched ${filePath}, size: ${content.length} bytes`);
        if (filePath.endsWith('.json')) {
            return JSON.parse(content);
        }
        return content;
    }
    async addLabels(issue, labels) {
        core.info(`[GH-API] Adding labels to issue #${issue.number}: ${labels.join(', ')}`);
        const response = await this.github.issues.addLabels({
            owner: this.owner,
            repo: this.repo,
            issue_number: issue.number,
            labels,
        });
        for (const label of labels) {
            if (!issue.labels.find((l) => l.name === label)) {
                issue.labels.push({ name: label });
            }
        }
        core.info(`[GH-API] Labels added successfully to issue #${issue.number}`);
        return response.data;
    }
    removeLabels(issue, labels) {
        core.info(`[GH-API] Removing labels from issue #${issue.number}: ${labels.join(', ')}`);
        return Promise.all(labels.map((label) => this.removeLabel(issue, label)));
    }
    async removeLabel(issue, label) {
        core.info(`[GH-API] Removing label from issue #${issue.number}: ${label}`);
        issue.labels = issue.labels.filter((l) => l.name !== label);
        const response = await this.github.issues.removeLabel({
            owner: this.owner,
            repo: this.repo,
            issue_number: issue.number,
            name: label,
        });
        core.info(`[GH-API] Label removed successfully from issue #${issue.number}: ${label}`);
        return response;
    }
    async createComment(issueNumber, body) {
        core.info(`[GH-API] Creating comment on issue #${issueNumber}, length: ${body.length} chars`);
        const response = await this.github.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            body,
        });
        core.info(`[GH-API] Comment created successfully on issue #${issueNumber}`);
        return response.data;
    }
    async updatePullRequest(number, updateFields) {
        core.info(`[GH-API] Updating PR #${number}, body length: ${updateFields.body.length} chars`);
        const response = await this.github.pulls.update({
            owner: this.owner,
            repo: this.repo,
            pull_number: number,
            ...updateFields,
        });
        core.info(`[GH-API] PR #${number} updated successfully`);
        return response.data;
    }
}
exports.GithubWrapper = GithubWrapper;
//# sourceMappingURL=github.js.map