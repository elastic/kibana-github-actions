import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

async function run() {
  const desiredPermission = core.getInput('permission');
  const desiredTeamOptions = core.getInput('teams');

  if (!desiredPermission && !desiredTeamOptions) {
    throw Error('No "permission" or "team" options specified. At least one must be specified.');
  }

  const username = core.getInput('username') || context.actor;

  const errors: string[] = [];

  if (desiredPermission) {
    const perms = ['none', 'read', 'write', 'admin'];

    if (perms.indexOf(desiredPermission) < 0) {
      throw Error(`Invalid desired permission: ${desiredPermission}`);
    }

    const response = await getOctokit(core.getInput('token')).rest.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username,
    });

    const userPermission = response.data.permission;

    if (perms.indexOf(userPermission) < perms.indexOf(desiredPermission)) {
      errors.push(
        `User '${username}' did not have at least permission '${desiredPermission}', had ${userPermission}`,
      );
    } else {
      return true;
    }
  }

  if (desiredTeamOptions) {
    const teamOptions = desiredTeamOptions.split(',').map((t) => t.trim().replace('@', ''));
    for (const teamOption of teamOptions) {
      try {
        const response = await getOctokit(core.getInput('token')).rest.teams.getMembershipForUserInOrg({
          org: context.repo.owner,
          team_slug: teamOption,
          username: username,
        });
        if (response?.data?.state === 'active') {
          return true;
        }
      } catch (ex) {
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
