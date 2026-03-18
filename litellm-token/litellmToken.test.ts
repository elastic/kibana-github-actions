import axios, { AxiosError } from 'axios';
import { expect } from 'chai';
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

  describe('buildMintRequestBody', () => {
    it('merges runtime and explicit metadata into the mint payload', () => {
      const originalRepository = process.env.GITHUB_REPOSITORY;
      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';

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
            purpose: 'claude-review',
          },
        });
      } finally {
        if (originalRepository === undefined) {
          delete process.env.GITHUB_REPOSITORY;
        } else {
          process.env.GITHUB_REPOSITORY = originalRepository;
        }
      }
    });
  });

  describe('mintLiteLLMToken', () => {
    it('posts a mint request and returns the generated key details', async () => {
      const baseUrl = 'https://litellm.example.com';
      let requestBody: unknown;
      const originalRepository = process.env.GITHUB_REPOSITORY;
      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';

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
            purpose: 'claude-review',
          },
        });
        expect(apiKey).to.equal('sk-short-lived');
      } finally {
        if (originalRepository === undefined) {
          delete process.env.GITHUB_REPOSITORY;
        } else {
          process.env.GITHUB_REPOSITORY = originalRepository;
        }
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
