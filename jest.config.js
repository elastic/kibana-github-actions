module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.integration.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/node_modules/**', '!**/*.test.ts', '!**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
};
