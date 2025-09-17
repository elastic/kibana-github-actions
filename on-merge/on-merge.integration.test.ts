/**
 * Jest-based integration tests for the on-merge GitHub Action
 */

// Create mock Octokit instance that we'll use across tests
const mockOctokit = {
  rest: {
    repos: {
      getContent: jest.fn(),
    },
    issues: {
      addLabels: jest.fn(),
      removeLabel: jest.fn(),
      createComment: jest.fn(),
    },
    pulls: {
      update: jest.fn(),
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
    },
  },
};

// Mock all dependencies at the top level with factory functions
jest.mock('@actions/github', () => ({
  context: mockContext,
  getOctokit: jest.fn(() => mockOctokit),
}));

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
}));

jest.mock('backport', () => ({
  backportRun: jest.fn(),
}));

// Import the mocked modules
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { backportRun } from 'backport';

// Get typed access to the mocks
const mockCore = jest.mocked(core);
const mockGetOctokit = jest.mocked(getOctokit);
const mockBackportRun = jest.mocked(backportRun);

const defaultContext = {
  repo: { owner: 'elastic', repo: 'kibana' },
  payload: {
    pull_request: {
      number: 12345,
      labels: [{ name: 'v8.4.0' }],
      base: { ref: 'main' },
      user: { login: 'test-user' },
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

describe('On-Merge Action', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    jest.resetModules();

    // Set up default mock implementations
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === 'github_token') return 'test-token';
      return '';
    });

    mockGetOctokit.mockReturnValue(mockOctokit as any);
    mockBackportRun.mockResolvedValue({ success: true } as any);

    // Reset context to default state - now this should work since mockContext is a regular object
    Object.assign(mockContext, JSON.parse(JSON.stringify(defaultContext)));
  });

  it('should throw an error if the payload is not a pull request', async () => {
    mockContext.payload.pull_request = null!;

    const { main } = require('./on-merge');

    await expect(main()).rejects.toThrow('Only pull_request events are supported.');
  });

  it('should throw an error if versions.json is missing development and main branches', async () => {
    mockOctokit.rest.repos.getContent.mockRejectedValueOnce(new Error('Not Found'));

    const { main } = require('./on-merge');

    await expect(main()).rejects.toThrow(/Not Found/);
  });
});
