import { Commit } from 'backport';
import axios from 'axios';
import semver from 'semver';

type Octokit = ReturnType<typeof import('@actions/github').getOctokit>;

export async function getPrPackageVersion(
  github: Octokit['rest'],
  repoOwner: string,
  repoName: string,
  ref: string,
) {
  const { data } = await github.repos.getContent({
    owner: repoOwner,
    repo: repoName,
    ref: ref,
    path: 'package.json',
  });

  const json = Buffer.from((data as any).content, 'base64').toString();
  const { version } = JSON.parse(json) as { version: string };

  return version;
}

export function getPrBackportData(prBody: string | undefined | null) {
  const prDataMatch = prBody?.match(/<!--BACKPORT (.*?) BACKPORT-->/s);
  if (prDataMatch?.[1]) {
    const prDataJson = prDataMatch[1];
    const prData: Commit[] = JSON.parse(prDataJson);
    return prData;
  }

  return null;
}

export interface ArtifactsApiVersions {
  versions: string[];
  aliases: string[];
  manifests: {
    'last-update-time': string;
    'seconds-since-last-update': number;
  };
}

export async function getArtifactsApiVersions() {
  const { data } = await axios.get('https://artifacts.elastic.co/api/v1/versions');
  return data as ArtifactsApiVersions;
}

export function getVersionLabel(artifactsApiVersions: ArtifactsApiVersions, version: string) {
  const nonSnapshotExists = artifactsApiVersions.versions.some((v) => v === version);

  return `v${nonSnapshotExists ? semver.inc(version, 'patch') : version}`;
}

export function labelsContain(labels: { name: string }[], label: string) {
  return labels.some((l) => l.name.toLowerCase() === label.toLowerCase());
}

const VERSION_LABEL_REGEX = /^v\d+\.\d+\.\d+$/;
export function getVersionLabels(labels: { name: string }[] | string[]) {
  if (labels.length === 0) {
    return [];
  }

  if (typeof labels[0] === 'string') {
    return (labels as string[]).filter((name) => name.match(VERSION_LABEL_REGEX));
  } else {
    return (labels as { name: string }[])
      .map((l) => l.name)
      .filter((name) => name.match(VERSION_LABEL_REGEX));
  }
}

export function getGithubActionURL(env: typeof process.env) {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  return '';
}
