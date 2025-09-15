"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVersions = void 0;
function parseVersions(versions) {
    const currentVersion = versions.versions.find((v) => v.branchType === 'development') ||
        versions.versions.find((v) => v.branch === 'main');
    if (!currentVersion) {
        throw new Error("Couldn't determine current version (no development or main branch found)");
    }
    const parsed = {
        current: currentVersion,
        all: versions.versions,
    };
    return parsed;
}
exports.parseVersions = parseVersions;
//# sourceMappingURL=versions.js.map