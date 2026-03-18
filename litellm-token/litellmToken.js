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
exports.revokeLiteLLMToken = exports.mintLiteLLMToken = exports.buildMintRequestBody = exports.getGitHubRuntimeMetadata = exports.parseOptionalJsonObject = exports.parseListInput = void 0;
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const defaultReadUtf8File = (path) => fs.readFileSync(path, 'utf8');
const REQUEST_TIMEOUT_MS = 30000;
function parseListInput(value) {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
exports.parseListInput = parseListInput;
function parseOptionalJsonObject(value, inputName) {
    if (!value.trim()) {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch (error) {
        throw new Error(`Input "${inputName}" must be valid JSON.`);
    }
    if (!isJsonObject(parsed)) {
        throw new Error(`Input "${inputName}" must be a JSON object.`);
    }
    return parsed;
}
exports.parseOptionalJsonObject = parseOptionalJsonObject;
function getGitHubRuntimeMetadata(env, readFileSync = defaultReadUtf8File) {
    const metadata = {};
    assignIfSet(metadata, 'github_repository', env.GITHUB_REPOSITORY);
    assignIfSet(metadata, 'github_workflow', env.GITHUB_WORKFLOW);
    assignIfSet(metadata, 'github_run_id', env.GITHUB_RUN_ID);
    assignIfSet(metadata, 'github_run_attempt', env.GITHUB_RUN_ATTEMPT);
    assignIfSet(metadata, 'github_actor', env.GITHUB_ACTOR);
    assignIfSet(metadata, 'github_event_name', env.GITHUB_EVENT_NAME);
    const pullRequestNumber = getPullRequestNumber(env, readFileSync);
    if (pullRequestNumber !== undefined) {
        metadata.github_pull_request_number = pullRequestNumber;
    }
    return metadata;
}
exports.getGitHubRuntimeMetadata = getGitHubRuntimeMetadata;
function buildMintRequestBody(inputs) {
    var _a;
    const models = parseListInput(inputs.models);
    if (models.length === 0) {
        throw new Error('A mint operation requires at least one model.');
    }
    const maxBudget = parseNumberInput(inputs.maxBudget, 'max-budget');
    const requestBody = {
        models,
        duration: inputs.keyTTL,
        max_budget: maxBudget,
    };
    const metadata = parseOptionalJsonObject((_a = inputs.metadata) !== null && _a !== void 0 ? _a : '', 'metadata');
    const mergedMetadata = {
        ...getGitHubRuntimeMetadata(process.env),
        ...(metadata !== null && metadata !== void 0 ? metadata : {}),
    };
    if (Object.keys(mergedMetadata).length > 0) {
        requestBody.metadata = mergedMetadata;
    }
    return requestBody;
}
exports.buildMintRequestBody = buildMintRequestBody;
async function mintLiteLLMToken(inputs) {
    let response;
    try {
        response = await axios_1.default.post(getEndpointUrl(inputs.baseUrl, '/key/generate'), buildMintRequestBody(inputs), buildRequestConfig(inputs.masterKey));
    }
    catch (error) {
        throw wrapAxiosError(error, 'LiteLLM mint failed');
    }
    const data = ensureObject(response.data, 'LiteLLM mint response');
    return getRequiredString(data.key, 'LiteLLM mint response key');
}
exports.mintLiteLLMToken = mintLiteLLMToken;
async function revokeLiteLLMToken(inputs) {
    try {
        await axios_1.default.post(getEndpointUrl(inputs.baseUrl, '/key/delete'), { keys: [inputs.apiKey] }, buildRequestConfig(inputs.masterKey));
        return;
    }
    catch (deleteError) {
        if (!isRecoverableRevokeError(deleteError)) {
            throw wrapAxiosError(deleteError, 'LiteLLM revoke failed while deleting api key');
        }
        const deleteMessage = `delete by api key: ${formatAxiosError(deleteError)}`;
        try {
            await axios_1.default.post(getEndpointUrl(inputs.baseUrl, '/key/block'), { key: inputs.apiKey }, buildRequestConfig(inputs.masterKey));
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
function getPullRequestNumber(env, readFileSync) {
    var _a, _b;
    const eventPath = env.GITHUB_EVENT_PATH;
    if (!eventPath) {
        return undefined;
    }
    try {
        const parsedEvent = JSON.parse(readFileSync(eventPath));
        const eventNumber = (_b = (_a = parsedEvent.pull_request) === null || _a === void 0 ? void 0 : _a.number) !== null && _b !== void 0 ? _b : parsedEvent.number;
        return typeof eventNumber === 'number' ? eventNumber : undefined;
    }
    catch (error) {
        return undefined;
    }
}
function assignIfSet(target, key, value) {
    if (value && value.trim().length > 0) {
        target[key] = value;
    }
}
function buildHeaders(masterKey) {
    return {
        Authorization: `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
    };
}
function buildRequestConfig(masterKey) {
    return {
        headers: buildHeaders(masterKey),
        timeout: REQUEST_TIMEOUT_MS,
    };
}
function getEndpointUrl(baseUrl, path) {
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
}
function ensureObject(value, label) {
    if (!isJsonObject(value)) {
        throw new Error(`${label} was not a JSON object.`);
    }
    return value;
}
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function getRequiredString(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} was missing or empty.`);
    }
    return value;
}
function parseNumberInput(value, inputName) {
    const parsedValue = Number.parseFloat(value);
    if (!Number.isFinite(parsedValue)) {
        throw new Error(`Input "${inputName}" must be a valid number.`);
    }
    return parsedValue;
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
    const responseMessage = typeof data === 'string'
        ? data
        : isJsonObject(data) && typeof data.message === 'string'
            ? data.message
            : error.message;
    return status ? `HTTP ${status}: ${responseMessage}` : responseMessage;
}
function wrapAxiosError(error, prefix) {
    if (!axios_1.default.isAxiosError(error)) {
        return error instanceof Error ? error : new Error(prefix);
    }
    return new Error(`${prefix}. ${formatAxiosError(error)}`);
}
//# sourceMappingURL=litellmToken.js.map