import { expect } from 'chai';
import { getVersionLabelsToAdd, getCommentFromLabels } from './fixGaps';

const MOCK_CONFIG = {
  branchLabelMapping: {
    '^v8.0.0$': 'master',
    '^v7.15.0$': '7.x',
  },
};

const prMock = (...versions: string[]) => {
  return {
    labels: versions.map((version) => ({ name: version })),
  } as any;
};

describe('fixGaps', () => {
  describe('getVersionLabelsToAdd', () => {
    it('should return one missing labels', () => {
      const labels = getVersionLabelsToAdd(MOCK_CONFIG, prMock('v7.14.0'));
      expect(labels).to.eql(['v7.15.0']);
    });

    it('should return two missing labels', () => {
      const labels = getVersionLabelsToAdd(MOCK_CONFIG, prMock('v7.13.3', 'v7.12.3'));
      expect(labels).to.eql(['v7.14.0', 'v7.15.0']);
    });

    it('should return no missing labels', () => {
      const labels = getVersionLabelsToAdd(MOCK_CONFIG, prMock('v7.15.0', 'v8.0.0'));
      expect(labels).to.eql([]);
    });
  });

  describe('getCommentFromLabels', () => {
    it('should return a comment for 1 label', () => {
      const comment = getCommentFromLabels(['v7.15.0']);
      expect(comment).to.eql(
        [
          'The following labels were identified as gaps in your version labels and will be added automatically:',
          '- v7.15.0',
          '',
          'If any of these should not be on your pull request, please manually remove them.',
        ].join('\n'),
      );
    });

    it('should return a comment for 3 labels', () => {
      const comment = getCommentFromLabels(['v7.15.0', 'v7.14.0', 'v7.13.0']);
      expect(comment).to.eql(
        [
          'The following labels were identified as gaps in your version labels and will be added automatically:',
          '- v7.15.0',
          '- v7.14.0',
          '- v7.13.0',
          '',
          'If any of these should not be on your pull request, please manually remove them.',
        ].join('\n'),
      );
    });
  });
});
