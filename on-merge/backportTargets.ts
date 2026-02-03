import { VersionsParsed, VersionMap } from './versions';
import { getVersionLabels } from './util';

export const BACKPORT_LABELS = {
  SKIP: 'backport:skip',
  ALL_OPEN: 'backport:all-open',
  VERSION: 'backport:version',
};

export function resolveTargets(
  versions: VersionsParsed,
  versionToBranchMap: VersionMap,
  labelsOriginal: string[],
) {
  const targets = new Set<string>();

  const labels = labelsOriginal.map((label) => label.toLowerCase());

  if (labels.includes(BACKPORT_LABELS.SKIP)) {
    // backport:skip
    return [];
  }

  if (labels.includes(BACKPORT_LABELS.ALL_OPEN)) {
    // backport:all-open
    versions.all
      .filter((version) => version.branchType !== 'unmaintained' && version.branchType !== 'development')
      .forEach((version) => targets.add(version.branch));
  } else if (labels.includes(BACKPORT_LABELS.VERSION)) {
    // backport:version
    const versionLabels = getVersionLabels(labels);
    versionLabels.forEach((label) => {
      let branch = null;
      for (const [regex, replacement] of Object.entries(versionToBranchMap)) {
        const matcher = new RegExp(regex);
        if (matcher.test(label)) {
          branch = label.replace(matcher, replacement);
          break;
        }
      }

      if (branch && branch !== 'main') {
        targets.add(branch);
      }
    });
  } else {
    // Missing backport labels, but let's not error just now, we haven't been doing that
    // throw new Error(
    //   'No backport labels found, should be one of: ' + Object.values(BACKPORT_LABELS).join(', '),
    // );
  }

  return [...targets].sort();
}
