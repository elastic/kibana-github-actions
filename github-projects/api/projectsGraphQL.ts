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
    issueStartCursor?: string | null;
  },
) => {
  const { issueCount = 20, issueFieldCount = 10, labelsCount = 10 } = limitOptions || {};

  console.log(
    `Fetching ${Math.max(findIssueNumbers?.length, issueCount)} issues for project ${projectNumber}...`,
  );

  const results: ProjectIssuesResponse['organization']['projectV2']['items']['nodes'] = [];
  let issueStartCursor = limitOptions?.issueStartCursor || null;
  let nextPageExists = true;

  const findIssueNumbersSet = new Set(findIssueNumbers);

  while (nextPageExists) {
    const startCursor = issueStartCursor ? `"${issueStartCursor}"` : null; // null is needed for first page, but it cannot be a string
    const batchSize = Math.min(issueCount, MAX_BATCH_SIZE);
    const query = `
query {
  organization(login: "${owner}") {
    projectV2(number: ${projectNumber}) {
      items(first: ${batchSize}, after: ${startCursor}, orderBy: { field: POSITION, direction: DESC }) {
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
    results.push(...responseIssues);

    responseIssues.forEach((issue) => {
      if (findIssueNumbersSet.has(issue.content.number)) {
        findIssueNumbersSet.delete(issue.content.number);
      }
    });

    if (findIssueNumbers.length && findIssueNumbersSet.size === 0) {
      console.log('Found all filtered issues');
      break;
    } else if (results.length >= issueCount) {
      console.log('Fetched enough issues');
      break;
    } else if (responseItems.pageInfo?.hasNextPage) {
      console.log(`Fetched ${results.length} of ${issueCount} issues, fetching more...`);
      nextPageExists = true;
      if (nextPageExists) {
        issueStartCursor = responseItems.pageInfo?.endCursor || null;
      }
      console.log('Fetching more issues...');
    } else {
      console.log('No more issues to fetch');
      nextPageExists = false;
    }
  }

  return results.slice(0, issueCount);
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
