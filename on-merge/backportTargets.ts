import { VersionsParsed, VersionMap } from './versions';
import { getVersionLabels } from './util';
import * as core from '@actions/core';

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
  core.info(`[RESOLVE-TARGETS] Input labels (lowercased): ${labels.join(', ')}`);

  if (labels.includes(BACKPORT_LABELS.SKIP)) {
    // backport:skip
    core.info(`[RESOLVE-TARGETS] Found ${BACKPORT_LABELS.SKIP} label, returning empty targets`);
    return [];
  }

  if (labels.includes(BACKPORT_LABELS.ALL_OPEN)) {
    // backport:all-open
    core.info(`[RESOLVE-TARGETS] Found ${BACKPORT_LABELS.ALL_OPEN} label, selecting all maintained versions`);
    const selectedVersions = versions.all.filter(
      (version) => version.branchType !== 'unmaintained' && version.branchType !== 'development',
    );
    core.info(
      `[RESOLVE-TARGETS] Selected ${selectedVersions.length} versions (excluding unmaintained/development)`,
    );
    selectedVersions.forEach((version) => {
      core.info(
        `[RESOLVE-TARGETS]   Adding target: ${version.branch} (v${version.version}, type: ${
          version.branchType || 'N/A'
        })`,
      );
      targets.add(version.branch);
    });
  } else if (labels.includes(BACKPORT_LABELS.VERSION)) {
    // backport:version
    core.info(
      `[RESOLVE-TARGETS] Found ${BACKPORT_LABELS.VERSION} label, resolving version labels to branches`,
    );
    const versionLabels = getVersionLabels(labels);
    core.info(
      `[RESOLVE-TARGETS] Found ${versionLabels.length} version label(s): ${versionLabels.join(', ')}`,
    );
    versionLabels.forEach((label) => {
      let branch = null;
      for (const [regex, replacement] of Object.entries(versionToBranchMap)) {
        const matcher = new RegExp(regex);
        if (matcher.test(label)) {
          branch = label.replace(matcher, replacement);
          core.info(`[RESOLVE-TARGETS]   Label ${label} matched regex ${regex}, mapped to branch: ${branch}`);
          break;
        }
      }

      if (branch && branch !== 'main') {
        core.info(`[RESOLVE-TARGETS]   Adding target branch: ${branch}`);
        targets.add(branch);
      } else if (branch === 'main') {
        core.info(`[RESOLVE-TARGETS]   Skipping 'main' branch for label ${label}`);
      } else {
        core.info(`[RESOLVE-TARGETS]   No branch mapping found for label ${label}`);
      }
    });
  } else {
    // Missing backport labels, but let's not error just now, we haven't been doing that
    core.info(
      `[RESOLVE-TARGETS] No backport control labels found (expected one of: ${Object.values(
        BACKPORT_LABELS,
      ).join(', ')})`,
    );
    // throw new Error(
    //   'No backport labels found, should be one of: ' + Object.values(BACKPORT_LABELS).join(', '),
    // );
  }

  const sortedTargets = [...targets].sort();
  core.info(`[RESOLVE-TARGETS] Final targets (${sortedTargets.length}): ${sortedTargets.join(', ')}`);
  return sortedTargets;
}
