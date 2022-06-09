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
const github_1 = require("@actions/github");
async function run() {
    const username = core.getInput('username') || github_1.context.actor;
    const response = await (0, github_1.getOctokit)(core.getInput('token')).rest.repos.getCollaboratorPermissionLevel({
        ...github_1.context.repo,
        username,
    });
    const userPermission = response.data.permission;
    const desiredPermission = core.getInput('permission');
    const perms = ['none', 'read', 'write', 'admin'];
    if (perms.indexOf(desiredPermission) < 0) {
        throw Error(`Invalid desired permission: ${desiredPermission}`);
    }
    if (perms.indexOf(userPermission) < perms.indexOf(desiredPermission)) {
        throw Error(`User '${username}' must have at least permission '${desiredPermission}', had ${userPermission}`);
    }
}
run().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map