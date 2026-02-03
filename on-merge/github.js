"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubWrapper = void 0;
const github_1 = require("@actions/github");
class GithubWrapper {
    constructor({ accessToken, owner, repo }) {
        this.github = (0, github_1.getOctokit)(accessToken).rest;
        this.owner = owner;
        this.repo = repo;
    }
    async getFileContent(filePath, ref = 'main') {
        const response = await this.github.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            ref,
            path: filePath,
        });
        const content = Buffer.from(response.data.content, 'base64').toString();
        if (filePath.endsWith('.json')) {
            return JSON.parse(content);
        }
        return content;
    }
    async addLabels(issue, labels) {
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
        return response.data;
    }
    removeLabels(issue, labels) {
        return Promise.all(labels.map((label) => this.removeLabel(issue, label)));
    }
    async removeLabel(issue, label) {
        issue.labels = issue.labels.filter((l) => l.name !== label);
        return this.github.issues.removeLabel({
            owner: this.owner,
            repo: this.repo,
            issue_number: issue.number,
            name: label,
        });
    }
    async createComment(issueNumber, body) {
        const response = await this.github.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            body,
        });
        return response.data;
    }
    async updatePullRequest(number, updateFields) {
        const response = await this.github.pulls.update({
            owner: this.owner,
            repo: this.repo,
            pull_number: number,
            ...updateFields,
        });
        return response.data;
    }
}
exports.GithubWrapper = GithubWrapper;
//# sourceMappingURL=github.js.map