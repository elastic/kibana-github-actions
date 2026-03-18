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
exports.revokeLiteLLMToken = exports.mintLiteLLMToken = exports.buildMintRequestBody = exports.getGitHubRuntimeMetadata = void 0;
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const schema_1 = require("./schema");
const REQUEST_TIMEOUT_MS = 30000;
function getGitHubRuntimeMetadata() {
    const metadata = {};
    assignIfSet(metadata, 'github_repository', process.env.GITHUB_REPOSITORY);
    assignIfSet(metadata, 'github_workflow', process.env.GITHUB_WORKFLOW);
    assignIfSet(metadata, 'github_run_id', process.env.GITHUB_RUN_ID);
    assignIfSet(metadata, 'github_run_attempt', process.env.GITHUB_RUN_ATTEMPT);
    assignIfSet(metadata, 'github_actor', process.env.GITHUB_ACTOR);
    assignIfSet(metadata, 'github_event_name', process.env.GITHUB_EVENT_NAME);
    assignIfSet(metadata, 'github_workflow_run_url', getGitHubWorkflowRunUrl());
    const pullRequestNumber = getPullRequestNumber();
    if (pullRequestNumber !== undefined) {
        metadata.github_pull_request_number = pullRequestNumber;
    }
    return metadata;
}
exports.getGitHubRuntimeMetadata = getGitHubRuntimeMetadata;
function buildMintRequestBody(inputs) {
    var _a;
    const requestBody = {
        models: inputs.models,
        duration: inputs.keyTTL,
        max_budget: inputs.maxBudget,
    };
    const mergedMetadata = {
        ...getGitHubRuntimeMetadata(),
        ...((_a = inputs.metadata) !== null && _a !== void 0 ? _a : {}),
    };
    if (Object.keys(mergedMetadata).length > 0) {
        requestBody.metadata = mergedMetadata;
    }
    return requestBody;
}
exports.buildMintRequestBody = buildMintRequestBody;
async function mintLiteLLMToken(inputs) {
    var _a, _b, _c;
    let response;
    try {
        response = await axios_1.default.post(`${inputs.baseUrl}/key/generate`, buildMintRequestBody(inputs), buildRequestConfig(inputs.masterKey));
    }
    catch (error) {
        throw wrapAxiosError(error, 'LiteLLM mint failed');
    }
    const parsedResponse = schema_1.mintResponseSchema.safeParse(response.data);
    if (!parsedResponse.success) {
        throw new Error(((_a = parsedResponse.error.issues[0]) === null || _a === void 0 ? void 0 : _a.path[0]) === 'key'
            ? (_c = (_b = parsedResponse.error.issues[0]) === null || _b === void 0 ? void 0 : _b.message) !== null && _c !== void 0 ? _c : 'LiteLLM mint response key was missing or empty.'
            : 'LiteLLM mint response was not a JSON object.');
    }
    return parsedResponse.data.key;
}
exports.mintLiteLLMToken = mintLiteLLMToken;
async function revokeLiteLLMToken(inputs) {
    try {
        await axios_1.default.post(`${inputs.baseUrl}/key/delete`, { keys: [inputs.apiKey] }, buildRequestConfig(inputs.masterKey));
        return;
    }
    catch (deleteError) {
        if (!isRecoverableRevokeError(deleteError)) {
            throw wrapAxiosError(deleteError, 'LiteLLM revoke failed while deleting api key');
        }
        const deleteMessage = `delete by api key: ${formatAxiosError(deleteError)}`;
        try {
            await axios_1.default.post(`${inputs.baseUrl}/key/block`, { key: inputs.apiKey }, buildRequestConfig(inputs.masterKey));
            return;
        }
        catch (blockError) {
            if (!isRecoverableRevokeError(blockError)) {
                throw wrapAxiosError(blockError, 'LiteLLM revoke failed while blocking api key');
            }
            throw new Error(`LiteLLM token cleanup did not confirm revocation: ${deleteMessage} | block by api key: ${formatAxiosError(blockError)}`);
        }
    }
}
exports.revokeLiteLLMToken = revokeLiteLLMToken;
function getPullRequestNumber() {
    var _a, _b;
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
        return undefined;
    }
    try {
        const parsedEvent = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
        const eventNumber = (_b = (_a = parsedEvent.pull_request) === null || _a === void 0 ? void 0 : _a.number) !== null && _b !== void 0 ? _b : parsedEvent.number;
        return typeof eventNumber === 'number' ? eventNumber : undefined;
    }
    catch (error) {
        return undefined;
    }
}
function getGitHubWorkflowRunUrl() {
    const serverUrl = process.env.GITHUB_SERVER_URL;
    const repository = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (!serverUrl || !repository || !runId) {
        return undefined;
    }
    return `${serverUrl.replace(/\/+$/, '')}/${repository}/actions/runs/${runId}`;
}
function assignIfSet(target, key, value) {
    if (value && value.trim().length > 0) {
        target[key] = value;
    }
}
function buildRequestConfig(masterKey) {
    return {
        headers: {
            Authorization: `Bearer ${masterKey}`,
            'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
    };
}
function isRecoverableRevokeError(error) {
    var _a;
    if (!axios_1.default.isAxiosError(error)) {
        return false;
    }
    const status = (_a = error.response) === null || _a === void 0 ? void 0 : _a.status;
    return status === 400 || status === 404 || status === 422;
}
function formatAxiosError(error) {
    var _a, _b;
    const status = (_a = error.response) === null || _a === void 0 ? void 0 : _a.status;
    const data = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data;
    const parsedData = schema_1.errorResponseSchema.safeParse(data);
    const responseMessage = typeof data === 'string' ? data : parsedData.success ? parsedData.data.message : error.message;
    return status ? `HTTP ${status}: ${responseMessage}` : responseMessage;
}
function wrapAxiosError(error, prefix) {
    if (!axios_1.default.isAxiosError(error)) {
        return error instanceof Error ? error : new Error(prefix);
    }
    return new Error(`${prefix}. ${formatAxiosError(error)}`);
}
//# sourceMappingURL=litellmToken.js.map