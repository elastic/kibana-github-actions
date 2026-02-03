# Kibana Github Actions

This repo hosts Kibana's custom Github Actions.

Created using https://github.com/microsoft/vscode-github-triage-actions as a foundation.

# Development

## Requirements

- node.js >= 20 and npm

## Getting Started

```bash
# Install dependencies
npm install

# Run all tests
npm run test
npm run test:integration # for integration tests only
npm run test:unit # for unit tests only

# Linting
npm run lint

# Transpile TypeScript - this will also happen automatically on commit
npm run build
```
