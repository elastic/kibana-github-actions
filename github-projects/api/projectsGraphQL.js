"use strict";
// Using reference: https://docs.github.com/en/graphql/reference/objects
Object.defineProperty(exports, "__esModule", { value: true });
exports.gqlUpdateFieldValue = exports.gqlGetFieldOptions = exports.gqlGetIssuesForProject = exports.gqlGetProject = void 0;
const MAX_BATCH_SIZE = 100;
const gqlGetProject = async (octokit, { projectNumber, owner }) => {
    const query = `query{
        organization(login: "${owner}"){
          projectV2(number: ${projectNumber}){
            id
            url
            title
          }
        }
      }
    `;
    return (await octokit.graphql(query)).organization.projectV2;
};
exports.gqlGetProject = gqlGetProject;
const gqlGetIssuesForProject = async (octokit, { projectNumber, findIssueNumbers = [], owner, }, limitOptions) => {
    var _a, _b;
    const { issueCount = 20, issueFieldCount = 10, labelsCount = 10 } = limitOptions || {};
    const results = [];
    let issueStartCursor = (limitOptions === null || limitOptions === void 0 ? void 0 : limitOptions.issueStartCursor) || null;
    let nextPageExists = true;
    const findIssueNumbersSet = new Set(findIssueNumbers);
    while (nextPageExists) {
        const startCursor = issueStartCursor ? `"${issueStartCursor}"` : null; // null is needed for first page, but it cannot be a string
        const query = `query{
        organization(login: "${owner}"){
          projectV2(number: ${projectNumber}){
            items(first: ${Math.min(issueCount, MAX_BATCH_SIZE)}, after: ${startCursor}) {
              pageInfo {
                endCursor
                hasNextPage
              }
              nodes {
                __typename
                id
                fieldValues(first: ${issueFieldCount}) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      __typename
                      name
                      optionId
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                    }
                  }
                }
                fullDatabaseId
                content {
                  __typename
                  ... on Issue {
                    id
                    number
                    title
                    resourcePath
                    url
                    repository {
                      name
                      owner {
                        id
                      }
                    }
                    labels(first: ${labelsCount}) {
                      nodes {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
        const responseItems = (await octokit.graphql(query)).organization.projectV2.items;
        const responseIssues = responseItems.nodes.filter((i) => { var _a; return ((_a = i.content) === null || _a === void 0 ? void 0 : _a.__typename) === 'Issue'; });
        results.push(...responseIssues);
        responseIssues.forEach((issue) => {
            if (findIssueNumbersSet.has(issue.content.number)) {
                findIssueNumbersSet.delete(issue.content.number);
            }
        });
        if (findIssueNumbers.length && findIssueNumbersSet.size === 0) {
            console.log('Found all filtered issues');
            break;
        }
        else if (results.length >= issueCount) {
            console.log('Fetched enough issues');
            break;
        }
        else if ((_a = responseItems.pageInfo) === null || _a === void 0 ? void 0 : _a.hasNextPage) {
            nextPageExists = true;
            if (nextPageExists) {
                issueStartCursor = ((_b = responseItems.pageInfo) === null || _b === void 0 ? void 0 : _b.endCursor) || null;
            }
            console.log('Fetching more issues...');
        }
        else {
            console.log('No more issues to fetch');
            nextPageExists = false;
        }
    }
    return results.slice(0, issueCount);
};
exports.gqlGetIssuesForProject = gqlGetIssuesForProject;
const gqlGetFieldOptions = (octokit, { projectNumber, owner }, limitOptions) => {
    const { fieldCount = 10 } = limitOptions || {};
    return octokit.graphql(`query {
    organization(login: "${owner}") {
      projectV2(number: ${projectNumber}) {
        fields(first: ${fieldCount}) {
          nodes {
            __typename
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }`);
};
exports.gqlGetFieldOptions = gqlGetFieldOptions;
const gqlUpdateFieldValue = async (octokit, { projectId, fieldId, itemId, optionId, fieldName }) => {
    const mutation = `mutation{
      updateProjectV2ItemFieldValue(input: {itemId: "${itemId}", fieldId: "${fieldId}", projectId: "${projectId}", value: { singleSelectOptionId: "${optionId}" }}) {
        clientMutationId
        projectV2Item {
          id
          fieldValueByName(name: "${fieldName}") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
              optionId
            }
          }
        }
      }
    }`;
    return octokit.graphql(mutation);
};
exports.gqlUpdateFieldValue = gqlUpdateFieldValue;
//# sourceMappingURL=projectsGraphQL.js.map