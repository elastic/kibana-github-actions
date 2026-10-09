"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIssueLinks = getIssueLinks;
exports.sleep = sleep;
exports.merge = merge;
const url_1 = require("url");
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function merge(target, source) {
    const merged = { ...target };
    Object.keys(source).forEach((key) => {
        if (source[key] !== undefined) {
            merged[key] = source[key];
        }
    });
    return merged;
}
//# sourceMappingURL=utils.js.map