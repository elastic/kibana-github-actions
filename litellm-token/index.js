"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const litellmToken_1 = require("./litellmToken");
async function run() {
    const operation = core.getInput('operation', { required: true }).trim().toLowerCase();
    const baseUrl = core.getInput('base-url', { required: true });
    const masterKey = core.getInput('master-key', { required: true });
    if (operation === 'mint') {
        const runtimeMetadata = (0, litellmToken_1.getGitHubRuntimeMetadata)(process.env);
        const explicitKeyAlias = core.getInput('key-alias');
        const token = await (0, litellmToken_1.mintLiteLLMToken)({
            baseUrl,
            masterKey,
            duration: core.getInput('duration') || '15m',
            models: (0, litellmToken_1.parseListInput)(core.getInput('models')),
            keyAlias: explicitKeyAlias || (0, litellmToken_1.buildDefaultKeyAlias)(runtimeMetadata),
            metadata: (0, litellmToken_1.parseOptionalJsonObject)(core.getInput('metadata'), 'metadata'),
            additionalPayload: (0, litellmToken_1.parseOptionalJsonObject)(core.getInput('additional-payload'), 'additional-payload'),
            runtimeMetadata,
        });
        core.setSecret(token.apiKey);
        core.setOutput('api_key', token.apiKey);
        if (token.tokenId) {
            core.setSecret(token.tokenId);
            core.setOutput('token_id', token.tokenId);
        }
        if (token.keyAlias) {
            core.setOutput('key_alias', token.keyAlias);
        }
        if (token.expiresAt) {
            core.setOutput('expires_at', token.expiresAt);
        }
        core.info(`Minted LiteLLM token${token.keyAlias ? ` for alias ${token.keyAlias}` : ''}.`);
        return;
    }
    if (operation === 'revoke') {
        const result = await (0, litellmToken_1.revokeLiteLLMToken)({
            baseUrl,
            masterKey,
            keyAlias: core.getInput('key-alias') || undefined,
            tokenId: core.getInput('token-id') || undefined,
            apiKey: core.getInput('api-key') || undefined,
        });
        if (result.revoked) {
            core.info(`Revoked LiteLLM token${result.strategy ? ` using ${result.strategy}` : ''}.`);
            return;
        }
        core.warning(`LiteLLM token cleanup did not confirm revocation${result.message ? `: ${result.message}` : '.'}`);
        return;
    }
    throw new Error(`Unsupported operation "${operation}". Expected "mint" or "revoke".`);
}
run().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map