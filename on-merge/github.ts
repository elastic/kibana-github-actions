import { getOctokit } from '@actions/github';
import * as core from '@actions/core';

type GithubOptions = {
  accessToken: string;
  owner: string;
  repo: string;
};

type HasNumber = {
  number: number;
};
type HasLabels = {
  labels: { name: string }[];
};

export class GithubWrapper {
  github: ReturnType<typeof getOctokit>['rest'];
  owner: string;
  repo: string;

  constructor({ accessToken, owner, repo }: GithubOptions) {
    this.github = getOctokit(accessToken).rest;
    this.owner = owner;
    this.repo = repo;
  }

  async getFileContent(filePath: string, ref = 'main') {
    core.info(`[GH-API] Fetching file content: ${filePath} (ref: ${ref})`);
    const response = await this.github.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      ref,
      path: filePath,
    });
    const content = Buffer.from((response.data as any).content, 'base64').toString();
    core.info(`[GH-API] Successfully fetched ${filePath}, size: ${content.length} bytes`);
    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    }
    return content;
  }

  async addLabels(issue: HasNumber & HasLabels, labels: string[]) {
    core.info(`[GH-API] Adding labels to issue #${issue.number}: ${labels.join(', ')}`);
    const response = await this.github.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issue.number,
      labels,
    });
    for (const label of labels) {
      if (!issue.labels.find((l) => l.name === label)) {
        issue.labels.push({ name: label } as any);
      }
    }
    core.info(`[GH-API] Labels added successfully to issue #${issue.number}`);
    return response.data;
  }

  removeLabels(issue: HasNumber & HasLabels, labels: string[]) {
    core.info(`[GH-API] Removing labels from issue #${issue.number}: ${labels.join(', ')}`);
    return Promise.all(labels.map((label) => this.removeLabel(issue, label)));
  }

  async removeLabel(issue: HasNumber & HasLabels, label: string) {
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

  async createComment(issueNumber: number, body: string) {
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

  async updatePullRequest(number: number, updateFields: { body: string }) {
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
