"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVersions = void 0;
function parseVersions(versions) {
    const parsed = {
        current: versions.versions.find((v) => v.branchType === 'development'),
        all: versions.versions,
    };
    return parsed;
}
exports.parseVersions = parseVersions;
//# sourceMappingURL=versions.js.map