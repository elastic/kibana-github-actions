import * as core from '@actions/core';

import {
  buildDefaultKeyAlias,
  getGitHubRuntimeMetadata,
  mintLiteLLMToken,
  parseListInput,
  parseOptionalJsonObject,
  revokeLiteLLMToken,
} from './litellmToken';

async function run() {
  const operation = core.getInput('operation', { required: true }).trim().toLowerCase();
  const baseUrl = core.getInput('base-url', { required: true });
  const masterKey = core.getInput('master-key', { required: true });

  if (operation === 'mint') {
    const runtimeMetadata = getGitHubRuntimeMetadata(process.env);
    const explicitKeyAlias = core.getInput('key-alias');
    const token = await mintLiteLLMToken({
      baseUrl,
      masterKey,
      duration: core.getInput('duration') || '15m',
      models: parseListInput(core.getInput('models')),
      keyAlias: explicitKeyAlias || buildDefaultKeyAlias(runtimeMetadata),
      metadata: parseOptionalJsonObject(core.getInput('metadata'), 'metadata'),
      additionalPayload: parseOptionalJsonObject(core.getInput('additional-payload'), 'additional-payload'),
      runtimeMetadata,
    });

    core.setSecret(token.apiKey);
    core.setOutput('api_key', token.apiKey);

    if (token.tokenId) {
      core.setSecret(token.tokenId);
      core.setOutput('token_id', token.tokenId);
    }

    if (token.keyAlias) {
      core.setOutput('key_alias', token.keyAlias);
    }

    if (token.expiresAt) {
      core.setOutput('expires_at', token.expiresAt);
    }

    core.info(`Minted LiteLLM token${token.keyAlias ? ` for alias ${token.keyAlias}` : ''}.`);
    return;
  }

  if (operation === 'revoke') {
    const result = await revokeLiteLLMToken({
      baseUrl,
      masterKey,
      keyAlias: core.getInput('key-alias') || undefined,
      tokenId: core.getInput('token-id') || undefined,
      apiKey: core.getInput('api-key') || undefined,
    });

    if (result.revoked) {
      core.info(`Revoked LiteLLM token${result.strategy ? ` using ${result.strategy}` : ''}.`);
      return;
    }

    core.warning(
      `LiteLLM token cleanup did not confirm revocation${result.message ? `: ${result.message}` : '.'}`,
    );
    return;
  }

  throw new Error(`Unsupported operation "${operation}". Expected "mint" or "revoke".`);
}

run().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
