import { VersionsParsed, VersionMap } from './versions';

const semver = require('semver');

function getBranchesAfter(versions: VersionsParsed, version: string): string[] {
  return versions.all
    .filter((v) => !v.currentMinor)
    .filter((v) => semver.compare(v.version, version) >= 0)
    .map((v) => v.branch)
    .sort();
}

export function resolveTargets(versions: VersionsParsed, versionMap: VersionMap, labelsOriginal: string[]) {
  const targets = new Set<string>();

  const labels = labelsOriginal.map((label) => label.toLowerCase());

  if (labels.includes('backport:prev-minor')) {
    targets.add(versions.previousMinor.branch);
  }

  if (labels.includes('backport:prev-major')) {
    versions.all.filter((version) => version.previousMajor).forEach((version) => targets.add(version.branch));
  }

  if (labels.includes('backport:current-major')) {
    versions.all
      .filter((version) => version.currentMajor && version.branch !== 'main')
      .forEach((version) => targets.add(version.branch));
  }

  if (labels.includes('backport:all-open')) {
    versions.all
      .filter((version) => version.branch !== 'main')
      // 7.17 is still active, but not a target for all-open
      // backports will specifically opt in using backport:version
      .filter((version) => version.branch !== '7.17')
      .forEach((version) => targets.add(version.branch));
  }

  labels
    .filter((label) => label.match(/^v[0-9]+\.[0-9]+\.[0-9]+$/))
    .forEach((label) => {
      let branch = null;
      for (const [regex, replacement] of Object.entries(versionMap)) {
        const matcher = new RegExp(regex);
        if (matcher.test(label)) {
          branch = label.replace(matcher, replacement);
          break;
        }
      }

      if (branch && branch !== 'main') {
        targets.add(branch);

        if (!labels.includes('backport:version') && !labels.includes('auto-backport')) {
          // Fill in gaps, e.g. if `v8.1.0` is specified, add everything that is currently open between 8.1 and <main>
          const version = label.substring(1);
          getBranchesAfter(versions, version).forEach((branch) => targets.add(branch));
        }
      }
    });

  return [...targets].sort();
}
