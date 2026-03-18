const mockInputs: Record<string, string> = {};

const mockCore = {
  getInput: jest.fn((name: string) => mockInputs[name] ?? ''),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  setSecret: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

const mockLitellmToken = {
  buildDefaultKeyAlias: jest.fn(() => 'gha-elastic-kibana-12345'),
  getGitHubRuntimeMetadata: jest.fn(() => ({ github_repository: 'elastic/kibana' })),
  mintLiteLLMToken: jest.fn(),
  parseListInput: jest.fn(() => []),
  parseOptionalJsonObject: jest.fn(() => undefined),
  revokeLiteLLMToken: jest.fn(),
};

jest.mock('@actions/core', () => mockCore);
jest.mock('./litellmToken', () => mockLitellmToken);

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    for (const key of Object.keys(mockInputs)) {
      delete mockInputs[key];
    }
  });

  it('masks revoke secrets and fails when revocation is not confirmed', async () => {
    Object.assign(mockInputs, {
      operation: 'revoke',
      'base-url': 'https://litellm.example.com',
      'master-key': 'sk-master',
      'key-alias': 'gha-elastic-kibana-12345',
      'token-id': 'token-hash-123',
      'api-key': 'sk-short-lived',
    });

    mockLitellmToken.revokeLiteLLMToken.mockResolvedValue({
      revoked: false,
      message: 'delete by token id: HTTP 404: token id not found',
    });

    const { run } = require('./index');

    await expect(run()).rejects.toThrow(
      'LiteLLM token cleanup did not confirm revocation: delete by token id: HTTP 404: token id not found',
    );

    expect(mockCore.setSecret).toHaveBeenCalledTimes(3);
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('token-hash-123');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockCore.warning).not.toHaveBeenCalled();
    expect(mockLitellmToken.revokeLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      keyAlias: 'gha-elastic-kibana-12345',
      tokenId: 'token-hash-123',
      apiKey: 'sk-short-lived',
    });
  });
});
