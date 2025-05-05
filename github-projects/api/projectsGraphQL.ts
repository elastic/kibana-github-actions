// Using reference: https://docs.github.com/en/graphql/reference/objects

import { Octokit } from '@octokit/rest';

const MAX_BATCH_SIZE = 100;

type GraphQLNodes<T> = {
  pageInfo?: {
    endCursor: string;
    hasNextPage: boolean;
  };
  nodes: T[];
};

export type ProjectWithFieldsResponse = {
  organization: {
    projectV2: {
      id: string;
      url: string;
      fields: GraphQLNodes<{
        __typename: string;
        name: string;
      }>;
    };
  };
};

export type FieldUpdateResult = {
  clientMutationId: string;
  projectV2Item: {
    id: string;
    fieldValueByName: {
      name: string;
      optionId: string;
    };
  };
};

export type IssueNode = {
  __typename: string;
  id: string;
  fullDatabaseId: number;
  fieldValues: GraphQLNodes<{
    __typename: string;
    field: {
      name: string;
    };
    name: string;
    optionId: string;
  }>;
  content: {
    __typename: string;
    id: string;
    number: number;
    title: string;
    url: string;
    resourcePath: string;
    repository: {
      name: string;
      owner: {
        id: string;
      };
    };
    labels: GraphQLNodes<{
      name: string;
    }>;
  };
};

export type ProjectIssuesResponse = {
  organization: {
    projectV2: {
      items: GraphQLNodes<IssueNode>;
    };
  };
};

export type SingleSelectField = { id: string; name: string; options: { id: string; name: string }[] };

export type FieldOptions = {
  organization: {
    projectV2: {
      fields: {
        nodes: Array<
          SingleSelectField & {
            __typename: string;
          }
        >;
      };
    };
  };
};

export type UpdateFieldParams = {
  projectId: string;
  fieldId: string;
  itemId: string;
  optionId: string;
  fieldName: string;
};

export const gqlGetProject = async (
  octokit: Octokit,
  { projectNumber, owner }: { projectNumber: number; owner: string },
) => {
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
  return (await octokit.graphql<ProjectWithFieldsResponse>(query)).organization.projectV2;
};

/**
 * Fetches issues for a project.
 * In Github's graphql API, the projectV2 field has items in it, but not all of those are issues,
 * so we have to paginate through, and collect issues to satisfy the issueCount.
 * Also, the issues listing doesn't have any filtering, so we have to get pages, and filter them ourselves.
 *
 * @param octokit - The Octokit instance.
 * @param projectNumber - The project number. (e.g.: https://github.com/<owner>/<repo>/projects/<projectNumber>)
 * @param findIssueNumbers - An array of issue numbers to find.
 * @param owner - The owner of the repository.
 * @param limitOptions - Optional limit options for pagination.
 * @returns An array of issues.
 */
export const gqlGetIssuesForProject = async (
  octokit: Octokit,
  {
    projectNumber,
    findIssueNumbers = [],
    owner,
  }: { projectNumber: number; findIssueNumbers?: number[]; owner: string },
  limitOptions?: {
    issueCount?: number;
    issueFieldCount?: number;
    labelsCount?: number;
  },
) => {
  const { issueCount = 20, issueFieldCount = 10, labelsCount = 10 } = limitOptions || {};
  const findIssueNumbersSet = new Set(findIssueNumbers);

  console.log(`Fetching ${findIssueNumbers?.length || issueCount} issues for project ${projectNumber}...`);

  const results: ProjectIssuesResponse['organization']['projectV2']['items']['nodes'] = [];
  let issueStartCursor: null | string = null;
  let nextPageExists = true;
  let totalFetched = 0;

  while (nextPageExists) {
    const startCursor: null | string = issueStartCursor ? `"${issueStartCursor}"` : null; // null is needed for first page, but it cannot be a string
    const query: string = `
query {
  organization(login: "${owner}") {
    projectV2(number: ${projectNumber}) {
      items(first: ${MAX_BATCH_SIZE}, after: ${startCursor}, orderBy: { field: POSITION, direction: DESC }) {
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
}`;
    const responseItems = (await octokit.graphql<ProjectIssuesResponse>(query)).organization.projectV2.items;

    const responseIssues = responseItems.nodes.filter((i) => i.content?.__typename === 'Issue');
    totalFetched += responseIssues.length;

    responseIssues.forEach((issue) => {
      if (findIssueNumbers.length) {
        if (findIssueNumbersSet.has(issue.content.number)) {
          results.push(issue);
          findIssueNumbersSet.delete(issue.content.number);
        }
      } else {
        results.push(issue);
      }
    });

    if (findIssueNumbers.length && findIssueNumbersSet.size === 0) {
      console.log(`Found all requested ${findIssueNumbers.length} issues`);
      break;
    } else if (results.length >= issueCount) {
      console.log(`Fetched all requested ${issueCount} issues`);
      break;
    } else if (responseItems.pageInfo?.hasNextPage) {
      console.log(`Fetched ${totalFetched} of ${issueCount} issues, fetching more...`);
      nextPageExists = true;
      if (nextPageExists) {
        issueStartCursor = responseItems.pageInfo?.endCursor || null;
      }
    } else {
      console.log('No more issues to fetch');
      nextPageExists = false;
    }
  }

  return results;
};

export const gqlGetFieldOptions = (
  octokit: Octokit,
  { projectNumber, owner }: { projectNumber: number; owner: string },
  limitOptions?: {
    fieldCount?: number;
  },
) => {
  const { fieldCount = 20 } = limitOptions || {};

  return octokit.graphql<FieldOptions>(`query {
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

export const gqlUpdateFieldValue = async (
  octokit: Octokit,
  { projectId, fieldId, itemId, optionId, fieldName }: UpdateFieldParams,
) => {
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
  return octokit.graphql<FieldUpdateResult>(mutation);
};
