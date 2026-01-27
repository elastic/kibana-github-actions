import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';

import {
  gqlGetFieldOptions,
  gqlGetIssuesForProject,
  gqlGetProject,
  gqlUpdateFieldValue,
  IssueNode,
  SingleSelectField,
} from '../api/projectsGraphQL';

type MapLabelsToAttributesArgs = {
  issueNumber: number[];
  projectNumber: number;
  owner: string;
  mapping: string;
  all: boolean;
  dryRun: boolean;
  githubToken: string;
  repo?: string; // optional, filtering by repo is not required, issues are connected to a project
};

/**
 * Lists issues in a github project, and updates fields on them based on the mapping file given.
 *
 * The mapping file should be a JSON file with the following structure:
 * {
 *  "<labelName>": {
 *   "<fieldName>": "<value>"
 *  }
 * ...
 * }
 */
export async function mapLabelsToAttributes(args: MapLabelsToAttributesArgs) {
  const { issueNumber: issueNumbers, projectNumber, owner, repo, mapping, all, dryRun, githubToken } = args;

  const hasFilter = issueNumbers.length > 0;
  // If we're requesting all issues, we should list ~1000 issues to max it out
  // if we have a filter, we will also want to search for those issues, so max it out
  // if we're running with either of these args, we should be fine with the 50 most recent
  const issueCount = hasFilter || all ? 1000 : 50;

  const octokit = new Octokit({
    auth: githubToken.trim(),
  });

  if (dryRun) {
    console.log('⚠️ Running in dry-run mode. No changes will be made.');
  }

  console.log(`Loading label mapping file ${mapping}`);
  const labelsToFields = loadMapping(mapping);

  console.log(`Requesting project ${owner}/${projectNumber} and its issues...`);
  const projectAndFields = await gqlGetProject(octokit, { projectNumber, owner });

  const issuesInProject = await gqlGetIssuesForProject(
    octokit,
    { projectNumber, findIssueNumbers: issueNumbers, owner },
    {
      issueCount,
    },
  );

  const targetIssues = repo ? filterIssuesByRepo(issuesInProject, repo) : issuesInProject;
  if (!targetIssues.length) {
    console.error(`Could not find any update target(s) issues for params:`, {
      projectNumber,
      issueNumbers,
      repo,
      owner,
    });
    throw new Error('No target issues found');
  } else {
    console.log(`Found ${targetIssues.length} target issue(s) for update`);
  }

  const updateResults = {
    success: [] as IssueNode[],
    failure: [] as IssueNode[],
    skipped: [] as IssueNode[],
    projectUrl: projectAndFields.url,
  };
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

function loadMapping(mappingFileName: string) {
  const pathToMapping = path.join(__dirname, mappingFileName);
  const mapping = fs.readFileSync(pathToMapping, 'utf8');
  return JSON.parse(mapping);
}

function filterIssuesByRepo(issuesInProject: IssueNode[], repo: string | undefined) {
  console.log('Filtering issues by repository: ', repo);
  return issuesInProject.filter((issue) => {
    return issue.content.repository.name === repo;
  });
}

async function adjustSingleItemLabels(
  octokit: Octokit,
  options: {
    owner: string;
    issueNode: IssueNode;
    projectNumber: number;
    projectId: string;
    dryRun: boolean;
    mapping: Record<string, { [fieldName: string]: string | { value: string; override?: boolean } } | null>;
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
    const configuration = fieldUpdate[fieldName];
    const value = configuration && typeof configuration === 'object' ? configuration.value : configuration;
    const canOverridePreviousValue = Boolean(
      configuration && typeof configuration === 'object' ? configuration.override : false,
    );

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

    const fieldLookup = await getFieldLookupObj(octokit, { projectNumber, owner });
    if (existingField && !canOverridePreviousValue) {
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

const getFieldLookupObj = (() => {
  let fieldLookup: Record<string, SingleSelectField>;

  return async (octokit: Octokit, projectOptions: { projectNumber: number; owner: string }) => {
    if (typeof fieldLookup === 'undefined' || Object.keys(fieldLookup).length === 0) {
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

    return fieldLookup;
  };
})();

async function getOptionIdForValue(
  octokit: Octokit,
  options: { projectNumber: number; fieldName: string; value: string; owner: string },
) {
  const { fieldName, value } = options;
  const fieldLookup = await getFieldLookupObj(octokit, options);

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
