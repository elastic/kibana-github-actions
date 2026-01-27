/**
 * Jest-based integration tests for mapLabelsToAttributes
 * Testing the override option functionality
 */

import { jest } from '@jest/globals';
import * as fs from 'fs';
import { mapLabelsToAttributes } from './mapLabelsToAttributes';

jest.mock('../api/projectsGraphQL', () => ({
  gqlGetProject: jest.fn(),
  gqlGetIssuesForProject: jest.fn(),
  gqlGetFieldOptions: jest.fn(),
  gqlUpdateFieldValue: jest.fn(),
}));

jest.mock('fs');

import {
  gqlGetProject,
  gqlGetIssuesForProject,
  gqlGetFieldOptions,
  gqlUpdateFieldValue,
} from '../api/projectsGraphQL';

const mockGqlGetProject = gqlGetProject as jest.MockedFunction<typeof gqlGetProject>;
const mockGqlGetIssuesForProject = gqlGetIssuesForProject as jest.MockedFunction<
  typeof gqlGetIssuesForProject
>;
const mockGqlGetFieldOptions = gqlGetFieldOptions as jest.MockedFunction<typeof gqlGetFieldOptions>;
const mockGqlUpdateFieldValue = gqlUpdateFieldValue as jest.MockedFunction<typeof gqlUpdateFieldValue>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('mapLabelsToAttributes', () => {
  const baseArgs = {
    issueNumber: [123],
    projectNumber: 1,
    owner: 'test-owner',
    repo: 'test-repo',
    mapping: 'test-mapping.json',
    all: false,
    dryRun: false,
    githubToken: 'test-token',
  };

  const mockProject = {
    id: 'project-id-123',
    url: 'https://github.com/orgs/test-owner/projects/1',
    fields: {
      nodes: [],
    },
  };

  const mockFieldOptions = {
    organization: {
      projectV2: {
        fields: {
          nodes: [
            {
              __typename: 'ProjectV2SingleSelectField',
              id: 'field-id-size',
              name: 'Size',
              options: [
                { id: 'option-small', name: 'Small' },
                { id: 'option-medium', name: 'Medium' },
                { id: 'option-large', name: 'Large' },
              ],
            },
            {
              __typename: 'ProjectV2SingleSelectField',
              id: 'field-id-priority',
              name: 'Priority',
              options: [
                { id: 'option-low', name: 'Low' },
                { id: 'option-high', name: 'High' },
              ],
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockGqlGetProject.mockResolvedValue(mockProject);
    mockGqlGetFieldOptions.mockResolvedValue(mockFieldOptions);
    mockGqlUpdateFieldValue.mockResolvedValue({
      clientMutationId: 'mutation-id',
      projectV2Item: {
        id: 'item-id',
        fieldValueByName: {
          name: 'Size',
          optionId: 'option-small',
        },
      },
    });
  });

  describe('when override is false or not specified', () => {
    it('should NOT update field if it already has a value', async () => {
      // Setup: Issue with existing Size field set to "Medium"
      const issuesWithExistingField = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Size' },
                name: 'Medium',
                optionId: 'option-medium',
              },
            ],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }],
            },
          },
        },
      ];

      // Mapping without override flag (defaults to false)
      const mappingContent = JSON.stringify({
        'size:small': {
          Size: 'Small',
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithExistingField);

      const result = await mapLabelsToAttributes(baseArgs);

      // Should NOT call update because field already exists
      expect(mockGqlUpdateFieldValue).not.toHaveBeenCalled();
      expect(result.skipped).toHaveLength(1);
      expect(result.success).toHaveLength(0);
    });

    it('should update field if it does not have a value yet', async () => {
      // Setup: Issue without existing Size field
      const issuesWithoutField = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }],
            },
          },
        },
      ];

      const mappingContent = JSON.stringify({
        'size:small': {
          Size: 'Small',
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithoutField);

      const result = await mapLabelsToAttributes(baseArgs);

      // Should call update because field doesn't exist
      expect(mockGqlUpdateFieldValue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-id-123',
          itemId: 'item-id-123',
          fieldId: 'field-id-size',
          optionId: 'option-small',
          fieldName: 'Size',
        }),
      );
      expect(result.success).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);
    });
  });

  describe('when override is explicitly set to false', () => {
    it('should NOT update field if it already has a value', async () => {
      const issuesWithExistingField = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Size' },
                name: 'Large',
                optionId: 'option-large',
              },
            ],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }],
            },
          },
        },
      ];

      // Mapping with override explicitly set to false
      const mappingContent = JSON.stringify({
        'size:small': {
          Size: { value: 'Small', override: false },
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithExistingField);

      const result = await mapLabelsToAttributes(baseArgs);

      expect(mockGqlUpdateFieldValue).not.toHaveBeenCalled();
      expect(result.skipped).toHaveLength(1);
      expect(result.success).toHaveLength(0);
    });
  });

  describe('when override is set to true', () => {
    it('should update field even if it already has a value', async () => {
      const issuesWithExistingField = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Size' },
                name: 'Large',
                optionId: 'option-large',
              },
            ],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }],
            },
          },
        },
      ];

      // Mapping with override set to true
      const mappingContent = JSON.stringify({
        'size:small': {
          Size: { value: 'Small', override: true },
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithExistingField);

      const result = await mapLabelsToAttributes(baseArgs);

      // Should call update despite field already existing
      expect(mockGqlUpdateFieldValue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-id-123',
          itemId: 'item-id-123',
          fieldId: 'field-id-size',
          optionId: 'option-small',
          fieldName: 'Size',
        }),
      );
      expect(result.success).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);
    });

    it('should update field when it does not have a value yet', async () => {
      const issuesWithoutField = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }],
            },
          },
        },
      ];

      const mappingContent = JSON.stringify({
        'size:small': {
          Size: { value: 'Small', override: true },
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithoutField);

      const result = await mapLabelsToAttributes(baseArgs);

      expect(mockGqlUpdateFieldValue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-id-123',
          itemId: 'item-id-123',
          fieldId: 'field-id-size',
          optionId: 'option-small',
          fieldName: 'Size',
        }),
      );
      expect(result.success).toHaveLength(1);
    });
  });

  describe('mixed configuration scenarios', () => {
    it('should handle multiple labels with different override settings', async () => {
      const issuesWithExistingFields = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Size' },
                name: 'Large',
                optionId: 'option-large',
              },
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Priority' },
                name: 'Low',
                optionId: 'option-low',
              },
            ],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }, { name: 'priority:high' }],
            },
          },
        },
      ];

      // Size has override: true, Priority has override: false
      const mappingContent = JSON.stringify({
        'size:small': {
          Size: { value: 'Small', override: true },
        },
        'priority:high': {
          Priority: { value: 'High', override: false },
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithExistingFields);

      const result = await mapLabelsToAttributes(baseArgs);

      // Should only update Size (because override: true), not Priority
      expect(mockGqlUpdateFieldValue).toHaveBeenCalledTimes(1);
      expect(mockGqlUpdateFieldValue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fieldName: 'Size',
          optionId: 'option-small',
        }),
      );

      // Should have one success (Size updated)
      expect(result.success).toHaveLength(1);
    });

    it('should handle string value format (legacy) alongside object format with override', async () => {
      const issuesWithMixedFields = [
        {
          __typename: 'ProjectV2Item',
          id: 'item-id-123',
          fullDatabaseId: 123,
          fieldValues: {
            nodes: [
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                field: { name: 'Priority' },
                name: 'Low',
                optionId: 'option-low',
              },
            ],
          },
          content: {
            __typename: 'Issue',
            id: 'issue-id-123',
            number: 123,
            title: 'Test Issue',
            url: 'https://github.com/test-owner/test-repo/issues/123',
            resourcePath: '/test-owner/test-repo/issues/123',
            repository: {
              name: 'test-repo',
              owner: { id: 'owner-id' },
            },
            labels: {
              nodes: [{ name: 'size:small' }, { name: 'priority:high' }],
            },
          },
        },
      ];

      // Size uses string format (legacy), Priority uses object format
      const mappingContent = JSON.stringify({
        'size:small': {
          Size: 'Small', // string format
        },
        'priority:high': {
          Priority: { value: 'High', override: true }, // object format
        },
      });

      mockReadFileSync.mockReturnValue(mappingContent);
      mockGqlGetIssuesForProject.mockResolvedValue(issuesWithMixedFields);

      const result = await mapLabelsToAttributes(baseArgs);

      // Should update both: Size (no existing field) and Priority (override: true)
      expect(mockGqlUpdateFieldValue).toHaveBeenCalledTimes(2);
      expect(result.success).toHaveLength(1);
    });
  });
});
