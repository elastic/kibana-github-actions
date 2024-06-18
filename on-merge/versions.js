"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVersions = void 0;
function parseVersions(versions) {
    const currentMinor = versions.versions.find((version) => version.currentMinor);
    const previousMinor = versions.versions.filter((version) => version.previousMinor);
    const previousMajor = versions.versions.find((version) => version.previousMajor);
    if (!currentMinor) {
        throw new Error('versions.json is missing current minor version information');
    }
    if (!previousMinor) {
        throw new Error('versions.json is missing previous minor version information');
    }
    if (!previousMajor) {
        throw new Error('versions.json is missing previous major version information');
    }
    const others = versions.versions.filter((version) => !version.currentMinor && !version.previousMinor && !version.previousMajor);
    const parsed = {
        currentMinor,
        previousMinor,
        previousMajor,
        others,
        all: versions.versions,
    };
    return parsed;
}
exports.parseVersions = parseVersions;
//# sourceMappingURL=versions.js.map