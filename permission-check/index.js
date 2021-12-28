"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const github_1 = require("@actions/github");
async function run() {
    const username = core.getInput('username') || github_1.context.actor;
    const response = await github_1.getOctokit(core.getInput('token')).rest.repos.getCollaboratorPermissionLevel({
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