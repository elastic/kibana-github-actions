import { BackportResponse } from 'backport';
import { expect } from 'chai';
import { getCommentFromResponse } from './createStatusComment';

const BACKPORT_TEMPLATE = 'node scripts/backport --pr %pullNumber%';

describe('createStatusComment', () => {
  describe('getCommentFromResponse', () => {
    it('should create a message for all successful backports', async () => {
      const comment = getCommentFromResponse(
        1,
        BACKPORT_TEMPLATE,
        {
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
        } as BackportResponse,
        'elastic',
        'kibana',
      );
      expect(comment).to.eql(
        '## 💚 Backport successful\n\n| Status | Branch | Result |\n|:------:|:------:|:------:|\n| ✅ |  [7.x](https://github.com/elastic/kibana/pull/2)  | [<img src="https://img.shields.io/github/pulls/detail/state/elastic/kibana/2">](https://github.com/elastic/kibana/pull/2) |\n| ✅ |  [7.10](https://github.com/elastic/kibana/pull/3)  | [<img src="https://img.shields.io/github/pulls/detail/state/elastic/kibana/3">](https://github.com/elastic/kibana/pull/3) |\n\nThe backport PRs will be merged automatically after passing CI.',
      );
    });

    it('should create a message for a mix of successful and failed backports', async () => {
      const comment = getCommentFromResponse(
        1,
        BACKPORT_TEMPLATE,
        {
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
        } as BackportResponse,
        'elastic',
        'kibana',
      );

      expect(comment).to.eql(
        '## 💔 Backport failed\n\n| Status | Branch | Result |\n|:------:|:------:|:------:|\n| ✅ |  [7.x](https://github.com/elastic/kibana/pull/2)  | [<img src="https://img.shields.io/github/pulls/detail/state/elastic/kibana/2">](https://github.com/elastic/kibana/pull/2) |\n| ❌ |  7.10  | There was a merge conflict |\n\nSuccessful backport PRs will be merged automatically after passing CI.\n\nTo backport manually run:\n`node scripts/backport --pr 1`',
      );
    });

    it('should create a message for a all failed backports', async () => {
      const comment = getCommentFromResponse(
        1,
        BACKPORT_TEMPLATE,
        {
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
        } as BackportResponse,
        'elastic',
        'kibana',
      );

      expect(comment).to.eql(
        '## 💔 Backport failed\n\n| Status | Branch | Result |\n|:------:|:------:|:------:|\n| ❌ |  7.x  | There was a merge conflict |\n| ❌ |  7.10  | There was a merge conflict |\n\nTo backport manually run:\n`node scripts/backport --pr 1`',
      );
    });
  });
});
