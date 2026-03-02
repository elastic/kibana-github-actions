"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTargets = exports.BACKPORT_LABELS = void 0;
const util_1 = require("./util");
const core = __importStar(require("@actions/core"));
exports.BACKPORT_LABELS = {
    SKIP: 'backport:skip',
    ALL_OPEN: 'backport:all-open',
    VERSION: 'backport:version',
};
function resolveTargets(versions, versionToBranchMap, labelsOriginal) {
    const targets = new Set();
    const labels = labelsOriginal.map((label) => label.toLowerCase());
    core.info(`[RESOLVE-TARGETS] Input labels (lowercased): ${labels.join(', ')}`);
    if (labels.includes(exports.BACKPORT_LABELS.SKIP)) {
        // backport:skip
        core.info(`[RESOLVE-TARGETS] Found ${exports.BACKPORT_LABELS.SKIP} label, returning empty targets`);
        return [];
    }
    if (labels.includes(exports.BACKPORT_LABELS.ALL_OPEN)) {
        // backport:all-open
        core.info(`[RESOLVE-TARGETS] Found ${exports.BACKPORT_LABELS.ALL_OPEN} label, selecting all maintained versions`);
        const selectedVersions = versions.all.filter((version) => version.branchType !== 'unmaintained' && version.branchType !== 'development');
        core.info(`[RESOLVE-TARGETS] Selected ${selectedVersions.length} versions (excluding unmaintained/development)`);
        selectedVersions.forEach((version) => {
            core.info(`[RESOLVE-TARGETS]   Adding target: ${version.branch} (v${version.version}, type: ${version.branchType || 'N/A'})`);
            targets.add(version.branch);
        });
    }
    else if (labels.includes(exports.BACKPORT_LABELS.VERSION)) {
        // backport:version
        core.info(`[RESOLVE-TARGETS] Found ${exports.BACKPORT_LABELS.VERSION} label, resolving version labels to branches`);
        const versionLabels = (0, util_1.getVersionLabels)(labels);
        core.info(`[RESOLVE-TARGETS] Found ${versionLabels.length} version label(s): ${versionLabels.join(', ')}`);
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
            }
            else if (branch === 'main') {
                core.info(`[RESOLVE-TARGETS]   Skipping 'main' branch for label ${label}`);
            }
            else {
                core.info(`[RESOLVE-TARGETS]   No branch mapping found for label ${label}`);
            }
        });
    }
    else {
        // Missing backport labels, but let's not error just now, we haven't been doing that
        core.info(`[RESOLVE-TARGETS] No backport control labels found (expected one of: ${Object.values(exports.BACKPORT_LABELS).join(', ')})`);
        // throw new Error(
        //   'No backport labels found, should be one of: ' + Object.values(BACKPORT_LABELS).join(', '),
        // );
    }
    const sortedTargets = [...targets].sort();
    core.info(`[RESOLVE-TARGETS] Final targets (${sortedTargets.length}): ${sortedTargets.join(', ')}`);
    return sortedTargets;
}
exports.resolveTargets = resolveTargets;
//# sourceMappingURL=backportTargets.js.map