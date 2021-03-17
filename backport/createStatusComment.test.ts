import { BackportResponse } from 'backport';
import { expect } from 'chai';
import { getCommentFromResponse } from './createStatusComment';

const BACKPORT_TEMPLATE = 'node scripts/backport --pr %pullNumber%';

describe('createStatusComment', () => {
  describe('getCommentFromResponse', () => {
    it('should create a message for all successful backports', async () => {
      const comment = getCommentFromResponse(1, BACKPORT_TEMPLATE, {
        results: [
          {
            success: true,
            targetBranch: '7.x',
            pullRequestUrl: 'https://github.com/elastic/kibana/pull/2',
          },
          {
            success: true,
            targetBranch: '7.10',
            pullRequestUrl: 'https://github.com/elastic/kibana/pull/3',
          },
        ],
        success: true,
      } as BackportResponse);
      expect(comment).to.eql(
        `## 💚 Backport successful

✅ [7.x](https://github.com/elastic/kibana/pull/2) / https://github.com/elastic/kibana/pull/2
✅ [7.10](https://github.com/elastic/kibana/pull/3) / https://github.com/elastic/kibana/pull/3

The backport PRs will be merged automatically after passing CI.`,
      );
    });

    it('should create a message for a mix of successful and failed backports', async () => {
      const comment = getCommentFromResponse(1, BACKPORT_TEMPLATE, {
        results: [
          {
            success: true,
            targetBranch: '7.x',
            pullRequestUrl: 'https://github.com/elastic/kibana/pull/2',
          },
          {
            success: false,
            targetBranch: '7.10',
            errorMessage: 'There was a merge conflict',
          },
        ],
        success: false,
      } as BackportResponse);

      expect(comment).to.eql(
        `## 💔 Backport failed

✅ [7.x](https://github.com/elastic/kibana/pull/2) / https://github.com/elastic/kibana/pull/2
❌ 7.10: There was a merge conflict

The backport PRs will be merged automatically after passing CI.

To backport manually, check out the target branch and run:
\`node scripts/backport --pr 1\``,
      );
    });

    it('should create a message for a all failed backports', async () => {
      const comment = getCommentFromResponse(1, BACKPORT_TEMPLATE, {
        results: [
          {
            success: false,
            targetBranch: '7.x',
            errorMessage: 'There was a merge conflict',
          },
          {
            success: false,
            targetBranch: '7.10',
            errorMessage: 'There was a merge conflict',
          },
        ],
        success: false,
      } as BackportResponse);

      expect(comment).to.eql(
        `## 💔 Backport failed

❌ 7.x: There was a merge conflict
❌ 7.10: There was a merge conflict

To backport manually, check out the target branch and run:
\`node scripts/backport --pr 1\``,
      );
    });
  });
});
