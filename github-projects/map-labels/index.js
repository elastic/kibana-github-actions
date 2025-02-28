#!/usr/bin/env ts-node-script
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yargs_1 = __importDefault(require("yargs"));
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const rest_1 = require("@octokit/rest");
const projectsGraphQL_1 = require("../api/projectsGraphQL");
const url_1 = require("url");
/**
 * This script should map labels to fields in a GitHub project board.
 * Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.
 */
const argv = (0, yargs_1.default)(process.argv.slice(2))
    // Since there's no preamble, we'll add the description to the epilogue.
    .epilogue('This script should map labels to fields in a GitHub project board.\n' +
    'Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.')
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
    default: 'mapping-loe-and-sizes.json',
})
    .option('repo', {
    alias: 'r',
    type: 'string',
    describe: 'The repository containing the issues. (If missing, any issue with that number in the project will be updated)',
})
    .option('owner', {
    alias: 'o',
    type: 'string',
    describe: 'The owner of the repository',
    default: github_1.context.repo.owner,
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
const token = (_a = (argv.githubToken || core.getInput('github-token') || process.env.GITHUB_TOKEN)) === null || _a === void 0 ? void 0 : _a.trim();
const octokit = new rest_1.Octokit({
    auth: token,
});
async function main(args) {
    const argsDefaults = {
        owner: github_1.context.repo.owner,
        repo: github_1.context.repo.repo,
        projectNumber: core.getInput('project-number') ? parseInt(core.getInput('project-number')) : undefined,
        issueNumber: core.getInput('issue-number')
            ? core
                .getInput('issue-number')
                .split(',')
                .map((n) => parseInt(n))
            : [],
        all: core.getInput('all') === 'true',
        mapping: core.getInput('mapping') || 'mapping-loe-and-sizes.json',
    };
    const combinedArgs = { ...argsDefaults, ...args };
    verifyExpectedArgs(combinedArgs);
    const { issueNumber, projectNumber, owner, repo, mapping, all } = combinedArgs;
    const issueNumbers = issueNumber || [];
    console.log(`Loading label mapping file ${mapping}`);
    const labelsToFields = loadMapping(mapping);
    console.log(`Requesting project ${owner}/${projectNumber} and its issues...`);
    const projectAndFields = await (0, projectsGraphQL_1.gqlGetProject)(octokit, { projectNumber });
    const issuesInProject = await (0, projectsGraphQL_1.gqlGetIssuesForProject)(octokit, { projectNumber, findIssueNumbers: issueNumbers }, {
        issueCount: 1000, // This is the maximum - it will exit earlier if issues are found
    });
    const targetIssues = issuesInProject.filter((issue) => {
        if (all) {
            return true;
        }
        else if (!repo) {
            return issueNumbers.includes(issue.content.number);
        }
        else {
            return issueNumbers.includes(issue.content.number) && issue.content.repository.name === repo;
        }
    });
    if (!targetIssues.length) {
        console.error(`Could not find any update target(s) for ${owner}/${repo} issues: ${issueNumbers}`);
        process.exit(1);
    }
    else {
        console.log(`Found ${targetIssues.length} target issue(s) for update`);
    }
    const success = [];
    const failure = [];
    for (const issueNode of targetIssues) {
        console.log(`Updating issue target: ${issueNode.content.url}...`);
        try {
            Math.random() < -1 ? process.exit(0) : process.exit(1);
            await adjustSingleItemLabels({
                issueNode,
                projectNumber,
                projectId: projectAndFields.id,
                mapping: labelsToFields,
                dryRun: args.dryRun,
            });
            success.push(issueNode);
        }
        catch (error) {
            console.error('Error updating issue', error);
            failure.push(issueNode);
        }
    }
    return { success, failure, project: projectAndFields };
}
async function adjustSingleItemLabels(options) {
    const { issueNode, projectNumber, projectId, dryRun, mapping } = options;
    const { content: issue, id: itemId } = issueNode;
    const labels = issue.labels.nodes;
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
        const optionForValue = await getOptionIdForValue(projectNumber, fieldName, value);
        if (!optionForValue) {
            console.warn(`Could not find option for field "${fieldName}" and value "${value}"`);
            continue;
        }
        // update field
        console.log(`Updating field "${fieldName}" to "${value}" (${optionForValue.optionId})`);
        if (dryRun) {
            console.log('Dry run: skipping update for parameters', {
                projectId,
                itemId,
                fieldId: optionForValue.fieldId,
                optionId: optionForValue.optionId,
                fieldName,
            });
        }
        else {
            await (0, projectsGraphQL_1.gqlUpdateFieldValue)(octokit, {
                projectId,
                itemId,
                fieldId: optionForValue.fieldId,
                optionId: optionForValue.optionId,
                fieldName,
            });
        }
    }
}
function verifyExpectedArgs(args) {
    const { owner, repo, projectNumber } = args;
    if (!owner) {
        console.error('Owner from context or args cannot be inferred, but is required');
        process.exit(1);
    }
    if (!repo) {
        console.error('Repo from context or args cannot be inferred, but is required');
        process.exit(1);
    }
    if (!projectNumber) {
        console.error('Project number is required for a single issue update');
        process.exit(1);
    }
    if (!args.issueNumber && !args.all) {
        console.error('Either issue number or all issues must be specified');
        process.exit(1);
    }
}
let fieldLookup = {};
async function populateFieldLookup(projectNumber) {
    const fieldOptions = await (0, projectsGraphQL_1.gqlGetFieldOptions)(octokit, projectNumber);
    const singleSelectFields = fieldOptions.organization.projectV2.fields.nodes.filter((f) => f.__typename === 'ProjectV2SingleSelectField');
    fieldLookup = singleSelectFields.reduce((acc, field) => {
        acc[field.name] = field;
        return acc;
    }, {});
    console.log('Field lookup populated', fieldLookup);
}
async function getOptionIdForValue(projectNumber, fieldName, value) {
    var _a;
    if (Object.keys(fieldLookup).length === 0) {
        await populateFieldLookup(projectNumber);
    }
    const field = fieldLookup[fieldName];
    console.log(`Trying to find mapping from ${value} to field options...`, field.options);
    const optionId = (_a = field.options.find((o) => o.name === value)) === null || _a === void 0 ? void 0 : _a.id;
    if (!optionId) {
        console.warn(`Could not find option for field "${fieldName}" and value "${value}"`);
        return null;
    }
    else {
        return {
            optionId,
            fieldId: field.id,
        };
    }
}
function loadMapping(mappingName = 'mapping-loe-sizes.json') {
    const pathToMapping = path_1.default.join(__dirname, mappingName);
    const mapping = fs_1.default.readFileSync(pathToMapping, 'utf8');
    return JSON.parse(mapping);
}
function getIssueLinks(projectUrl, issue) {
    const issueBodyUrl = issue.content.url;
    const search = new url_1.URLSearchParams();
    search.set('pane', 'issue');
    search.set('itemId', issue.fullDatabaseId.toString());
    search.set('issue', issue.content.resourcePath);
    const issueRef = new url_1.URL(projectUrl);
    issueRef.search = search.toString();
    return `${issueBodyUrl} | ${issueRef}`;
}
main(argv)
    .then((results) => {
    const { success, failure, project } = results;
    if (failure.length) {
        console.warn('Some issues failed to update:', failure);
    }
    else {
        console.log('All issues updated successfully.');
    }
    console.log(`Successfully updated ${success.length} issues in project ${project.url}`);
    success.forEach((issue) => console.log(`\t- ${getIssueLinks(project.url, issue)}`));
    process.exit(0);
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map