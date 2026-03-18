import * as core from '@actions/core';

import { mintLiteLLMToken, revokeLiteLLMToken } from './litellmToken';

export async function run() {
  const operation = core.getInput('operation', { required: true }).trim().toLowerCase();
  const baseUrl = core.getInput('base-url', { required: true });
  const masterKey = core.getInput('master-key', { required: true });
  maskSecret(masterKey);

  if (operation === 'mint') {
    const apiKey = await mintLiteLLMToken({
      baseUrl,
      masterKey,
      keyTTL: core.getInput('key-ttl') || '15m',
      maxBudget: core.getInput('max-budget') || '5',
      models: core.getInput('models', { required: true }),
      metadata: core.getInput('metadata'),
    });

    core.setSecret(apiKey);
    core.setOutput('api_key', apiKey);
    core.info('Minted LiteLLM token.');
    return;
  }

  if (operation === 'revoke') {
    const apiKey = core.getInput('api-key', { required: true });

    maskSecret(apiKey);

    await revokeLiteLLMToken({
      baseUrl,
      masterKey,
      apiKey,
    });

    core.info('Revoked LiteLLM token.');
    return;
  }

  throw new Error(`Unsupported operation "${operation}". Expected "mint" or "revoke".`);
}

function maskSecret(value: string | undefined) {
  if (value) {
    core.setSecret(value);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unexpected error';
}

if (require.main === module) {
  run().catch((error) => {
    core.setFailed(getErrorMessage(error));
  });
}
