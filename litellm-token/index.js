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
const schema_1 = require("./schema");
const litellmToken_1 = require("./litellmToken");
async function run() {
    var _a, _b;
    const rawInputs = {
        operation: core.getInput('operation', { required: true }).trim().toLowerCase(),
        baseUrl: core.getInput('base-url', { required: true }),
        masterKey: core.getInput('master-key', { required: true }),
        keyTTL: core.getInput('key-ttl') || '15m',
        maxBudget: core.getInput('max-budget') || '5',
        models: core.getInput('models'),
        metadata: core.getInput('metadata') || undefined,
        apiKey: core.getInput('api-key'),
    };
    maskSecret(rawInputs.masterKey);
    maskSecret(rawInputs.apiKey);
    if (rawInputs.operation !== 'mint' && rawInputs.operation !== 'revoke') {
        throw new Error(`Unsupported operation "${rawInputs.operation}". Expected "mint" or "revoke".`);
    }
    const parsedInputs = schema_1.actionInputSchema.safeParse(rawInputs);
    if (!parsedInputs.success) {
        throw new Error((_b = (_a = parsedInputs.error.issues[0]) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : 'Invalid LiteLLM token inputs.');
    }
    const inputs = parsedInputs.data;
    if (inputs.operation === 'mint') {
        const apiKey = await (0, litellmToken_1.mintLiteLLMToken)(inputs);
        core.setSecret(apiKey);
        core.setOutput('api_key', apiKey);
        core.info('Minted LiteLLM token.');
        return;
    }
    if (inputs.operation === 'revoke') {
        await (0, litellmToken_1.revokeLiteLLMToken)(inputs);
        core.info('Revoked LiteLLM token.');
    }
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