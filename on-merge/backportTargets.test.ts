import { expect } from 'chai';
import { resolveTargets } from './backportTargets';
import { VersionsParsed } from './versions';

describe('backportTargets', () => {
  const mockVersions: VersionsParsed = {
    current: { branch: '8.4', version: '8.4.1', branchType: 'development' },
    all: [
      { branch: 'main', version: '9.2.1', branchType: 'development' },
      { branch: '9.1', version: '9.1.11', branchType: 'release' },
      { branch: '8.3', version: '8.3.15', branchType: 'release' },
      { branch: '7.x', version: '7.17.2', branchType: 'unmaintained' },
    ],
  };

  const mockVersionMap = {
    '^v9.2.0': 'main',
    '^v7.17.2$': '7.x',
    '^v(\\d+).(\\d+).\\d+$': '$1.$2',
  };

  describe('resolveTargets', () => {
    it('should return empty array when no backport labels are present', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['none']);
      expect(branches).to.eql([]);
    });

    it('should resolve backport:all-open to all non-development branches', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:all-open']);
      expect(branches).to.eql(['8.3', '9.1']);
    });

    it('should resolve version labels to their corresponding branches', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['v7.17.2', 'backport:version']);
      expect(branches).to.eql(['7.x']);
    });

    it('should handle multiple version labels', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, [
        'v8.4.1',
        'v7.17.2',
        'backport:version',
      ]);
      expect(branches).to.eql(['7.x', '8.4']);
    });

    it('should ignore main branch versions', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['v9.2.0', 'backport:version']);
      expect(branches).to.eql([]);
    });

    it('should return empty array when backport:skip is present', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['v8.4.1', 'backport:skip']);
      expect(branches).to.eql([]);
    });
  });
});
