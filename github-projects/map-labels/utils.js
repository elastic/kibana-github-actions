"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge = exports.sleep = exports.getIssueLinks = void 0;
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
exports.getIssueLinks = getIssueLinks;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.sleep = sleep;
function merge(target, source) {
    const merged = { ...target };
    Object.keys(source).forEach((key) => {
        if (source[key] !== undefined) {
            merged[key] = source[key];
        }
    });
    return merged;
}
exports.merge = merge;
//# sourceMappingURL=utils.js.map