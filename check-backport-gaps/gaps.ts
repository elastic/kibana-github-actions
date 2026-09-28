export interface VersionEntry {
  version: string;
  branch: string;
  branchType?: string;
}

export interface VersionsFile {
  versions: VersionEntry[];
}

export interface OlderBackport {
  sourcePullNumber: number;
  olderBranch: string;
  olderMinor: number;
  backportPullNumber: number;
}

const TAG_PATTERN = /^v(\d+)\.(\d+)\.\d+/;
const SOURCE_PULL_PATTERN = /\(#(\d+)\)/g;
export const GAP_COMMENT_MARKER = 'backport-gap-check';

export function branchFromTag(tag: string): string | null {
  const match = tag.match(TAG_PATTERN);
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}`;
}

export function releaseTarget(
  versions: VersionsFile,
  branch: string,
): { branch: string; major: number; minor: number } | null {
  const entry = versions.versions.find(
    (version) => version.branch === branch && version.branchType === 'release',
  );
  if (!entry) {
    return null;
  }
  const [major, minor] = entry.version.split('.').map(Number);
  return { branch, major, minor };
}

export function olderSameMajorReleaseBranches(
  versions: VersionsFile,
  target: { major: number; minor: number },
): Array<{ branch: string; minor: number }> {
  return versions.versions
    .filter((version) => version.branchType === 'release')
    .map((version) => {
      const [major, minor] = version.version.split('.').map(Number);
      return { branch: version.branch, major, minor };
    })
    .filter((version) => version.major === target.major && version.minor < target.minor)
    .map(({ branch, minor }) => ({ branch, minor }));
}

export function sourcePullNumberFromTitle(title: string): number | null {
  const matches = [...title.matchAll(SOURCE_PULL_PATTERN)];
  if (!matches.length) {
    return null;
  }
  return Number(matches[matches.length - 1][1]);
}

/** Keep the closest older branch when the same PR was backported more than once. */
export function pullsMissingFromTarget(
  olderBackports: OlderBackport[],
  presentOnTarget: Set<number>,
): OlderBackport[] {
  const closest = new Map<number, OlderBackport>();
  for (const backport of olderBackports) {
    if (presentOnTarget.has(backport.sourcePullNumber)) {
      continue;
    }
    const current = closest.get(backport.sourcePullNumber);
    if (!current || backport.olderMinor > current.olderMinor) {
      closest.set(backport.sourcePullNumber, backport);
    }
  }
  return [...closest.values()].sort((left, right) => left.sourcePullNumber - right.sourcePullNumber);
}

export function isCommitOnBranch(aheadBy: number): boolean {
  return aheadBy === 0;
}

export function alreadyNotified(commentBodies: string[], targetBranch: string): boolean {
  const marker = `<!-- ${GAP_COMMENT_MARKER}:${targetBranch} -->`;
  return commentBodies.some((body) => body.includes(marker));
}

export function gapComment(args: {
  targetBranch: string;
  olderBranch: string;
  backportPullNumber: number;
}): string {
  return [
    `This change is on \`main\` and was backported to \`${args.olderBranch}\` (#${args.backportPullNumber}), but it is not on the \`${args.targetBranch}\` release branch.`,
    '',
    `<!-- ${GAP_COMMENT_MARKER}:${args.targetBranch} -->`,
  ].join('\n');
}

export function backportSearchQuery(repo: string, branch: string, since: string): string {
  return `repo:${repo} is:pr is:merged base:${branch} label:backport merged:>=${since}`;
}

export function isoDateDaysAgo(days: number, now = new Date()): string {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
