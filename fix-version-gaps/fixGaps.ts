import { Octokit } from '@octokit/rest';
import { PullRequest } from '@octokit/webhooks-definitions/schema';
import { ConfigOptions } from 'backport';

export function getLowestVersionsOnPr(pr: PullRequest) {
  const lowestVersionsOnPr: Record<string, string> = {};
  for (const label of pr.labels) {
    const matches = label.name.match(/^v([0-9.]+)$/);
    if (matches) {
      const [major, minor] = matches[1].split('.');

      if (!lowestVersionsOnPr[major]) {
        lowestVersionsOnPr[major] = minor;
      } else if (parseInt(lowestVersionsOnPr[major], 10) > parseInt(minor, 10)) {
        lowestVersionsOnPr[major] = minor;
      }
    }
  }

  return lowestVersionsOnPr;
}

export function getVersionsFromBackportConfig(config: ConfigOptions) {
  const highestVersions = [];

  for (const label in config.branchLabelMapping) {
    const matches = label.match(/^\^v([0-9.]+)\$$/);
    if (matches) {
      const version = matches[1];
      highestVersions.push(version);
    }
  }

  return highestVersions;
}

export function getVersionLabelsToAdd(config: ConfigOptions, pr: PullRequest) {
  const versionsFromBackportConfig = getVersionsFromBackportConfig(config);
  const lowestVersionsOnPr = getLowestVersionsOnPr(pr);
  const allLabels = pr.labels.map((label) => label.name);

  const versionLabelsToAdd = [];

  for (const version of versionsFromBackportConfig) {
    const [major, minor] = version.split('.');
    const nextVersion = parseInt(lowestVersionsOnPr[major], 10) + 1;
    for (let i = nextVersion; i <= parseInt(minor, 10); i++) {
      const label = `v${major}.${i}.0`;
      if (!allLabels.find((labelToCheck) => labelToCheck.match(`^v${major}\\.${i}\\.`))) {
        versionLabelsToAdd.push(label);
      }
    }
  }

  return versionLabelsToAdd;
}

export function getCommentFromLabels(labelsToAdd: string[]) {
  return [
    'The following labels were identified as gaps in your version labels and will be added automatically:',
    ...labelsToAdd.map((label) => `- ${label}`),
    '',
    'If any of these should not be on your pull request, please manually remove them.',
  ].join('\n');
}

function createComment(octokit: Octokit, pr: PullRequest, labelsToAdd: string[]) {
  return octokit.issues.createComment({
    owner: pr.base.repo.owner.login,
    repo: pr.base.repo.name,
    issue_number: pr.number,
    body: getCommentFromLabels(labelsToAdd),
  });
}

function addLabels(octokit: Octokit, pr: PullRequest, labelsToAdd: string[]) {
  return octokit.issues.addLabels({
    owner: pr.base.repo.owner.login,
    repo: pr.base.repo.name,
    issue_number: pr.number,
    labels: labelsToAdd,
  });
}

export async function fixGaps(accessToken: string, config: ConfigOptions, pr: PullRequest) {
  const labelsToAdd = getVersionLabelsToAdd(config, pr);

  if (labelsToAdd.length > 0) {
    const octokit = new Octokit({
      auth: accessToken,
    });

    await createComment(octokit, pr, labelsToAdd);
    await addLabels(octokit, pr, labelsToAdd);
  }
}
