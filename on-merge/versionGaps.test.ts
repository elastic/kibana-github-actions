import { expect } from 'chai';
import { getMissingReleaseVersionLabels, getVersionGapComment } from './versionGaps';
import { VersionsParsed } from './versions';

const versions: VersionsParsed = {
  current: { branch: 'main', version: '9.6.0', branchType: 'development' },
  all: [
    { branch: 'main', version: '9.6.0', branchType: 'development' },
    { branch: '9.5', version: '9.5.5', branchType: 'release' },
    { branch: '9.4', version: '9.4.8', branchType: 'release' },
    { branch: '8.19', version: '8.19.23', branchType: 'release' },
    { branch: '8.18', version: '8.18.7', branchType: 'release' },
    { branch: '7.17', version: '7.17.30', branchType: 'unmaintained' },
  ],
};

describe('getMissingReleaseVersionLabels', () => {
  it('fills the release branch between an older backport label and main', () => {
    const labels = getMissingReleaseVersionLabels(versions, ['backport:version', 'v9.4.4', 'v9.6.0']);
    expect(labels).to.eql(['v9.5.5']);
  });

  it('does not treat main’s version label as a backport floor', () => {
    const labels = getMissingReleaseVersionLabels(versions, ['backport:version', 'v9.6.0']);
    expect(labels).to.eql([]);
  });

  it('does not add a minor that is already labeled', () => {
    const labels = getMissingReleaseVersionLabels(versions, ['v9.4.4', 'v9.5.1', 'v9.6.0']);
    expect(labels).to.eql([]);
  });

  it('fills a higher release branch of an older major, and does not cross into the next major', () => {
    const labels = getMissingReleaseVersionLabels(versions, ['v8.18.2']);
    expect(labels).to.eql(['v8.19.23']);
  });

  it('does not add unmaintained branches', () => {
    const labels = getMissingReleaseVersionLabels(versions, ['v7.17.1']);
    expect(labels).to.eql([]);
  });
});

describe('getVersionGapComment', () => {
  it('names the branches that were not backported', () => {
    const comment = getVersionGapComment(['v9.5.5']);
    expect(comment).to.contain('- v9.5.5');
    expect(comment).to.contain('were not part of this backport');
  });
});
