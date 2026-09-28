"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isoDateDaysAgo = exports.backportSearchQuery = exports.gapComment = exports.alreadyNotified = exports.isCommitOnBranch = exports.pullsMissingFromTarget = exports.sourcePullNumberFromTitle = exports.olderSameMajorReleaseBranches = exports.releaseTarget = exports.branchFromTag = exports.GAP_COMMENT_MARKER = void 0;
const TAG_PATTERN = /^v(\d+)\.(\d+)\.\d+/;
const SOURCE_PULL_PATTERN = /\(#(\d+)\)/g;
exports.GAP_COMMENT_MARKER = 'backport-gap-check';
function branchFromTag(tag) {
    const match = tag.match(TAG_PATTERN);
    if (!match) {
        return null;
    }
    return `${match[1]}.${match[2]}`;
}
exports.branchFromTag = branchFromTag;
function releaseTarget(versions, branch) {
    const entry = versions.versions.find((version) => version.branch === branch && version.branchType === 'release');
    if (!entry) {
        return null;
    }
    const [major, minor] = entry.version.split('.').map(Number);
    return { branch, major, minor };
}
exports.releaseTarget = releaseTarget;
function olderSameMajorReleaseBranches(versions, target) {
    return versions.versions
        .filter((version) => version.branchType === 'release')
        .map((version) => {
        const [major, minor] = version.version.split('.').map(Number);
        return { branch: version.branch, major, minor };
    })
        .filter((version) => version.major === target.major && version.minor < target.minor)
        .map(({ branch, minor }) => ({ branch, minor }));
}
exports.olderSameMajorReleaseBranches = olderSameMajorReleaseBranches;
function sourcePullNumberFromTitle(title) {
    const matches = [...title.matchAll(SOURCE_PULL_PATTERN)];
    if (!matches.length) {
        return null;
    }
    return Number(matches[matches.length - 1][1]);
}
exports.sourcePullNumberFromTitle = sourcePullNumberFromTitle;
/** Keep the closest older branch when the same PR was backported more than once. */
function pullsMissingFromTarget(olderBackports, presentOnTarget) {
    const closest = new Map();
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
exports.pullsMissingFromTarget = pullsMissingFromTarget;
function isCommitOnBranch(aheadBy) {
    return aheadBy === 0;
}
exports.isCommitOnBranch = isCommitOnBranch;
function alreadyNotified(commentBodies, targetBranch) {
    const marker = `<!-- ${exports.GAP_COMMENT_MARKER}:${targetBranch} -->`;
    return commentBodies.some((body) => body.includes(marker));
}
exports.alreadyNotified = alreadyNotified;
function gapComment(args) {
    return [
        `This change is on \`main\` and was backported to \`${args.olderBranch}\` (#${args.backportPullNumber}), but it is not on the \`${args.targetBranch}\` release branch.`,
        '',
        `<!-- ${exports.GAP_COMMENT_MARKER}:${args.targetBranch} -->`,
    ].join('\n');
}
exports.gapComment = gapComment;
function backportSearchQuery(repo, branch, since) {
    return `repo:${repo} is:pr is:merged base:${branch} label:backport merged:>=${since}`;
}
exports.backportSearchQuery = backportSearchQuery;
function isoDateDaysAgo(days, now = new Date()) {
    const date = new Date(now.getTime());
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}
exports.isoDateDaysAgo = isoDateDaysAgo;
//# sourceMappingURL=gaps.js.map