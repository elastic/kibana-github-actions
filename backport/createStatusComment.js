"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommentFromResponse = void 0;
const rest_1 = require("@octokit/rest");
exports.getCommentFromResponse = (pullNumber, backportCommandTemplate, backportResponse, repoOwner, repoName) => {
    const hasAnySuccessful = backportResponse.results.some((r) => r.success);
    const hasAllSuccessful = backportResponse.results.every((r) => r.success);
    const header = backportResponse.success ? '## 💚 Backport successful' : '## 💔 Backport failed';
    const tableHeader = `| Status | Branch | Result |\n|:------:|:------:|:------:|`;
    const tableBody = backportResponse.results
        .map((result) => {
        var _a;
        // this is gross - `result` should include the pullNumber
        const backportPullNumber = (_a = result.pullRequestUrl) === null || _a === void 0 ? void 0 : _a.split('/')[6];
        if (result.success) {
            return `| ✅ |  [${result.targetBranch}](${result.pullRequestUrl})  | [<img src="https://img.shields.io/github/pulls/detail/state/${repoOwner}/${repoName}/${backportPullNumber}">](${result.pullRequestUrl}) |`;
        }
        return `| ❌ |  ${result.targetBranch}  | ${result.errorMessage} |`;
    })
        .join('\n');
    const table = tableHeader + tableBody;
    const generalErrorMessage = 'errorMessage' in backportResponse
        ? `The backport operation could not be completed due to the following error:\n${backportResponse.errorMessage}`
        : '';
    const helpParts = [];
    if (hasAllSuccessful) {
        if (backportResponse.results.length === 1) {
            helpParts.push('This backport PR will be merged automatically after passing CI.');
        }
        else {
            helpParts.push('The backport PRs will be merged automatically after passing CI.');
        }
    }
    else if (hasAnySuccessful) {
        helpParts.push('Successful backport PRs will be merged automatically after passing CI.');
    }
    if (!backportResponse.success) {
        helpParts.push([
            'To backport manually run:',
            `\`${backportCommandTemplate.replace('%pullNumber%', pullNumber.toString())}\``,
        ].join('\n'));
    }
    const helpMessage = helpParts.join('\n\n');
    return [header, table, generalErrorMessage, helpMessage].filter((m) => m).join('\n\n');
};
async function createStatusComment(options) {
    const { accessToken, repoOwner, repoName, pullNumber, backportCommandTemplate, backportResponse } = options;
    const octokit = new rest_1.Octokit({
        auth: accessToken,
    });
    return octokit.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body: exports.getCommentFromResponse(pullNumber, backportCommandTemplate, backportResponse, repoOwner, repoName),
    });
}
exports.default = createStatusComment;
//# sourceMappingURL=createStatusComment.js.map