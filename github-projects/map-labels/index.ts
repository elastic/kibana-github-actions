#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import * as core from '@actions/core';
import { context } from '@actions/github';

import { Octokit } from '@octokit/rest';
import {
  gqlGetFieldOptions,
  gqlGetIssuesForProject,
  gqlGetProject,
  gqlUpdateFieldValue,
  IssueNode,
  SingleSelectField,
} from '../api/projectsGraphQL';
import { URL, URLSearchParams } from 'url';

const DEFAULT_OWNER_ORG = 'elastic';

/**
 * This script should map labels to fields in a GitHub project board.
 * Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.
 */
const parsedCliArgs = yargs(process.argv.slice(2))
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
    describe: 'The mapping file to use',
    default: 'mapping-sizes-and-impact.json',
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

const argsFromInputs: Partial<typeof parsedCliArgs> = {
  owner: core.getInput('owner') || tryGetOwnerFromContext() || DEFAULT_OWNER_ORG,
  projectNumber: core.getInput('project-number') ? parseInt(core.getInput('project-number')) : undefined,
  issueNumber: core.getInput('issue-number')
    ? core
        .getInput('issue-number')
        .split(',')
        .map((n) => parseInt(n))
    : [],
  all: core.getInput('all') === 'true',
  mapping: core.getInput('mapping'),
  githubToken: core.getInput('github-token') || process.env.GITHUB_TOKEN,
  dryRun: core.getInput('dry-run') === 'true',
};

/**
 * Main function
 */
async function main(args: typeof parsedCliArgs) {
  const combinedArgs = combineAndVerifyArgs(argsFromInputs, args);

  const { issueNumber, projectNumber, owner, repo, mapping, all, dryRun, githubToken } = combinedArgs;
  const issueNumbers = issueNumber || [];
  const updateResults = {
    success: [] as IssueNode[],
    failure: [] as IssueNode[],
    skipped: [] as IssueNode[],
    projectUrl: '',
  };

  if (dryRun) {
    console.log('Running in dry-run mode. No changes will be made.');
  }

  const octokit = new Octokit({
    auth: githubToken.trim(),
  });

  console.log(`Loading label mapping file ${mapping}`);
  const labelsToFields = loadMapping(mapping);

  console.log(`Requesting project ${owner}/${projectNumber} and its issues...`);
  const projectAndFields = await gqlGetProject(octokit, { projectNumber, owner });
  updateResults.projectUrl = projectAndFields.url;

  const hasFilter = issueNumbers?.length > 0;
  // If we're requesting all issues, we should list ~1000 issues to max it out
  // if we're not, we should be fine with the 50 most recent
  const issueCount = hasFilter || all ? 1000 : 50;

  const issuesInProject = await gqlGetIssuesForProject(
    octokit,
    { projectNumber, findIssueNumbers: issueNumbers, owner },
    {
      issueCount,
    },
  );

  console.log(`Filtering issues: ${hasFilter ? issueNumbers.join(', ') : 'all'}`);
  const targetIssues = hasFilter ? filterIssues(issuesInProject, issueNumbers, repo) : issuesInProject;

  for (const issueNode of targetIssues) {
    console.log(`Updating issue target: ${issueNode.content.url}...`);
    try {
      const updatedFields = await adjustSingleItemLabels(octokit, {
        issueNode,
        owner,
        projectNumber,
        projectId: projectAndFields.id,
        mapping: labelsToFields,
        dryRun,
      });
      if (updatedFields.length) {
        console.log(`Updated fields: ${updatedFields.join(', ')}`);
        updateResults.success.push(issueNode);
      } else {
        console.log('No fields updated');
        updateResults.skipped.push(issueNode);
      }
    } catch (error) {
      console.error('Error updating issue', error);
      updateResults.failure.push(issueNode);
    }
  }
  return updateResults;
}

function filterIssues(issuesInProject: IssueNode[], issueNumbers: number[], repo: string | undefined) {
  const targetIssues = issuesInProject.filter((issue) => {
    if (!repo) {
      return issueNumbers.includes(issue.content.number);
    } else {
      return issueNumbers.includes(issue.content.number) && issue.content.repository.name === repo;
    }
  });

  if (!targetIssues.length) {
    console.error(`Could not find any update target(s) in repo "${repo}" issues: ${issueNumbers}`);
    throw new Error('No target issues found');
  } else {
    console.log(`Found ${targetIssues.length} target issue(s) for update`);
  }
  return targetIssues;
}

function combineAndVerifyArgs(defaults: typeof argsFromInputs, args: typeof parsedCliArgs) {
  const combinedArgs = { ...defaults, ...args };
  verifyExpectedArgs(combinedArgs);
  return combinedArgs;
}

async function adjustSingleItemLabels(
  octokit: Octokit,
  options: {
    owner: string;
    issueNode: IssueNode;
    projectNumber: number;
    projectId: string;
    dryRun: boolean;
    mapping: Record<string, { [fieldName: string]: string } | null>;
  },
) {
  const { issueNode, projectNumber, projectId, mapping, owner, dryRun } = options;
  const { content: issue, id: itemId } = issueNode;
  const labels = issue.labels.nodes;

  const updatedFields: string[] = [];

  // Get fields for each mappable label
  for (const label of labels) {
    const fieldUpdate = mapping[label.name];
    if (!fieldUpdate) {
      continue;
    }

    const fieldName = Object.keys(fieldUpdate)[0];
    const value = fieldUpdate[fieldName];

    console.log('Finding option for value', { fieldName, value });

    // Get field id
    const optionForValue = await getOptionIdForValue(octokit, { projectNumber, fieldName, value, owner });

    if (!optionForValue) {
      continue;
    }

    // Check if the field is already set
    const existingField = issueNode.fieldValues.nodes.find(
      (field) => field.__typename === 'ProjectV2ItemFieldSingleSelectValue' && field.field.name === fieldName,
    );

    if (existingField) {
      const existingFieldValue = fieldLookup[fieldName]?.options.find((e) => e.id === existingField.optionId);

      console.log(
        `Field "${fieldName}" is already set to "${existingFieldValue?.name}" (${existingField.optionId}), skipping update`,
      );
      continue;
    }

    // update field
    console.log(`Updating field "${fieldName}" to "${value}" (${optionForValue.optionId})`);
    const updateParams = {
      projectId,
      itemId,
      fieldId: optionForValue.fieldId,
      optionId: optionForValue.optionId,
      fieldName,
    };
    if (dryRun) {
      console.log('Dry run: skipping update for parameters', updateParams);
    } else {
      await gqlUpdateFieldValue(octokit, updateParams);
    }
    updatedFields.push(fieldName);
  }
  return updatedFields;
}

function verifyExpectedArgs(
  args: Partial<{
    owner: string;
    projectNumber: number;
    githubToken: string;
    issueNumber: number[];
    all: boolean;
  }>,
): asserts args is {
  owner: string;
  projectNumber: number;
  issueNumber: number[];
  githubToken: string;
  all: boolean;
} {
  const { owner, projectNumber, issueNumber, all, githubToken } = args;
  if (!owner) {
    throw new Error('Owner from context or args cannot be inferred, but is required');
  }
  if (!projectNumber) {
    throw new Error('Project number is required for a single issue update');
  }
  if (!githubToken) {
    throw new Error('GitHub token is required for authentication');
  }
  if (!issueNumber && !all) {
    throw new Error('Either "issueNumber" or "all" should be specified at once');
  }
}

let fieldLookup: Record<string, SingleSelectField> = {};
async function populateFieldLookup(
  octokit: Octokit,
  projectOptions: { projectNumber: number; owner: string },
) {
  const fieldOptions = await gqlGetFieldOptions(octokit, projectOptions);

  const singleSelectFields = fieldOptions.organization.projectV2.fields.nodes.filter(
    (f) => f.__typename === 'ProjectV2SingleSelectField',
  );

  fieldLookup = singleSelectFields.reduce(
    (acc, field) => {
      acc[field.name] = field;
      return acc;
    },
    {} as Record<string, SingleSelectField>,
  );

  console.log('Field lookup populated', fieldLookup);
}

async function getOptionIdForValue(
  octokit: Octokit,
  options: { projectNumber: number; fieldName: string; value: string; owner: string },
) {
  const { fieldName, value } = options;
  if (Object.keys(fieldLookup).length === 0) {
    await populateFieldLookup(octokit, options);
  }

  const field = fieldLookup[fieldName];
  if (!field) {
    console.error(`Could not find field "${fieldName}" in project fields`);
    return null;
  }
  const optionId = field.options.find((o) => o.name === value)?.id;

  if (!optionId) {
    console.warn(`Could not find option for field "${fieldName}" and value "${value}"`, field.options);
    return null;
  } else {
    return {
      optionId,
      fieldId: field.id,
    };
  }
}

function loadMapping(mappingName: string) {
  const pathToMapping = path.join(__dirname, mappingName);
  const mapping = fs.readFileSync(pathToMapping, 'utf8');
  return JSON.parse(mapping);
}

function getIssueLinks(projectUrl: string, issue: IssueNode) {
  const issueBodyUrl = issue.content.url;

  const search = new URLSearchParams();
  search.set('pane', 'issue');
  search.set('itemId', issue.fullDatabaseId.toString());
  search.set('issue', issue.content.resourcePath);
  const issueRef = new URL(projectUrl);
  issueRef.search = search.toString();

  return `${issueBodyUrl} | ${issueRef}`;
}

function tryGetOwnerFromContext() {
  try {
    // Might throw if the context is not available
    return context.repo.owner;
  } catch (error) {
    console.warn('Could not get owner from context: ', error.message);
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

main(parsedCliArgs)
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
