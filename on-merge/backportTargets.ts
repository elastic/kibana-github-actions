import { VersionsParsed } from './versions';

const semver = require('semver');

function getBranchesAfter(versions: VersionsParsed, version: string): string[] {
  return versions.all
    .filter((v) => !v.currentMinor)
    .filter((v) => semver.compare(v.version, version) >= 0)
    .map((v) => v.branch)
    .sort();
}

export function resolveTargets(versions: VersionsParsed, labelsOriginal: string[]) {
  const targets = new Set<string>();

  const labels = labelsOriginal.map((label) => label.toLowerCase());

  if (labels.includes('backport:prev-minor')) {
    targets.add(versions.previousMinor.branch);
  }

  if (labels.includes('backport:current-major')) {
    targets.add(versions.previousMinor.branch);
    versions.others
      .filter((version) => version.currentMajor)
      .forEach((version) => targets.add(version.branch));
  }

  if (labels.includes('backport:all-open') || labels.includes('backport:prev-major')) {
    targets.add(versions.previousMinor.branch);
    targets.add(versions.previousMajor.branch);
    versions.others.forEach((version) => targets.add(version.branch));
  }

  labels
    .filter((label) => label.match(/^v[0-9]+\.[0-9]+\.[0-9]+$/))
    .forEach((label) => {
      // v8.4.0 -> 8.4
      const version = label.substring(1);
      const branch = version.substring(0, label.lastIndexOf('.') - 1);

      const currentMinor = versions.currentMinor.version.substring(
        0,
        versions.currentMinor.version.lastIndexOf('.'),
      );

      // if the hard-coded version is the same minor as the current minor, we should skip it, because it's `main`
      if (branch !== currentMinor) {
        targets.add(branch);

        // Fill in gaps, e.g. if `v8.1.0` is specified, add everything that is currently open between 8.1 and <main>
        getBranchesAfter(versions, version).forEach((branch) => targets.add(branch));
      }
    });

  return [...targets].sort();
}
