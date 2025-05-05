import { URL, URLSearchParams } from 'url';
import type { IssueNode } from '../api/projectsGraphQL';

export function getIssueLinks(projectUrl: string, issue: IssueNode) {
  const issueBodyUrl = issue.content.url;

  const search = new URLSearchParams();
  search.set('pane', 'issue');
  search.set('itemId', issue.fullDatabaseId.toString());
  search.set('issue', issue.content.resourcePath);
  const issueRef = new URL(projectUrl);
  issueRef.search = search.toString();

  return `${issueBodyUrl} | ${issueRef}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function merge<T extends object>(target: Partial<T>, source: Partial<T>): Partial<T> {
  const merged = { ...target };
  (Object.keys(source) as Array<keyof T>).forEach((key) => {
    if (source[key] !== undefined) {
      merged[key] = source[key];
    }
  });
  return merged;
}
