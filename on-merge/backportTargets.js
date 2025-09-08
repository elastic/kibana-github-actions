"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTargets = exports.BACKPORT_LABELS = void 0;
const util_1 = require("./util");
exports.BACKPORT_LABELS = {
    SKIP: 'backport:skip',
    ALL_OPEN: 'backport:all-open',
    VERSION: 'backport:version',
};
function resolveTargets(versions, versionMap, labelsOriginal) {
    const targets = new Set();
    const labels = labelsOriginal.map((label) => label.toLowerCase());
    // All open branches
    if (labels.includes(exports.BACKPORT_LABELS.ALL_OPEN)) {
        versions.all
            .filter((version) => version.branchType !== 'unmaintained' && version.branchType !== 'development')
            .forEach((version) => targets.add(version.branch));
    }
    // Versions mapped from the labels
    const versionLabels = (0, util_1.getVersionLabels)(labels);
    versionLabels.forEach((label) => {
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
        }
    });
    return [...targets].sort();
}
exports.resolveTargets = resolveTargets;
//# sourceMappingURL=backportTargets.js.map