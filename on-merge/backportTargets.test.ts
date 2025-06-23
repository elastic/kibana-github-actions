import { expect } from 'chai';
import { resolveTargets } from './backportTargets';
import { VersionsParsed, VersionMap } from './versions';

let mockVersions: VersionsParsed;
let mockVersionMap: VersionMap;

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
      all: [],
    };

    mockVersions.all = [
      mockVersions.currentMinor,
      mockVersions.previousMinor,
      mockVersions.previousMajor,
      { branch: '8.3', version: '8.3.15', currentMajor: true },
      { branch: '7.x', version: '7.17.2', previousMajor: true },
    ];

    mockVersionMap = {
      '^v8.5.0$': 'main',
      '^v7.17.2$': '7.x',
      '^v(\\d+).(\\d+).\\d+$': '$1.$2',
    };
  });

  describe('resolveTargets', () => {
    it('should resolve when no backport labels are present', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['none']);
      expect(branches).to.eql([]);
    });

    it('should resolve prev-minor', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:prev-minor']);
      expect(branches).to.eql(['8.4']);
    });

    it('should resolve current-major', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:current-major']);
      expect(branches).to.eql(['8.3', '8.4']);
    });

    it('should resolve prev-major', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:prev-major']);
      expect(branches).to.eql(['7.17', '7.x']);
    });

    it('should map versions to branches using backport:version', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:version', 'v7.17.2']);
      expect(branches).to.eql(['7.x']);
    });

    it('should map versions to branches using backport:prev-minor and fill in gaps 1', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:prev-minor', 'v8.3.0']);
      expect(branches).to.eql(['8.3', '8.4']);
    });

    it('should map versions to branches using backport:prev-minor and fill in gaps2', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:prev-minor', 'v7.17.0']);
      expect(branches).to.eql(['7.17', '7.x', '8.3', '8.4']);
    });

    it('should resolve all-open and add all branches excluding main and 7.17', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['backport:all-open']);
      expect(branches).to.eql(['7.x', '8.3', '8.4']);
    });

    it('should resolve hard-coded version labels', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['v8.5.0', 'v8.4.1']);
      expect(branches).to.eql(['8.4']);
    });

    it('should resolve fill in gaps from hard-coded version labels', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['v7.16.0']);
      expect(branches).to.eql(['7.16', '7.17', '7.x', '8.3', '8.4']);
    });

    it('should not fill in gaps from hard-coded version labels when using backport:version', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, [
        'backport:version',
        'v7.15.0',
        'v8.4.5',
      ]);
      expect(branches).to.eql(['7.15', '8.4']);
    });

    it('should not fill in gaps from hard-coded version labels when using auto-backport', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, ['auto-backport', 'v7.15.0', 'v8.4.5']);
      expect(branches).to.eql(['7.15', '8.4']);
    });

    it('should resolve hard-coded version labels and target labels', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, [
        'backport:prev-major',
        'v8.5.0',
        'v8.4.1',
        'v7.17.1',
      ]);
      expect(branches).to.eql(['7.17', '7.x', '8.3', '8.4']);
    });

    it('should resolve multiple labels for same branch and not duplicate', () => {
      const branches = resolveTargets(mockVersions, mockVersionMap, [
        'backport:prev-major',
        'backport:prev-minor',
        'v8.5.0',
        'v8.4.1',
        'v7.17.1',
      ]);
      expect(branches).to.eql(['7.17', '7.x', '8.3', '8.4']);
    });
  });
});
