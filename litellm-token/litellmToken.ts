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
  models: string;
  keyTTL: string;
  maxBudget: string;
  metadata?: string;
};

export type RevokeInputs = {
  baseUrl: string;
  masterKey: string;
  apiKey: string;
};

export function parseListInput(value: string): string[] {
  return value
    .split(',')
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

export function buildMintRequestBody(inputs: MintInputs): JsonObject {
  const models = parseListInput(inputs.models);
  if (models.length === 0) {
    throw new Error('A mint operation requires at least one model.');
  }
  const maxBudget = parseNumberInput(inputs.maxBudget, 'max-budget');

  const requestBody: JsonObject = {
    models,
    duration: inputs.keyTTL,
    max_budget: maxBudget,
  };

  const metadata = parseOptionalJsonObject(inputs.metadata ?? '', 'metadata');
  const mergedMetadata = {
    ...getGitHubRuntimeMetadata(process.env),
    ...(metadata ?? {}),
  };

  if (Object.keys(mergedMetadata).length > 0) {
    requestBody.metadata = mergedMetadata;
  }

  return requestBody;
}

export async function mintLiteLLMToken(inputs: MintInputs): Promise<string> {
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
  return getRequiredString(data.key, 'LiteLLM mint response key');
}

export async function revokeLiteLLMToken(inputs: RevokeInputs): Promise<void> {
  try {
    await axios.post(
      getEndpointUrl(inputs.baseUrl, '/key/delete'),
      { keys: [inputs.apiKey] },
      buildRequestConfig(inputs.masterKey),
    );
    return;
  } catch (deleteError) {
    if (!isRecoverableRevokeError(deleteError)) {
      throw wrapAxiosError(deleteError, 'LiteLLM revoke failed while deleting api key');
    }

    const deleteMessage = `delete by api key: ${formatAxiosError(deleteError)}`;

    try {
      await axios.post(
        getEndpointUrl(inputs.baseUrl, '/key/block'),
        { key: inputs.apiKey },
        buildRequestConfig(inputs.masterKey),
      );
      return;
    } catch (blockError) {
      if (!isRecoverableRevokeError(blockError)) {
        throw wrapAxiosError(blockError, 'LiteLLM revoke failed while blocking api key');
      }

      throw new Error(
        `LiteLLM token cleanup did not confirm revocation: ${deleteMessage} | block by api key: ${formatAxiosError(
          blockError,
        )}`,
      );
    }
  }
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

function parseNumberInput(value: string, inputName: string): number {
  const parsedValue = Number.parseFloat(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Input "${inputName}" must be a valid number.`);
  }

  return parsedValue;
}

function isRecoverableRevokeError(error: unknown): boolean {
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
