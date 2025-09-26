import { getOctokit } from '@actions/github';

type GithubOptions = {
  accessToken: string;
  owner: string;
  repo: string;
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
    const response = await this.github.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      ref,
      path: filePath,
    });
    const content = Buffer.from((response.data as any).content, 'base64').toString();
    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    }
    return content;
  }

  async addLabels(issueNumber: number, labels: string[]) {
    const response = await this.github.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
    return response.data;
  }

  removeLabel(prNumber: number, label: string) {
    return this.github.issues.removeLabel({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      name: label,
    });
  }

  async createComment(issueNumber: number, body: string) {
    const response = await this.github.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return response.data;
  }

  async updatePullRequest(number: number, updateFields: { body: string }) {
    const response = await this.github.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: number,
      ...updateFields,
    });
    return response.data;
  }
}
