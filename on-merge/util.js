"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGithubActionURL = exports.getVersionLabels = exports.labelsContain = exports.getVersionLabel = exports.getArtifactsApiVersions = exports.getPrBackportData = void 0;
const axios_1 = __importDefault(require("axios"));
const semver_1 = __importDefault(require("semver"));
function getPrBackportData(prBody) {
    const prDataMatch = prBody === null || prBody === void 0 ? void 0 : prBody.match(/<!--BACKPORT (.*?) BACKPORT-->/s);
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
    return labels.some((l) => l.name.toLowerCase() === label.toLowerCase());
}
exports.labelsContain = labelsContain;
const VERSION_LABEL_REGEX = /^v\d+\.\d+\.\d+$/;
function getVersionLabels(labels) {
    if (labels.length === 0) {
        return [];
    }
    if (typeof labels[0] === 'string') {
        return labels.filter((name) => name.match(VERSION_LABEL_REGEX));
    }
    else {
        return labels
            .map((l) => l.name)
            .filter((name) => name.match(VERSION_LABEL_REGEX));
    }
}
exports.getVersionLabels = getVersionLabels;
function getGithubActionURL(env) {
    if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
        return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    }
    return '';
}
exports.getGithubActionURL = getGithubActionURL;
//# sourceMappingURL=util.js.map