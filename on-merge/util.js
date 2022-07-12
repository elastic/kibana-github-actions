"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelsContain = exports.getVersionLabel = exports.getArtifactsApiVersions = exports.getPrBackportData = exports.getPrPackageVersion = void 0;
const axios_1 = __importDefault(require("axios"));
const semver_1 = __importDefault(require("semver"));
async function getPrPackageVersion(github, repoOwner, repoName, ref) {
    const { data } = await github.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        ref: ref,
        path: 'package.json',
    });
    const json = Buffer.from(data.content, 'base64').toString();
    const { version } = JSON.parse(json);
    return version;
}
exports.getPrPackageVersion = getPrPackageVersion;
function getPrBackportData(prBody) {
    const prDataMatch = prBody.match(/<!--BACKPORT (.*?) BACKPORT-->/s);
    if (prDataMatch === null || prDataMatch === void 0 ? void 0 : prDataMatch[1]) {
        const prDataJson = prDataMatch[1];
        const prData = JSON.parse(prDataJson);
        return prData;
    }
    return null;
}
exports.getPrBackportData = getPrBackportData;
async function getArtifactsApiVersions() {
    const { data } = await axios_1.default.get('https://artifacts.elastic.co/api/v1/versions');
    return data;
}
exports.getArtifactsApiVersions = getArtifactsApiVersions;
function getVersionLabel(artifactsApiVersions, version) {
    const nonSnapshotExists = artifactsApiVersions.versions.some((v) => v === version);
    return `v${nonSnapshotExists ? semver_1.default.inc(version, 'patch') : version}`;
}
exports.getVersionLabel = getVersionLabel;
function labelsContain(labels, label) {
    return labels.some((l) => l.name === label);
}
exports.labelsContain = labelsContain;
//# sourceMappingURL=util.js.map