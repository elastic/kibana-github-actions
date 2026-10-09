"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVersions = parseVersions;
function parseVersions(versionsFile) {
    const currentVersion = versionsFile.versions.find((v) => v.branch === 'main');
    if (!currentVersion) {
        throw new Error("Couldn't determine current version (no main branch found)");
    }
    const parsed = {
        current: currentVersion,
        all: versionsFile.versions,
    };
    return parsed;
}
//# sourceMappingURL=versions.js.map