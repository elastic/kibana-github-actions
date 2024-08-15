import { expect } from 'chai';
import { resolveTargets } from './backportTargets';
import { VersionsParsed } from './versions';

let mockVersions: VersionsParsed;

describe('backportTargets', () => {
  beforeEach(() => {
    mockVersions = {
      currentMinor: { branch: 'main', version: '8.5.0', currentMajor: true, currentMinor: true },
      previousMinor: { branch: '8.4', version: '8.4.1', currentMajor: true, previousMinor: true },
      previousMajor: {
        branch: '7.17',
        version: '7.17.1',
        previousMajor: true,
      },
      others: [{ branch: '8.3', version: '8.3.15', currentMajor: true }],
      all: [],
    };

    mockVersions.all = [
      mockVersions.currentMinor,
      mockVersions.previousMinor,
      mockVersions.previousMajor,
      ...mockVersions.others,
    ];
  });

  describe('resolveTargets', () => {
    it('should resolve when no backport labels are present', () => {
      const branches = resolveTargets(mockVersions, ['none']);
      expect(branches).to.eql([]);
    });

    it('should resolve prev-minor', () => {
      const branches = resolveTargets(mockVersions, ['backport:prev-minor']);
      expect(branches).to.eql(['8.4']);
    });

    it('should resolve current-major', () => {
      const branches = resolveTargets(mockVersions, ['backport:current-major']);
      expect(branches).to.eql(['8.3', '8.4']);
    });

    it('should resolve prev-major', () => {
      const branches = resolveTargets(mockVersions, ['backport:prev-major']);
      expect(branches).to.eql(['7.17']);
    });

    it('should resolve all-open and add all branches', () => {
      const branches = resolveTargets(mockVersions, ['backport:all-open']);
      expect(branches).to.eql(['7.17', '8.3', '8.4']);
    });

    it('should resolve hard-coded version labels', () => {
      const branches = resolveTargets(mockVersions, ['v8.5.0', 'v8.4.1']);
      expect(branches).to.eql(['8.4']);
    });

    it('should resolve fill in gaps from hard-coded version labels', () => {
      const branches = resolveTargets(mockVersions, ['v7.16.0']);
      expect(branches).to.eql(['7.16', '7.17', '8.3', '8.4']);
    });

    it('should not fill in gaps from hard-coded version labels when using backport:version', () => {
      const branches = resolveTargets(mockVersions, ['backport:version', 'v7.15.0', "v8.4.5"]);
      expect(branches).to.eql(['7.15', '8.4']);
    });

    it('should resolve hard-coded version labels and target labels', () => {
      const branches = resolveTargets(mockVersions, ['backport:prev-major', 'v8.5.0', 'v8.4.1', 'v7.17.1']);
      expect(branches).to.eql(['7.17', '8.3', '8.4']);
    });

    it('should resolve multiple labels for same branch and not duplicate', () => {
      const branches = resolveTargets(mockVersions, [
        'backport:prev-major',
        'backport:prev-minor',
        'v8.5.0',
        'v8.4.1',
        'v7.17.1',
      ]);
      expect(branches).to.eql(['7.17', '8.3', '8.4']);
    });
  });
});
