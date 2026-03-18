"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorResponseSchema = exports.mintResponseSchema = exports.actionInputSchema = exports.revokeInputSchema = exports.mintInputSchema = void 0;
const zod_1 = require("zod");
const jsonObjectSchema = zod_1.z.object({}).catchall(zod_1.z.unknown());
const commonInputSchema = zod_1.z.object({
    baseUrl: zod_1.z
        .string()
        .min(1, 'Input "base-url" is required.')
        .transform((value) => value.replace(/\/+$/, '')),
    masterKey: zod_1.z.string().min(1, 'Input "master-key" is required.'),
});
const mintFields = {
    models: zod_1.z
        .string()
        .transform((value) => value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0))
        .refine((value) => value.length > 0, {
        message: 'A mint operation requires at least one model.',
    }),
    keyTTL: zod_1.z.string().min(1, 'Input "key-ttl" is required.'),
    maxBudget: zod_1.z.string().transform((value, ctx) => {
        const parsedValue = Number.parseFloat(value);
        if (!Number.isFinite(parsedValue)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Input "max-budget" must be a valid number.',
            });
            return zod_1.z.NEVER;
        }
        return parsedValue;
    }),
    metadata: zod_1.z
        .string()
        .optional()
        .transform((value, ctx) => {
        if (!(value === null || value === void 0 ? void 0 : value.trim())) {
            return undefined;
        }
        let parsed;
        try {
            parsed = JSON.parse(value);
        }
        catch (error) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Input "metadata" must be valid JSON.',
            });
            return zod_1.z.NEVER;
        }
        const result = jsonObjectSchema.safeParse(parsed);
        if (!result.success) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Input "metadata" must be a JSON object.',
            });
            return zod_1.z.NEVER;
        }
        return result.data;
    }),
};
const revokeFields = {
    apiKey: zod_1.z.string().min(1, 'Input "api-key" is required.'),
};
exports.mintInputSchema = commonInputSchema.extend(mintFields);
exports.revokeInputSchema = commonInputSchema.extend(revokeFields);
exports.actionInputSchema = zod_1.z.discriminatedUnion('operation', [
    exports.mintInputSchema.extend({
        operation: zod_1.z.literal('mint'),
    }),
    exports.revokeInputSchema.extend({
        operation: zod_1.z.literal('revoke'),
    }),
]);
exports.mintResponseSchema = zod_1.z.object({
    key: zod_1.z.string().refine((value) => value.trim().length > 0, {
        message: 'LiteLLM mint response key was missing or empty.',
    }),
});
exports.errorResponseSchema = zod_1.z.object({
    message: zod_1.z.string(),
});
//# sourceMappingURL=schema.js.map