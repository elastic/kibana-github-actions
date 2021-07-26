"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixGaps = exports.getCommentFromLabels = exports.getVersionLabelsToAdd = exports.getVersionsFromBackportConfig = exports.getLowestVersionsOnPr = void 0;
const rest_1 = require("@octokit/rest");
function getLowestVersionsOnPr(pr) {
    const lowestVersionsOnPr = {};
    for (const label of pr.labels) {
        const matches = label.name.match(/^v([0-9.]+)$/);
        if (matches) {
            const [major, minor] = matches[1].split('.');
            if (!lowestVersionsOnPr[major]) {
                lowestVersionsOnPr[major] = minor;
            }
            else if (parseInt(lowestVersionsOnPr[major], 10) > parseInt(minor, 10)) {
                lowestVersionsOnPr[major] = minor;
            }
        }
    }
    return lowestVersionsOnPr;
}
exports.getLowestVersionsOnPr = getLowestVersionsOnPr;
function getVersionsFromBackportConfig(config) {
    const highestVersions = [];
    for (const label in config.branchLabelMapping) {
        const matches = label.match(/^\^v([0-9.]+)\$$/);
        if (matches) {
            const version = matches[1];
            highestVersions.push(version);
        }
    }
    return highestVersions;
}
exports.getVersionsFromBackportConfig = getVersionsFromBackportConfig;
function getVersionLabelsToAdd(config, pr) {
    const versionsFromBackportConfig = getVersionsFromBackportConfig(config);
    const lowestVersionsOnPr = getLowestVersionsOnPr(pr);
    const allLabels = pr.labels.map((label) => label.name);
    const versionLabelsToAdd = [];
    for (const version of versionsFromBackportConfig) {
        const [major, minor] = version.split('.');
        const nextVersion = parseInt(lowestVersionsOnPr[major], 10) + 1;
        for (let i = nextVersion; i <= parseInt(minor, 10); i++) {
            const label = `v${major}.${i}.0`;
            if (!allLabels.find((labelToCheck) => labelToCheck.match(`^v${major}\\.${i}\\.`))) {
                versionLabelsToAdd.push(label);
            }
        }
    }
    return versionLabelsToAdd;
}
exports.getVersionLabelsToAdd = getVersionLabelsToAdd;
function getCommentFromLabels(labelsToAdd) {
    return [
        'The following labels were identified as gaps in your version labels and will be added automatically:',
        ...labelsToAdd.map((label) => `- ${label}`),
        '',
        'If any of these should not be on your pull request, please manually remove them.',
    ].join('\n');
}
exports.getCommentFromLabels = getCommentFromLabels;
function createComment(octokit, pr, labelsToAdd) {
    return octokit.issues.createComment({
        owner: pr.base.repo.owner.login,
        repo: pr.base.repo.name,
        issue_number: pr.number,
        body: getCommentFromLabels(labelsToAdd),
    });
}
function addLabels(octokit, pr, labelsToAdd) {
    return octokit.issues.addLabels({
        owner: pr.base.repo.owner.login,
        repo: pr.base.repo.name,
        issue_number: pr.number,
        labels: labelsToAdd,
    });
}
async function fixGaps(accessToken, config, pr) {
    const labelsToAdd = getVersionLabelsToAdd(config, pr);
    if (labelsToAdd.length > 0) {
        const octokit = new rest_1.Octokit({
            auth: accessToken,
        });
        await createComment(octokit, pr, labelsToAdd);
        await addLabels(octokit, pr, labelsToAdd);
    }
}
exports.fixGaps = fixGaps;
//# sourceMappingURL=fixGaps.js.map