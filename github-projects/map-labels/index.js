#!/usr/bin/env ts-node
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
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const mapLabelsToAttributes_1 = require("./mapLabelsToAttributes");
const utils_1 = require("./utils");
/**
 * This script should map labels to fields in a GitHub project board.
 * Since projects can exist outside of a repo, we need to pass in the owner and repo as arguments.
 */
const parsedCliArgs = (0, yargs_1.default)(process.argv.slice(2))
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
    default: 'mapping-sizes-and-impact.json',
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
function getInputOrUndefined(name, parse) {
    const value = core.getInput(name);
    if (value.length > 0) {
        return parse ? parse(value) : value;
    }
    else {
        return undefined;
    }
}
const argsFromActionInputs = {
    owner: getInputOrUndefined('owner'),
    repo: getInputOrUndefined('repo'),
    projectNumber: getInputOrUndefined('project-number', parseInt),
    issueNumber: getInputOrUndefined('issue-number', (v) => v.split(',').map((i) => parseInt(i))),
    all: getInputOrUndefined('all', (v) => v === 'true'),
    mapping: getInputOrUndefined('mapping'),
    githubToken: getInputOrUndefined('github-token') || process.env.GITHUB_TOKEN,
    dryRun: getInputOrUndefined('dry-run', (v) => v === 'true'),
};
function verifyExpectedArgs(args) {
    var _a;
    if (!args.owner) {
        throw new Error('Owner from context or args cannot be inferred, but is required');
    }
    if (!args.projectNumber) {
        throw new Error('Project number is required for a single issue update');
    }
    if (!args.githubToken) {
        throw new Error('GitHub token is required for authentication');
    }
    if (((_a = args.issueNumber) === null || _a === void 0 ? void 0 : _a.length) && args.all) {
        throw new Error('Either "issueNumber" or "all" should be specified at once');
    }
}
function tryGetOwnerFromContext() {
    const DEFAULT_OWNER_ORG = 'elastic';
    try {
        // Might throw if the context is not available
        return github_1.context.repo.owner;
    }
    catch (error) {
        return DEFAULT_OWNER_ORG;
    }
}
function combineAndVerifyArgs(argsFromActionInputs, argsFromCli) {
    const defaults = {
        owner: tryGetOwnerFromContext(),
        issueNumber: [],
    };
    const combinedArgs = (0, utils_1.merge)((0, utils_1.merge)(defaults, argsFromActionInputs), argsFromCli);
    verifyExpectedArgs(combinedArgs);
    return combinedArgs;
}
(0, mapLabelsToAttributes_1.mapLabelsToAttributes)(combineAndVerifyArgs(argsFromActionInputs, parsedCliArgs))
    .then(async (results) => {
    await (0, utils_1.sleep)(1000); // Wait for the last log to flush
    const { success, failure, skipped, projectUrl } = results;
    if (failure.length) {
        console.warn('Some issues failed to update:', failure);
    }
    else {
        console.log('All issues updated successfully.');
    }
    console.log(`Updated ${success.length} issues in project ${projectUrl} (${skipped.length} skipped)`);
    success.forEach((issue) => console.log(`\t- ${(0, utils_1.getIssueLinks)(projectUrl, issue)}`));
    process.exit(0);
})
    .catch((error) => {
    console.error(error);
    core.setFailed(error.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map