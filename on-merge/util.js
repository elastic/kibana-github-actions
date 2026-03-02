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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tailFileToActions = exports.getGithubActionURL = exports.getVersionLabels = exports.labelsContain = exports.getVersionLabel = exports.getArtifactsApiVersions = exports.getPrBackportData = void 0;
const axios_1 = __importDefault(require("axios"));
const semver_1 = __importDefault(require("semver"));
const fs = __importStar(require("fs"));
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
/**
 * Tails a log file and forwards new lines to the provided logger in real-time.
 * Defaults to GitHub Actions core logger. Returns a stop function that flushes
 * remaining content and cleans up.
 */
function tailFileToActions({ filePath, intervalMs = 1000, logger, }) {
    let offset = 0;
    let buffer = '';
    let stopped = false;
    function flush() {
        var _a, _b, _c, _d;
        let content;
        try {
            const fd = fs.openSync(filePath, 'r');
            const stat = fs.fstatSync(fd);
            if (stat.size <= offset) {
                fs.closeSync(fd);
                return;
            }
            const readBuf = Buffer.alloc(stat.size - offset);
            fs.readSync(fd, readBuf, 0, readBuf.length, offset);
            offset = stat.size;
            fs.closeSync(fd);
            content = readBuf.toString('utf-8');
        }
        catch {
            return;
        }
        buffer += content;
        const lines = buffer.split('\n');
        buffer = (_a = lines.pop()) !== null && _a !== void 0 ? _a : '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const level = (_b = entry.level) !== null && _b !== void 0 ? _b : 'info';
                const ts = (_c = entry.timestamp) !== null && _c !== void 0 ? _c : '';
                const msg = (_d = entry.message) !== null && _d !== void 0 ? _d : '';
                const meta = entry.metadata && Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : '';
                const formatted = [`[BACKPORT-LIB]`, ts, `[${level}]`, msg, meta].filter(Boolean).join(' ');
                if (level === 'error') {
                    logger.error(formatted);
                }
                else if (level === 'warn') {
                    logger.warning(formatted);
                }
                else {
                    logger.info(formatted);
                }
            }
            catch {
                logger.info(`[BACKPORT-LIB] ${line}`);
            }
        }
    }
    const timer = setInterval(() => {
        if (!stopped)
            flush();
    }, intervalMs);
    return () => {
        stopped = true;
        clearInterval(timer);
        flush();
        if (buffer.trim()) {
            logger.info(`[BACKPORT-LIB] ${buffer}`);
            buffer = '';
        }
    };
}
exports.tailFileToActions = tailFileToActions;
//# sourceMappingURL=util.js.map