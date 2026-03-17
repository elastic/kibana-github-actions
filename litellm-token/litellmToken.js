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
exports.revokeLiteLLMToken = exports.mintLiteLLMToken = exports.buildMintRequestBody = exports.buildDefaultKeyAlias = exports.getGitHubRuntimeMetadata = exports.parseOptionalJsonObject = exports.parseListInput = void 0;
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const defaultReadUtf8File = (path) => fs.readFileSync(path, 'utf8');
function parseListInput(value) {
    return value
        .split(/[\n,]/)
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
function buildDefaultKeyAlias(runtimeMetadata) {
    const parts = [
        'gha',
        getAliasComponent(runtimeMetadata.github_repository),
        getAliasComponent(runtimeMetadata.github_pull_request_number),
        getAliasComponent(runtimeMetadata.github_run_id),
        getAliasComponent(runtimeMetadata.github_run_attempt),
    ].filter((part) => Boolean(part));
    const alias = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return alias.slice(0, 96) || 'gha-litellm-token';
}
exports.buildDefaultKeyAlias = buildDefaultKeyAlias;
function buildMintRequestBody(inputs) {
    var _a, _b, _c;
    const requestBody = { ...((_a = inputs.additionalPayload) !== null && _a !== void 0 ? _a : {}) };
    const payloadModels = getStringArray(requestBody.models);
    const models = inputs.models.length > 0 ? inputs.models : payloadModels;
    if (models.length === 0) {
        throw new Error('A mint operation requires at least one model.');
    }
    requestBody.models = models;
    if (inputs.duration) {
        requestBody.duration = inputs.duration;
    }
    if (inputs.keyAlias) {
        requestBody.key_alias = inputs.keyAlias;
    }
    const mergedMetadata = {
        ...getNestedObject(requestBody.metadata),
        ...((_b = inputs.runtimeMetadata) !== null && _b !== void 0 ? _b : {}),
        ...((_c = inputs.metadata) !== null && _c !== void 0 ? _c : {}),
    };
    if (Object.keys(mergedMetadata).length > 0) {
        requestBody.metadata = mergedMetadata;
    }
    return requestBody;
}
exports.buildMintRequestBody = buildMintRequestBody;
async function mintLiteLLMToken(inputs) {
    var _a, _b, _c;
    const response = await axios_1.default.post(getEndpointUrl(inputs.baseUrl, '/key/generate'), buildMintRequestBody(inputs), {
        headers: buildHeaders(inputs.masterKey),
    });
    const data = ensureObject(response.data, 'LiteLLM mint response');
    const apiKey = getRequiredString(data.key, 'LiteLLM mint response key');
    return {
        apiKey,
        keyAlias: (_a = getOptionalString(data.key_alias)) !== null && _a !== void 0 ? _a : inputs.keyAlias,
        tokenId: (_b = getOptionalString(data.token_id)) !== null && _b !== void 0 ? _b : getOptionalString(data.token),
        expiresAt: (_c = getOptionalString(data.expires_at)) !== null && _c !== void 0 ? _c : getOptionalString(data.expires),
    };
}
exports.mintLiteLLMToken = mintLiteLLMToken;
async function revokeLiteLLMToken(inputs) {
    const attempts = buildDeleteAttempts(inputs);
    const recoverableErrors = [];
    if (attempts.length === 0) {
        throw new Error('A revoke operation requires at least one of key-alias, token-id, or api-key.');
    }
    for (const attempt of attempts) {
        try {
            await axios_1.default.post(getEndpointUrl(inputs.baseUrl, attempt.endpoint), attempt.payload, {
                headers: buildHeaders(inputs.masterKey),
            });
            return {
                revoked: true,
                strategy: attempt.strategy,
            };
        }
        catch (error) {
            if (!isRecoverableDeleteError(error)) {
                throw wrapAxiosError(error, `LiteLLM revoke failed while attempting ${attempt.strategy}`);
            }
            recoverableErrors.push(`${attempt.strategy}: ${formatAxiosError(error)}`);
        }
    }
    return {
        revoked: false,
        message: recoverableErrors[recoverableErrors.length - 1],
    };
}
exports.revokeLiteLLMToken = revokeLiteLLMToken;
function buildDeleteAttempts(inputs) {
    const attempts = [];
    if (inputs.keyAlias) {
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by key alias list',
            payload: { key_aliases: [inputs.keyAlias] },
        });
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by key alias',
            payload: { key_alias: inputs.keyAlias },
        });
    }
    if (inputs.tokenId) {
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by token id',
            payload: { key: inputs.tokenId },
        });
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by token id list',
            payload: { keys: [inputs.tokenId] },
        });
    }
    if (inputs.apiKey) {
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by api key',
            payload: { key: inputs.apiKey },
        });
        attempts.push({
            endpoint: '/key/delete',
            strategy: 'delete by api key list',
            payload: { keys: [inputs.apiKey] },
        });
        attempts.push({
            endpoint: '/key/block',
            strategy: 'block by api key',
            payload: { key: inputs.apiKey },
        });
    }
    return dedupeAttempts(attempts);
}
function dedupeAttempts(attempts) {
    const seen = new Set();
    return attempts.filter((attempt) => {
        const key = `${attempt.endpoint}:${JSON.stringify(attempt.payload)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
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
function getAliasComponent(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const normalized = String(value)
        .trim()
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return normalized || undefined;
}
function getStringArray(value) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
    }
    if (typeof value === 'string') {
        return parseListInput(value);
    }
    return [];
}
function getNestedObject(value) {
    return isJsonObject(value) ? value : {};
}
function buildHeaders(masterKey) {
    return {
        Authorization: `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
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
function getOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
function isRecoverableDeleteError(error) {
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