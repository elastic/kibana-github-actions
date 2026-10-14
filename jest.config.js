module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  // compiled .js files are committed next to the sources; prefer the sources
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testMatch: ['**/*.integration.test.ts'],
  transform: {
    // jest can only mock `import('backport')` when it is compiled to require(); types are checked by `npm run build`
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/node_modules/**', '!**/*.test.ts', '!**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
};
