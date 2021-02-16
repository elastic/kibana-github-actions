"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommentFromResponse = void 0;
const rest_1 = require("@octokit/rest");
exports.getCommentFromResponse = (pullNumber, backportResponse) => {
    const hasAnySuccessful = !!backportResponse.results.find((r) => r.success);
    const header = backportResponse.success ? '## 💚 Backport successful' : '## 💔 Backport failed';
    const detailsList = backportResponse.results
        .map((result) => {
        if (result.success) {
            return `✅ [${result.targetBranch}](${result.pullRequestUrl}) / ${result.pullRequestUrl}`;
        }
        return `❌ ${result.targetBranch}: ${result.errorMessage}`;
    })
        .join('\n');
    const generalErrorMessage = 'errorMessage' in backportResponse
        ? `The backport operation could not be completed due to the following error:\n${backportResponse.errorMessage}`
        : '';
    const helpParts = [];
    if (hasAnySuccessful) {
        helpParts.push('Successful backport PRs will be merged automatically after passing CI.');
    }
    if (!backportResponse.success) {
        helpParts.push([
            'To backport manually, check out the target branch and run:',
            `\`node scripts/backport --pr ${pullNumber}\``,
        ].join('\n'));
    }
    const helpMessage = helpParts.join('\n\n');
    return [header, detailsList, generalErrorMessage, helpMessage].filter((m) => m).join('\n\n');
};
async function createStatusComment(options) {
    const { accessToken, repoOwner, repoName, pullNumber, backportResponse } = options;
    const octokit = new rest_1.Octokit({
        auth: accessToken,
    });
    return octokit.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body: exports.getCommentFromResponse(pullNumber, backportResponse),
    });
}
exports.default = createStatusComment;
//# sourceMappingURL=createStatusComment.js.map