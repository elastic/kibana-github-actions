import { expect } from 'chai';
import nock from 'nock';

import {
  buildDefaultKeyAlias,
  buildMintRequestBody,
  getGitHubRuntimeMetadata,
  mintLiteLLMToken,
  parseListInput,
  parseOptionalJsonObject,
  revokeLiteLLMToken,
} from './litellmToken';

describe('litellmToken', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('parseListInput', () => {
    it('splits comma and newline delimited values', () => {
      expect(parseListInput('model-one, model-two\nmodel-three')).to.eql([
        'model-one',
        'model-two',
        'model-three',
      ]);
    });
  });

  describe('parseOptionalJsonObject', () => {
    it('returns undefined for blank input', () => {
      expect(parseOptionalJsonObject('   ', 'metadata')).to.equal(undefined);
    });

    it('throws for non-object JSON', () => {
      expect(() => parseOptionalJsonObject('["bad"]', 'metadata')).to.throw(
        'Input "metadata" must be a JSON object.',
      );
    });
  });

  describe('getGitHubRuntimeMetadata', () => {
    it('reads workflow metadata and pull request number from the event payload', () => {
      const metadata = getGitHubRuntimeMetadata(
        {
          GITHUB_REPOSITORY: 'elastic/kibana',
          GITHUB_WORKFLOW: 'reviewer:claude',
          GITHUB_RUN_ID: '12345',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_ACTOR: 'reviewer-bot',
          GITHUB_EVENT_NAME: 'pull_request_target',
          GITHUB_EVENT_PATH: '/tmp/event.json',
        },
        () => JSON.stringify({ pull_request: { number: 42 } }),
      );

      expect(metadata).to.eql({
        github_repository: 'elastic/kibana',
        github_workflow: 'reviewer:claude',
        github_run_id: '12345',
        github_run_attempt: '2',
        github_actor: 'reviewer-bot',
        github_event_name: 'pull_request_target',
        github_pull_request_number: 42,
      });
    });
  });

  describe('buildDefaultKeyAlias', () => {
    it('builds a stable workflow-specific alias', () => {
      expect(
        buildDefaultKeyAlias({
          github_repository: 'elastic/kibana',
          github_pull_request_number: 42,
          github_run_id: '12345',
          github_run_attempt: '2',
        }),
      ).to.equal('gha-elastic-kibana-42-12345-2');
    });
  });

  describe('buildMintRequestBody', () => {
    it('merges metadata from the payload, runtime, and explicit metadata', () => {
      expect(
        buildMintRequestBody({
          baseUrl: 'https://litellm.example.com',
          masterKey: 'sk-master',
          models: ['llm-gateway/claude-opus-4-5'],
          duration: '30m',
          keyAlias: 'gha-elastic-kibana-12345',
          additionalPayload: {
            metadata: { existing: 'value' },
            max_budget: 5,
          },
          runtimeMetadata: { github_repository: 'elastic/kibana' },
          metadata: { purpose: 'claude-review' },
        }),
      ).to.eql({
        models: ['llm-gateway/claude-opus-4-5'],
        duration: '30m',
        key_alias: 'gha-elastic-kibana-12345',
        max_budget: 5,
        metadata: {
          existing: 'value',
          github_repository: 'elastic/kibana',
          purpose: 'claude-review',
        },
      });
    });
  });

  describe('mintLiteLLMToken', () => {
    it('posts a mint request and returns the generated key details', async () => {
      const baseUrl = 'https://litellm.example.com';
      let requestBody: unknown;

      nock(baseUrl)
        .post('/key/generate', (body) => {
          requestBody = body;
          return true;
        })
        .matchHeader('authorization', 'Bearer sk-master')
        .reply(200, {
          key: 'sk-short-lived',
          key_alias: 'gha-elastic-kibana-12345',
          token_id: 'token-hash-123',
          expires: '2026-03-17T12:30:00Z',
        });

      const result = await mintLiteLLMToken({
        baseUrl,
        masterKey: 'sk-master',
        models: ['llm-gateway/claude-opus-4-5'],
        duration: '30m',
        keyAlias: 'gha-elastic-kibana-12345',
        metadata: { purpose: 'claude-review' },
        runtimeMetadata: { github_repository: 'elastic/kibana' },
      });

      expect(requestBody).to.eql({
        models: ['llm-gateway/claude-opus-4-5'],
        duration: '30m',
        key_alias: 'gha-elastic-kibana-12345',
        metadata: {
          github_repository: 'elastic/kibana',
          purpose: 'claude-review',
        },
      });
      expect(result).to.eql({
        apiKey: 'sk-short-lived',
        keyAlias: 'gha-elastic-kibana-12345',
        tokenId: 'token-hash-123',
        expiresAt: '2026-03-17T12:30:00Z',
      });
    });
  });

  describe('revokeLiteLLMToken', () => {
    it('falls back from alias deletion to token id deletion', async () => {
      const baseUrl = 'https://litellm.example.com';

      nock(baseUrl)
        .post('/key/delete', { key_aliases: ['gha-elastic-kibana-12345'] })
        .reply(400, { message: 'unsupported field shape' })
        .post('/key/delete', { key_alias: 'gha-elastic-kibana-12345' })
        .reply(404, { message: 'key alias not found' })
        .post('/key/delete', { key: 'token-hash-123' })
        .reply(200, { deleted: true });

      const result = await revokeLiteLLMToken({
        baseUrl,
        masterKey: 'sk-master',
        keyAlias: 'gha-elastic-kibana-12345',
        tokenId: 'token-hash-123',
      });

      expect(result).to.eql({
        revoked: true,
        strategy: 'delete by token id',
      });
    });

    it('falls back to blocking by api key when delete attempts fail recoverably', async () => {
      const baseUrl = 'https://litellm.example.com';

      nock(baseUrl)
        .post('/key/delete', { key: 'sk-short-lived' })
        .reply(404, { message: 'key not found' })
        .post('/key/delete', { keys: ['sk-short-lived'] })
        .reply(400, { message: 'unsupported field shape' })
        .post('/key/block', { key: 'sk-short-lived' })
        .reply(200, { blocked: true });

      const result = await revokeLiteLLMToken({
        baseUrl,
        masterKey: 'sk-master',
        apiKey: 'sk-short-lived',
      });

      expect(result).to.eql({
        revoked: true,
        strategy: 'block by api key',
      });
    });
  });
});
