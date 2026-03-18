import axios, { AxiosError } from 'axios';
import * as fs from 'fs';

export type JsonObject = Record<string, unknown>;
type RuntimeEnv = Record<string, string | undefined>;
type ReadUtf8File = (path: string) => string;
const defaultReadUtf8File: ReadUtf8File = (path) => fs.readFileSync(path, 'utf8');
const REQUEST_TIMEOUT_MS = 30_000;

export type MintInputs = {
  baseUrl: string;
  masterKey: string;
  models: string[];
  duration: string;
  keyAlias?: string;
  metadata?: JsonObject;
  additionalPayload?: JsonObject;
  runtimeMetadata?: JsonObject;
};

export type MintResult = {
  apiKey: string;
  keyAlias?: string;
  tokenId?: string;
  expiresAt?: string;
};

export type RevokeInputs = {
  baseUrl: string;
  masterKey: string;
  keyAlias?: string;
  tokenId?: string;
  apiKey?: string;
};

export type RevokeResult = {
  revoked: boolean;
  strategy?: string;
  message?: string;
};

type DeleteAttempt = {
  endpoint: '/key/delete' | '/key/block';
  strategy: string;
  payload: JsonObject;
};

export function parseListInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseOptionalJsonObject(value: string, inputName: string): JsonObject | undefined {
  if (!value.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Input "${inputName}" must be valid JSON.`);
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`Input "${inputName}" must be a JSON object.`);
  }

  return parsed;
}

export function getGitHubRuntimeMetadata(
  env: RuntimeEnv,
  readFileSync: ReadUtf8File = defaultReadUtf8File,
): JsonObject {
  const metadata: JsonObject = {};

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

export function buildDefaultKeyAlias(runtimeMetadata: JsonObject): string {
  const parts = [
    'gha',
    getAliasComponent(runtimeMetadata.github_repository),
    getAliasComponent(runtimeMetadata.github_pull_request_number),
    getAliasComponent(runtimeMetadata.github_run_id),
    getAliasComponent(runtimeMetadata.github_run_attempt),
  ].filter((part): part is string => Boolean(part));

  const alias = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return alias.slice(0, 96) || 'gha-litellm-token';
}

export function buildMintRequestBody(inputs: MintInputs): JsonObject {
  const requestBody = { ...(inputs.additionalPayload ?? {}) };
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
    ...(inputs.runtimeMetadata ?? {}),
    ...(inputs.metadata ?? {}),
  };

  if (Object.keys(mergedMetadata).length > 0) {
    requestBody.metadata = mergedMetadata;
  }

  return requestBody;
}

export async function mintLiteLLMToken(inputs: MintInputs): Promise<MintResult> {
  let response;
  try {
    response = await axios.post(
      getEndpointUrl(inputs.baseUrl, '/key/generate'),
      buildMintRequestBody(inputs),
      buildRequestConfig(inputs.masterKey),
    );
  } catch (error) {
    throw wrapAxiosError(error, 'LiteLLM mint failed');
  }

  const data = ensureObject(response.data, 'LiteLLM mint response');
  const apiKey = getRequiredString(data.key, 'LiteLLM mint response key');

  return {
    apiKey,
    keyAlias: getOptionalString(data.key_alias) ?? inputs.keyAlias,
    tokenId: getOptionalString(data.token_id),
    expiresAt: getOptionalString(data.expires),
  };
}

export async function revokeLiteLLMToken(inputs: RevokeInputs): Promise<RevokeResult> {
  const attempts = buildDeleteAttempts(inputs);
  const recoverableErrors: string[] = [];

  if (attempts.length === 0) {
    throw new Error('A revoke operation requires at least one of key-alias, token-id, or api-key.');
  }

  for (const attempt of attempts) {
    try {
      await axios.post(
        getEndpointUrl(inputs.baseUrl, attempt.endpoint),
        attempt.payload,
        buildRequestConfig(inputs.masterKey),
      );

      return {
        revoked: true,
        strategy: attempt.strategy,
      };
    } catch (error) {
      if (!isRecoverableDeleteError(error)) {
        throw wrapAxiosError(error, `LiteLLM revoke failed while attempting ${attempt.strategy}`);
      }

      recoverableErrors.push(`${attempt.strategy}: ${formatAxiosError(error)}`);
    }
  }

  return {
    revoked: false,
    message: recoverableErrors.join(' | '),
  };
}

function buildDeleteAttempts(inputs: RevokeInputs): DeleteAttempt[] {
  const attempts: DeleteAttempt[] = [];

  if (inputs.keyAlias) {
    attempts.push({
      endpoint: '/key/delete',
      strategy: 'delete by key alias',
      payload: { key_aliases: [inputs.keyAlias] },
    });
  }

  if (inputs.tokenId) {
    attempts.push({
      endpoint: '/key/delete',
      strategy: 'delete by token id',
      payload: { keys: [inputs.tokenId] },
    });
  }

  if (inputs.apiKey) {
    attempts.push({
      endpoint: '/key/delete',
      strategy: 'delete by api key',
      payload: { keys: [inputs.apiKey] },
    });
    attempts.push({
      endpoint: '/key/block',
      strategy: 'block by api key',
      payload: { key: inputs.apiKey },
    });
  }

  return attempts;
}

function getPullRequestNumber(env: RuntimeEnv, readFileSync: ReadUtf8File): number | undefined {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }

  try {
    const parsedEvent = JSON.parse(readFileSync(eventPath)) as {
      number?: unknown;
      pull_request?: { number?: unknown };
    };

    const eventNumber = parsedEvent.pull_request?.number ?? parsedEvent.number;
    return typeof eventNumber === 'number' ? eventNumber : undefined;
  } catch (error) {
    return undefined;
  }
}

function assignIfSet(target: JsonObject, key: string, value: string | undefined) {
  if (value && value.trim().length > 0) {
    target[key] = value;
  }
}

function getAliasComponent(value: unknown): string | undefined {
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

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }

  if (typeof value === 'string') {
    return parseListInput(value);
  }

  return [];
}

function getNestedObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function buildHeaders(masterKey: string) {
  return {
    Authorization: `Bearer ${masterKey}`,
    'Content-Type': 'application/json',
  };
}

function buildRequestConfig(masterKey: string) {
  return {
    headers: buildHeaders(masterKey),
    timeout: REQUEST_TIMEOUT_MS,
  };
}

function getEndpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function ensureObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`${label} was not a JSON object.`);
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} was missing or empty.`);
  }

  return value;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecoverableDeleteError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  return status === 400 || status === 404 || status === 422;
}

function formatAxiosError(error: AxiosError): string {
  const status = error.response?.status;
  const data = error.response?.data;
  const responseMessage =
    typeof data === 'string'
      ? data
      : isJsonObject(data) && typeof data.message === 'string'
        ? data.message
        : error.message;

  return status ? `HTTP ${status}: ${responseMessage}` : responseMessage;
}

function wrapAxiosError(error: unknown, prefix: string): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(prefix);
  }

  return new Error(`${prefix}. ${formatAxiosError(error)}`);
}
