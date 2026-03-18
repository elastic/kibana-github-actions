import axios, { AxiosError } from 'axios';
import { expect } from 'chai';
import * as fs from 'fs';
import nock from 'nock';

import {
  buildMintRequestBody,
  getGitHubRuntimeMetadata,
  mintLiteLLMToken,
  parseListInput,
  parseOptionalJsonObject,
  revokeLiteLLMToken,
} from './litellmToken';

const axiosWithMutablePost = axios as typeof axios & { post: typeof axios.post };
const originalAxiosPost = axios.post;
const eventPath = '/tmp/litellm-token-event.json';

describe('litellmToken', () => {
  afterEach(() => {
    axiosWithMutablePost.post = originalAxiosPost;
    nock.cleanAll();
  });

  describe('parseListInput', () => {
    it('splits comma delimited values', () => {
      expect(parseListInput('model-one, model-two, model-three')).to.eql([
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
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT,
        GITHUB_ACTOR: process.env.GITHUB_ACTOR,
        GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
        GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };

      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_WORKFLOW = 'reviewer:claude';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_RUN_ATTEMPT = '2';
        process.env.GITHUB_ACTOR = 'reviewer-bot';
        process.env.GITHUB_EVENT_NAME = 'pull_request_target';
        process.env.GITHUB_EVENT_PATH = eventPath;
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 42 } }));

        const metadata = getGitHubRuntimeMetadata();

        expect(metadata).to.eql({
          github_repository: 'elastic/kibana',
          github_workflow: 'reviewer:claude',
          github_run_id: '12345',
          github_run_attempt: '2',
          github_actor: 'reviewer-bot',
          github_event_name: 'pull_request_target',
          github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
          github_pull_request_number: 42,
        });
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_WORKFLOW', originalEnv.GITHUB_WORKFLOW);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_RUN_ATTEMPT', originalEnv.GITHUB_RUN_ATTEMPT);
        restoreEnvVar('GITHUB_ACTOR', originalEnv.GITHUB_ACTOR);
        restoreEnvVar('GITHUB_EVENT_NAME', originalEnv.GITHUB_EVENT_NAME);
        restoreEnvVar('GITHUB_EVENT_PATH', originalEnv.GITHUB_EVENT_PATH);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
        fs.rmSync(eventPath, { force: true });
      }
    });
  });

  describe('buildMintRequestBody', () => {
    it('merges runtime and explicit metadata into the mint payload', () => {
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };
      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_SERVER_URL = 'https://github.com';

        expect(
          buildMintRequestBody({
            baseUrl: 'https://litellm.example.com',
            masterKey: 'sk-master',
            models: 'llm-gateway/claude-opus-4-5',
            keyTTL: '30m',
            maxBudget: '2.5',
            metadata: '{"purpose":"claude-review"}',
          }),
        ).to.eql({
          models: ['llm-gateway/claude-opus-4-5'],
          duration: '30m',
          max_budget: 2.5,
          metadata: {
            github_repository: 'elastic/kibana',
            github_run_id: '12345',
            github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
            purpose: 'claude-review',
          },
        });
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
      }
    });
  });

  describe('mintLiteLLMToken', () => {
    it('posts a mint request and returns the generated key details', async () => {
      const baseUrl = 'https://litellm.example.com';
      let requestBody: unknown;
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };
      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_SERVER_URL = 'https://github.com';

        nock(baseUrl)
          .post('/key/generate', (body) => {
            requestBody = body;
            return true;
          })
          .matchHeader('authorization', 'Bearer sk-master')
          .reply(200, {
            key: 'sk-short-lived',
          });

        const apiKey = await mintLiteLLMToken({
          baseUrl,
          masterKey: 'sk-master',
          models: 'llm-gateway/claude-opus-4-5',
          keyTTL: '30m',
          maxBudget: '2.5',
          metadata: '{"purpose":"claude-review"}',
        });

        expect(requestBody).to.eql({
          models: ['llm-gateway/claude-opus-4-5'],
          duration: '30m',
          max_budget: 2.5,
          metadata: {
            github_repository: 'elastic/kibana',
            github_run_id: '12345',
            github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
            purpose: 'claude-review',
          },
        });
        expect(apiKey).to.equal('sk-short-lived');
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
      }
    });

    it('wraps mint transport failures without exposing the master key and sets a timeout', async () => {
      let requestConfig: unknown;

      axiosWithMutablePost.post = async (_url, _body, config) => {
        requestConfig = config;

        throw new AxiosError(
          'Request failed',
          'ERR_BAD_REQUEST',
          {
            headers: { Authorization: 'Bearer sk-master' },
            timeout: 30_000,
          } as any,
          undefined,
          {
            status: 403,
            data: { message: 'denied' },
            statusText: 'Forbidden',
            headers: {},
            config: {} as any,
          } as any,
        );
      };

      try {
        await mintLiteLLMToken({
          baseUrl: 'https://litellm.example.com',
          masterKey: 'sk-master',
          models: 'llm-gateway/claude-opus-4-5',
          keyTTL: '30m',
          maxBudget: '5',
        });
        expect.fail('Expected mintLiteLLMToken to throw.');
      } catch (error) {
        expect((error as Error).message).to.equal('LiteLLM mint failed. HTTP 403: denied');
        expect((error as Error).message).not.to.contain('sk-master');
      }

      expect(requestConfig).to.include({ timeout: 30_000 });
    });

    it('throws when max-budget is not a valid number', () => {
      expect(() =>
        buildMintRequestBody({
          baseUrl: 'https://litellm.example.com',
          masterKey: 'sk-master',
          models: 'llm-gateway/claude-opus-4-5',
          keyTTL: '30m',
          maxBudget: 'not-a-number',
        }),
      ).to.throw('Input "max-budget" must be a valid number.');
    });
  });

  describe('revokeLiteLLMToken', () => {
    it('deletes the api key when delete succeeds', async () => {
      const baseUrl = 'https://litellm.example.com';

      nock(baseUrl)
        .post('/key/delete', { keys: ['sk-short-lived'] })
        .reply(200, { deleted: true });

      await revokeLiteLLMToken({
        baseUrl,
        masterKey: 'sk-master',
        apiKey: 'sk-short-lived',
      });
    });

    it('blocks the api key when delete fails recoverably', async () => {
      const baseUrl = 'https://litellm.example.com';

      nock(baseUrl)
        .post('/key/delete', { keys: ['sk-short-lived'] })
        .reply(404, { message: 'key not found' })
        .post('/key/block', { key: 'sk-short-lived' })
        .reply(200, { blocked: true });

      await revokeLiteLLMToken({
        baseUrl,
        masterKey: 'sk-master',
        apiKey: 'sk-short-lived',
      });
    });

    it('throws combined diagnostics when delete and block both fail recoverably', async () => {
      const baseUrl = 'https://litellm.example.com';

      nock(baseUrl)
        .post('/key/delete', { keys: ['sk-short-lived'] })
        .reply(404, { message: 'api key not found' })
        .post('/key/block', { key: 'sk-short-lived' })
        .reply(400, { message: 'already blocked' });

      try {
        await revokeLiteLLMToken({
          baseUrl,
          masterKey: 'sk-master',
          apiKey: 'sk-short-lived',
        });
        expect.fail('Expected revokeLiteLLMToken to throw.');
      } catch (error) {
        expect((error as Error).message).to.equal(
          'LiteLLM token cleanup did not confirm revocation: delete by api key: HTTP 404: api key not found | block by api key: HTTP 400: already blocked',
        );
      }
    });

    it('sets a timeout on revoke requests', async () => {
      const requestConfigs: unknown[] = [];

      axiosWithMutablePost.post = async (_url, _body, config) => {
        requestConfigs.push(config);
        return { data: { deleted: true } } as any;
      };

      await revokeLiteLLMToken({
        baseUrl: 'https://litellm.example.com',
        masterKey: 'sk-master',
        apiKey: 'sk-short-lived',
      });

      expect(requestConfigs).to.have.length(1);
      expect(requestConfigs[0]).to.include({ timeout: 30_000 });
    });
  });
});

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
