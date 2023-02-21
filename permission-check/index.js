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
    var _a;
    const desiredPermission = core.getInput('permission');
    const desiredTeamOptions = core.getInput('teams');
    if (!desiredPermission && !desiredTeamOptions) {
        throw Error('No "permission" or "team" options specified. At least one must be specified.');
    }
    const username = core.getInput('username') || github_1.context.actor;
    const errors = [];
    if (desiredPermission) {
        const perms = ['none', 'read', 'write', 'admin'];
        if (perms.indexOf(desiredPermission) < 0) {
            throw Error(`Invalid desired permission: ${desiredPermission}`);
        }
        const response = await (0, github_1.getOctokit)(core.getInput('token')).rest.repos.getCollaboratorPermissionLevel({
            ...github_1.context.repo,
            username,
        });
        const userPermission = response.data.permission;
        if (perms.indexOf(userPermission) < perms.indexOf(desiredPermission)) {
            errors.push(`User '${username}' did not have at least permission '${desiredPermission}', had ${userPermission}`);
        }
        else {
            return true;
        }
    }
    if (desiredTeamOptions) {
        const teamOptions = desiredTeamOptions.split(',').map((t) => t.trim().replace('@', ''));
        for (const teamOption of teamOptions) {
            try {
                const response = await (0, github_1.getOctokit)(core.getInput('token')).rest.teams.getMembershipForUserInOrg({
                    org: github_1.context.repo.owner,
                    team_slug: teamOption,
                    username: username,
                });
                if (((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.state) === 'active') {
                    return true;
                }
            }
            catch (ex) {
                // 404 == not a member of the team
            }
        }
        errors.push(`User '${username}' was not a member of any of the teams: ${teamOptions.join(', ')}`);
    }
    if (errors.length) {
        throw Error(errors.join(' '));
    }
}
run().catch((error) => {
    console.error('An error occurred', error);
    core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map