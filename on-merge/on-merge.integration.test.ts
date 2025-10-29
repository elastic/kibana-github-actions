/**
 * Jest-based integration tests for the on-merge GitHub Action
 */

import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '_fixtures_');

// Create mock Octokit instance that we'll use across tests
const mockOctokit = {
  rest: {
    repos: {
      getContent: jest.fn(),
    },
    issues: {
      addLabels: jest.fn(() => Promise.resolve({ data: {} })),
      removeLabel: jest.fn(() => Promise.resolve({ data: {} })),
      createComment: jest.fn(() => Promise.resolve({ data: {} })),
    },
    pulls: {
      update: jest.fn(() => Promise.resolve({ data: {} })),
    },
  },
};

// Create a mutable context object that we can modify per test
const mockContext = {
  repo: { owner: 'elastic', repo: 'kibana' },
  payload: {
    pull_request: {
      number: 12345,
      labels: [{ name: 'v8.4.0' }],
      base: { ref: 'main' },
      user: { login: 'test-user' },
      body: 'Default PR body',
    },
  },
};

// Mock all dependencies at the top level with factory functions
jest.mock('@actions/github', () => ({
  context: mockContext,
  getOctokit: jest.fn(() => mockOctokit),
}));

jest.mock('@actions/core', () => ({
  getInput: jest.fn(() => 'test-token'),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  info: jest.fn((...argz) => {
    console.log(...argz);
  }),
  warning: jest.fn((...argz) => {
    console.warn(...argz);
  }),
  error: jest.fn((...argz) => {
    console.error(...argz);
  }),
  isDebug: jest.fn(() => false),
}));

const mockBackportRun = jest.fn();
jest.mock('backport', () => ({
  backportRun: mockBackportRun,
}));

const defaultContext = {
  repo: { owner: 'elastic', repo: 'kibana' },
  payload: {
    pull_request: {
      number: 12345,
      labels: [{ name: 'v8.4.0' }],
      base: { ref: 'main' },
      user: { login: 'test-user' },
      body: 'Default PR body',
    },
  },
  eventName: 'pull_request',
  sha: undefined,
  ref: undefined,
  workflow: 'on-merge.yml',
  action: 'on-merge',
  actor: 'test-user',
  job: 'on-merge',
  runNumber: NaN,
  runId: 123456789,
  apiUrl: 'https://api.github.com',
  serverUrl: 'https://github.com',
  graphqlUrl: 'https://api.github.com/graphql',
};

const serveFixture = (fixtureName: string) => {
  const content = fs.readFileSync(path.join(fixturesDir, fixtureName), 'utf8');
  return Promise.resolve({
    data: {
      content: Buffer.from(content).toString('base64'),
    },
  });
};

describe('On-Merge Action', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // NOTE: Don't reset modules here - it breaks the mocks

    // Serve mock responses for versions.json and backportrc.json
    mockOctokit.rest.repos.getContent.mockImplementation((request) => {
      return (
        {
          'versions.json': serveFixture('versions.json'),
          '.backportrc.json': serveFixture('.backportrc.json'),
        } as any
      )[request.path];
    });

    mockBackportRun.mockResolvedValue({ status: 'success' } as any);

    // Reset context to default state - now this should work since mockContext is a regular object
    Object.assign(mockContext, JSON.parse(JSON.stringify(defaultContext)));

    // Set a quick debounce timeout for tests
    process.env.BACKPORT_DEBOUNCE_TIMEOUT = '100';
  });

  it('should throw an error if the payload is not a pull request', async () => {
    mockContext.payload.pull_request = null!;

    const { main: runOnMergeAction } = require('./index');

    await expect(runOnMergeAction()).rejects.toThrow('Only pull_request events are supported.');
  });

  it('should throw an error if versions.json is missing development and main branches', async () => {
    mockOctokit.rest.repos.getContent.mockRejectedValueOnce(new Error('Not Found'));

    const { main: runOnMergeAction } = require('./index');

    await expect(runOnMergeAction()).rejects.toThrow(/Not Found/);
  });

  describe('Main branch PRs', () => {
    beforeEach(() => {
      // Set base.ref to 'main' for main branch tests
      mockContext.payload.pull_request.base.ref = 'main';
    });

    it('should adjust labels when PR has only current version label and backport:version', async () => {
      // Setup: PR with current version label (v9.2.0) and backport:version
      mockContext.payload.pull_request.labels = [{ name: 'backport:version' }, { name: 'v9.2.0' }];

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should remove backport:version and add backport:skip
      expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        name: 'backport:version',
      });

      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        labels: ['backport:skip'],
      });
    });

    it('should add current version label if missing', async () => {
      // Setup: PR without current version label
      mockContext.payload.pull_request.labels = [{ name: 'backport:version' }, { name: 'v9.1.4' }];

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should add current version label
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        labels: ['v9.2.0'],
      });
    });

    it('should skip backport when backport:skip label is present', async () => {
      // Setup: PR with backport:skip label
      mockContext.payload.pull_request.labels = [{ name: 'v9.2.0' }, { name: 'backport:skip' }];

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: backportRun should not be called
      expect(mockBackportRun).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it('does not remove backport:version when more version labels are present', async () => {
      // Setup: PR with backport:version and multiple version labels
      mockContext.payload.pull_request.labels = [
        { name: 'backport:version' },
        { name: 'v9.2.0' },
        { name: 'v9.1.4' },
      ];

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should NOT remove backport:version label, there are valid backport targets
      expect(mockOctokit.rest.issues.removeLabel).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'backport:version' }),
      );
    });

    // TODO: review this behavior - what should we do when backport:version is set but no targets set?
    it('should skip backport when no targets are found', async () => {
      // Setup: PR with only current version label (no backport targets)
      mockContext.payload.pull_request.labels = [{ name: 'backport:version' }];

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: backportRun should not be called
      expect(mockBackportRun).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it('should run successful backport flow with valid targets', async () => {
      // Setup: PR with version labels that resolve to backport targets
      mockContext.payload.pull_request.labels = [
        { name: 'backport:version' },
        { name: 'v9.2.0' },
        { name: 'v9.1.4' },
        { name: 'v9.0.7' },
      ];

      // Mock environment for GitHub action URL
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'elastic/kibana',
        GITHUB_RUN_ID: '123456789',
      };

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should create comment with backport targets
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        body: expect.stringContaining('Starting backport for target branches: 9.0, 9.1'),
      });

      // Verify: should update PR body with backport targets
      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        pull_number: 12345,
        body: expect.stringMatching(/<!--ONMERGE.*backportTargets.*ONMERGE-->/s),
      });

      // Verify: should call backportRun with correct options
      expect(mockBackportRun).toHaveBeenCalledWith({
        options: {
          repoOwner: 'elastic',
          repoName: 'kibana',
          accessToken: 'test-token',
          interactive: false,
          pullNumber: 12345,
          assignees: ['test-user'],
          autoMerge: true,
          autoMergeMethod: 'squash',
          targetBranches: ['9.0', '9.1'],
          publishStatusCommentOnFailure: true,
          publishStatusCommentOnSuccess: true,
        },
      });

      // Restore environment
      process.env = originalEnv;
    });

    it('should handle backportRun failure gracefully', async () => {
      // Setup: PR with version labels that resolve to backport targets
      mockContext.payload.pull_request.labels = [
        { name: 'backport:version' },
        { name: 'v9.2.0' },
        { name: 'v9.1.4' },
      ];

      mockBackportRun.mockResolvedValueOnce({
        status: 'failure',
        error: new Error('Backport failed'),
      } as any);

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should create comment about starting backport
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        body: expect.stringContaining('Starting backport for target branches: 9.1'),
      });

      // Verify: should call backportRun
      expect(mockBackportRun).toHaveBeenCalled();

      // Verify: should create comment about backport failure
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 12345,
        body: expect.stringContaining('Backport failed'),
      });
    });

    it('should not start backport if the process gets interrupted by SIGINT', async () => {
      // Setup: PR with version labels that resolve to backport targets
      mockContext.payload.pull_request.labels = [
        { name: 'backport:version' },
        { name: 'v9.2.0' },
        { name: 'v9.1.4' },
      ];

      const { main: runOnMergeAction } = require('./index');

      process.env.BACKPORT_DEBOUNCE_TIMEOUT = '500'; // increase debounce timeout to ensure we can send SIGINT in time
      const actionPromise = runOnMergeAction();

      // Simulate sending SIGINT shortly after starting the action
      setTimeout(() => {
        process.emit('SIGINT', 'SIGINT');
      }, 50);

      await actionPromise;

      // Verify: backportRun should not be called
      expect(mockBackportRun).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });
  });

  describe('Backport PRs', () => {
    beforeEach(() => {
      // Set up backport PR context
      mockContext.payload.pull_request.base.ref = '9.1';
      mockContext.payload.pull_request.labels = [{ name: 'backport' }];
    });

    it('should add version labels to original PR when backport PR has source data', async () => {
      // Setup: backport PR with source PR data in body
      const backportData = [
        {
          sourcePullRequest: { number: 11111, labels: [] },
          sha: 'abc123',
        },
      ];

      mockContext.payload.pull_request.body = `Some PR description
<!--BACKPORT ${JSON.stringify(backportData)} BACKPORT-->`;

      mockOctokit.rest.repos.getContent.mockImplementation((request) => {
        return (
          {
            'versions.json': serveFixture('versions.json'),
            '.backportrc.json': serveFixture('.backportrc.json'),
            'package.json': serveFixture('package-9.1.json'),
          } as any
        )[request.path];
      });

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should add version label to original PR
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'elastic',
        repo: 'kibana',
        issue_number: 11111,
        labels: ['v9.1.4'],
      });
    });

    it('should skip processing when backport PR has no source data', async () => {
      // Setup: backport PR without source PR data
      mockContext.payload.pull_request.body = 'Simple backport PR description';

      const { main: runOnMergeAction } = require('./index');

      await runOnMergeAction();

      // Verify: should not add any labels
      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
    });
  });
});
