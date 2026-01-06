#!/usr/bin/env ts-node

import yargs from 'yargs';
import * as core from '@actions/core';
import { context } from '@actions/github';

import { mapLabelsToAttributes } from './mapLabelsToAttributes';
import { getIssueLinks, sleep, merge } from './utils';

export type ActionArgs = {
  issueNumber?: number[];
  projectNumber?: number;
  repo?: string;
  mapping?: string;
  githubToken?: string;
  all?: boolean;
  owner?: string;
  dryRun?: boolean;
};

/**
 * This script should map labels to fields in a GitHub project board.
 * Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.
 */
const parsedCliArgs: ActionArgs = yargs(process.argv.slice(2))
  // Since there's no preamble, we'll add the description to the epilogue.
  .epilogue(
    'This script should map labels to fields in a GitHub project board.\n' +
      'Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.',
  )
  .option('issueNumber', {
    alias: 'i',
    type: 'number',
    array: true,
    conflicts: 'all',
    describe: 'The target issue number (or issues) to update',
  })
  .option('all', {
    type: 'boolean',
    conflicts: 'issueNumber',
    describe: 'Update all issues in the project',
  })
  .option('projectNumber', {
    alias: 'p',
    type: 'number',
    describe: 'The project number containing the issue',
  })
  .option('mapping', {
    alias: 'm',
    type: 'string',
    describe: 'The mapping file to use (default: mapping-sizes-and-impact.json)',
    // the default is defined in combineAndVerifyArgs to allow action inputs to override it
  })
  .option('repo', {
    alias: 'r',
    type: 'string',
    describe:
      'The repository containing the issues. (If missing, any issue with that number in the project will be updated)',
  })
  .option('owner', {
    alias: 'o',
    type: 'string',
    describe: 'The owner of the repository',
  })
  .option('githubToken', {
    alias: 't',
    type: 'string',
    describe: 'The GitHub token to use for authentication',
  })
  .option('dryRun', {
    type: 'boolean',
    describe: 'Run the script without making changes',
    default: false,
  })
  .option('version', {
    hidden: true,
  })
  .help().argv;

function getInputOrUndefined<U = string>(name: string, parse?: (v: string) => U): U | undefined {
  const value = core.getInput(name);
  if (value.length > 0) {
    return parse ? (parse(value) as U) : (value as unknown as U);
  } else {
    return undefined;
  }
}

const argsFromActionInputs: ActionArgs = {
  owner: getInputOrUndefined('owner'),
  repo: getInputOrUndefined('repo'),
  projectNumber: getInputOrUndefined('project-number', parseInt),
  issueNumber: getInputOrUndefined('issue-number', (v) => v.split(',').map((i) => parseInt(i))),
  all: getInputOrUndefined('all', (v) => v === 'true'),
  mapping: getInputOrUndefined('mapping'),
  githubToken: getInputOrUndefined('github-token') || process.env.GITHUB_TOKEN,
  dryRun: getInputOrUndefined('dry-run', (v) => v === 'true'),
};

function verifyExpectedArgs(args: ActionArgs): asserts args is {
  owner: string;
  projectNumber: number;
  issueNumber: number[];
  githubToken: string;
  all: boolean;
  mapping: string;
  dryRun: boolean;
  repo?: string;
} {
  if (!args.owner) {
    throw new Error('Owner from context or args cannot be inferred, but is required');
  }
  if (!args.projectNumber) {
    throw new Error('Project number is required for a single issue update');
  }
  if (!args.githubToken) {
    throw new Error('GitHub token is required for authentication');
  }
  if (args.issueNumber?.length && args.all) {
    throw new Error('Either "issueNumber" or "all" should be specified at once');
  }
}

function tryGetOwnerFromContext() {
  const DEFAULT_OWNER_ORG = 'elastic';
  try {
    // Might throw if the context is not available
    return context.repo.owner;
  } catch (error) {
    return DEFAULT_OWNER_ORG;
  }
}

function combineAndVerifyArgs(argsFromActionInputs: ActionArgs, argsFromCli: ActionArgs) {
  const defaults = {
    owner: tryGetOwnerFromContext(),
    issueNumber: [] as number[],
    mapping: 'mapping-sizes-and-impact.json',
  };

  const combinedArgs: ActionArgs = merge(merge(defaults, argsFromActionInputs), argsFromCli);

  verifyExpectedArgs(combinedArgs);

  return combinedArgs;
}

mapLabelsToAttributes(combineAndVerifyArgs(argsFromActionInputs, parsedCliArgs))
  .then(async (results) => {
    await sleep(1000); // Wait for the last log to flush

    const { success, failure, skipped, projectUrl } = results;
    if (failure.length) {
      console.warn('Some issues failed to update:', failure);
    } else {
      console.log('All issues updated successfully.');
    }
    console.log(`Updated ${success.length} issues in project ${projectUrl} (${skipped.length} skipped)`);
    success.forEach((issue) => console.log(`\t- ${getIssueLinks(projectUrl, issue)}`));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    core.setFailed(error.message);
    process.exit(1);
  });
