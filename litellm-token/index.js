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
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const litellmToken_1 = require("./litellmToken");
async function run() {
    const operation = core.getInput('operation', { required: true }).trim().toLowerCase();
    const baseUrl = core.getInput('base-url', { required: true });
    const masterKey = core.getInput('master-key', { required: true });
    maskSecret(masterKey);
    if (operation === 'mint') {
        const apiKey = await (0, litellmToken_1.mintLiteLLMToken)({
            baseUrl,
            masterKey,
            duration: core.getInput('duration') || '15m',
            models: (0, litellmToken_1.parseListInput)(core.getInput('models', { required: true })),
            metadata: (0, litellmToken_1.parseOptionalJsonObject)(core.getInput('metadata'), 'metadata'),
            runtimeMetadata: (0, litellmToken_1.getGitHubRuntimeMetadata)(process.env),
        });
        core.setSecret(apiKey);
        core.setOutput('api_key', apiKey);
        core.info('Minted LiteLLM token.');
        return;
    }
    if (operation === 'revoke') {
        const apiKey = core.getInput('api-key', { required: true });
        maskSecret(apiKey);
        await (0, litellmToken_1.revokeLiteLLMToken)({
            baseUrl,
            masterKey,
            apiKey,
        });
        core.info('Revoked LiteLLM token.');
        return;
    }
    throw new Error(`Unsupported operation "${operation}". Expected "mint" or "revoke".`);
}
exports.run = run;
function maskSecret(value) {
    if (value) {
        core.setSecret(value);
    }
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : 'Unexpected error';
}
if (require.main === module) {
    run().catch((error) => {
        core.setFailed(getErrorMessage(error));
    });
}
//# sourceMappingURL=index.js.map