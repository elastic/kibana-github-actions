import { expect } from 'chai';
import { getPrBackportData, labelsContain, getVersionLabel, ArtifactsApiVersions } from './util';

describe('util', () => {
  describe('getPrBackportData', () => {
    it('should return null when body has no backport data', () => {
      expect(getPrBackportData('')).to.eql(null);
    });

    it('should parse backport data from body', () => {
      const body = `
      body
      
      <!--BACKPORT [{"author":{"name":"Brian Seeders","email":"brian.seeders@elastic.co"},"sourceCommit":{"committedDate":"2022-06-30T14:46:47Z","message":"[CI] Install global npm modules with a retry and failsafe (#135437)","sha":"82b5d8e120c9eeb5c589966ade1beeebd1fa22ab","branchLabelMapping":{"^v8.4.0$":"main","^v(\\\\d+).(\\\\d+).\\\\d+$":"$1.$2"}},"sourcePullRequest":{"labels":["Team:Operations","release_note:skip","Feature:CI","v8.4.0","v8.3.1","backport:prev-minor"],"number":135437,"url":"https://github.com/elastic/kibana/pull/135437","mergeCommit":{"message":"[CI] Install global npm modules with a retry and failsafe (#135437)","sha":"82b5d8e120c9eeb5c589966ade1beeebd1fa22ab"}},"sourceBranch":"main","suggestedTargetBranches":[],"targetPullRequestStates":[{"branch":"main","label":"v8.4.0","labelRegex":"^v8.4.0$","isSourceBranch":true,"state":"MERGED","url":"https://github.com/elastic/kibana/pull/135437","number":135437,"mergeCommit":{"message":"[CI] Install global npm modules with a retry and failsafe (#135437)","sha":"82b5d8e120c9eeb5c589966ade1beeebd1fa22ab"}},{"branch":"8.3","label":"v8.3.1","labelRegex":"^v(\\\\d+).(\\\\d+).\\\\d+$","isSourceBranch":false,"url":"https://github.com/elastic/kibana/pull/135563","number":135563,"state":"MERGED","mergeCommit":{"sha":"e6f38c7b2473bad12e70a584408469bfa1d4f2ef","message":"[CI] Install global npm modules with a retry and failsafe (#135437) (#135563)\\n\\n(cherry picked from commit 82b5d8e120c9eeb5c589966ade1beeebd1fa22ab)\\n\\nCo-authored-by: Brian Seeders <brian.seeders@elastic.co>"}}]}] BACKPORT-->
      `;

      const data = getPrBackportData(body);
      expect(data?.[0].sourcePullRequest?.number).to.eql(135437);
    });
  });

  describe('labelsContain', () => {
    it('should return true when label exists', () => {
      expect(labelsContain([{ name: 'test' }, { name: 'test-2' }], 'test-2')).to.eql(true);
    });

    it('should return false when label does not exist', () => {
      expect(labelsContain([{ name: 'test' }, { name: 'test-2' }], 'test-3')).to.eql(false);
    });
  });

  describe('getVersionLabel', () => {
    const mockVersions = { versions: ['1.0.0', '1.0.1-SNAPSHOT'] } as any as ArtifactsApiVersions;

    it('should not increment version for a snapshot version', () => {
      expect(getVersionLabel(mockVersions, '1.0.1')).to.eql('v1.0.1');
    });

    it('should not increment version for a missing version', () => {
      expect(getVersionLabel(mockVersions, '5.0.0')).to.eql('v5.0.0');
    });

    it('should increment version for a snapshot version', () => {
      expect(getVersionLabel(mockVersions, '1.0.0')).to.eql('v1.0.1');
    });
  });
});
