import { VersionsParsed } from './versions';

const VERSION_LABEL = /^v(\d+)\.(\d+)\.\d+$/;

interface ParsedVersionLabel {
  major: number;
  minor: number;
}

/**
 * Release branches that sit between an explicit backport label and main.
 *
 * `backport:version` only targets minors that are labeled. After a branch cut,
 * main's version label (v9.6.0) is applied on merge and is not itself a
 * backport request, so a PR labeled v9.4.4 would skip the 9.5 release branch.
 * Comment with those release branches from versions.json. Do not add the label,
 * so a v9.4 backport is not forced onto 9.5. Do not cross majors: a v8.19
 * label does not mention 9.x.
 */
export function getMissingReleaseVersionLabels(versions: VersionsParsed, labels: string[]): string[] {
  const parsed = labels
    .map((label) => {
      const match = label.match(VERSION_LABEL);
      if (!match) {
        return null;
      }
      return { major: Number(match[1]), minor: Number(match[2]) };
    })
    .filter((version): version is ParsedVersionLabel => version !== null);

  const [mainMajor, mainMinor] = versions.current.version.split('.').map(Number);

  const floorByMajor = new Map<number, number>();
  for (const version of parsed) {
    // main's own version label means the commit is already on main.
    if (version.major === mainMajor && version.minor === mainMinor) {
      continue;
    }
    const floor = floorByMajor.get(version.major);
    if (floor === undefined || version.minor < floor) {
      floorByMajor.set(version.major, version.minor);
    }
  }

  const missing: string[] = [];
  for (const version of versions.all) {
    if (version.branchType !== 'release') {
      continue;
    }
    const [major, minor] = version.version.split('.').map(Number);
    const floor = floorByMajor.get(major);
    if (floor === undefined || minor <= floor) {
      continue;
    }
    if (major === mainMajor && minor >= mainMinor) {
      continue;
    }
    if (parsed.some((label) => label.major === major && label.minor === minor)) {
      continue;
    }
    missing.push(`v${version.version}`);
  }

  return missing.sort(compareVersionLabels);
}

export function getVersionGapComment(labelsToAdd: string[]): string {
  return [
    'These release branches sit between the oldest version label on this PR and main, and were not part of this backport:',
    ...labelsToAdd.map((label) => `- ${label}`),
    '',
    'Add the version label if one of them should be backported too.',
  ].join('\n');
}

function compareVersionLabels(left: string, right: string): number {
  const leftParts = left.slice(1).split('.').map(Number);
  const rightParts = right.slice(1).split('.').map(Number);
  for (let i = 0; i < leftParts.length; i++) {
    if (leftParts[i] !== rightParts[i]) {
      return leftParts[i] - rightParts[i];
    }
  }
  return 0;
}
