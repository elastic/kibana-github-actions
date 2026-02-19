import { Commit } from 'backport';
import axios from 'axios';
import semver from 'semver';
import * as core from '@actions/core';
import * as fs from 'fs';

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

/**
 * Tails a log file and forwards new lines to GitHub Actions output in real-time.
 * Returns a stop function that flushes remaining content and cleans up.
 */
export function tailFileToActions(filePath: string, intervalMs = 1000): () => void {
  let offset = 0;
  let buffer = '';
  let stopped = false;

  function flush() {
    let content: string;
    try {
      const fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      if (stat.size <= offset) {
        fs.closeSync(fd);
        return;
      }
      const readBuf = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, readBuf as any, 0, readBuf.length, offset);
      offset = stat.size;
      fs.closeSync(fd);
      content = readBuf.toString('utf-8');
    } catch {
      return;
    }

    buffer += content;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const level = entry.level ?? 'info';
        const ts = entry.timestamp ?? '';
        const msg = entry.message ?? '';
        const meta =
          entry.metadata && Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : '';
        const formatted = [`[BACKPORT-LIB]`, ts, `[${level}]`, msg, meta].filter(Boolean).join(' ');
        if (level === 'error') {
          core.error(formatted);
        } else if (level === 'warn') {
          core.warning(formatted);
        } else {
          core.info(formatted);
        }
      } catch {
        core.info(`[BACKPORT-LIB] ${line}`);
      }
    }
  }

  const timer = setInterval(() => {
    if (!stopped) flush();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    flush();
    if (buffer.trim()) {
      core.info(`[BACKPORT-LIB] ${buffer}`);
      buffer = '';
    }
  };
}
