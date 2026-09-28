"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersionGapComment = exports.getMissingReleaseVersionLabels = void 0;
const VERSION_LABEL = /^v(\d+)\.(\d+)\.\d+$/;
/**
 * Release branches that sit between an explicit backport label and main.
 *
 * `backport:version` only targets minors that are labeled. After a branch cut,
 * main's version label (v9.6.0) is applied on merge and is not itself a
 * backport request, so a PR labeled v9.4.4 would skip the 9.5 release branch.
 * Fill those release branches from versions.json. Do not cross majors: a
 * v8.19 label does not pull in 9.x.
 */
function getMissingReleaseVersionLabels(versions, labels) {
    const parsed = labels
        .map((label) => {
        const match = label.match(VERSION_LABEL);
        if (!match) {
            return null;
        }
        return { major: Number(match[1]), minor: Number(match[2]) };
    })
        .filter((version) => version !== null);
    const [mainMajor, mainMinor] = versions.current.version.split('.').map(Number);
    const floorByMajor = new Map();
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
    const missing = [];
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
exports.getMissingReleaseVersionLabels = getMissingReleaseVersionLabels;
function getVersionGapComment(labelsToAdd) {
    return [
        'The following labels were identified as gaps in your version labels and will be added automatically:',
        ...labelsToAdd.map((label) => `- ${label}`),
        '',
        'These release branches sit between the oldest version label on this PR and main, so they are included in this backport.',
        'If one of them should be skipped, close its backport PR and remove the label.',
    ].join('\n');
}
exports.getVersionGapComment = getVersionGapComment;
function compareVersionLabels(left, right) {
    const leftParts = left.slice(1).split('.').map(Number);
    const rightParts = right.slice(1).split('.').map(Number);
    for (let i = 0; i < leftParts.length; i++) {
        if (leftParts[i] !== rightParts[i]) {
            return leftParts[i] - rightParts[i];
        }
    }
    return 0;
}
//# sourceMappingURL=versionGaps.js.map