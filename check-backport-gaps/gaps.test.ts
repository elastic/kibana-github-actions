import { expect } from 'chai';
import {
  alreadyNotified,
  backportSearchQuery,
  branchFromTag,
  gapComment,
  isCommitOnBranch,
  isoDateDaysAgo,
  olderSameMajorReleaseBranches,
  pullsMissingFromTarget,
  releaseTarget,
  sourcePullNumberFromTitle,
  VersionsFile,
} from './gaps';

const versions: VersionsFile = {
  versions: [
    { version: '9.6.0', branch: 'main', branchType: 'development' },
    { version: '9.5.5', branch: '9.5', branchType: 'release' },
    { version: '9.4.8', branch: '9.4', branchType: 'release' },
    { version: '8.19.23', branch: '8.19', branchType: 'release' },
    { version: '8.18.7', branch: '8.18', branchType: 'release' },
    { version: '7.17.30', branch: '7.17', branchType: 'unmaintained' },
  ],
};

describe('branchFromTag', () => {
  it('maps a release tag to its minor branch', () => {
    expect(branchFromTag('v9.5.4')).to.equal('9.5');
  });

  it('returns null for a non-release tag', () => {
    expect(branchFromTag('main')).to.equal(null);
  });
});

describe('releaseTarget', () => {
  it('accepts a release branch', () => {
    expect(releaseTarget(versions, '9.5')).to.eql({ branch: '9.5', major: 9, minor: 5 });
  });

  it('rejects main', () => {
    expect(releaseTarget(versions, 'main')).to.equal(null);
  });
});

describe('olderSameMajorReleaseBranches', () => {
  it('returns older minors of the same major only', () => {
    expect(olderSameMajorReleaseBranches(versions, { major: 9, minor: 5 })).to.eql([
      { branch: '9.4', minor: 4 },
    ]);
  });
});

describe('sourcePullNumberFromTitle', () => {
  it('uses the last pull number, which is the source PR', () => {
    expect(
      sourcePullNumberFromTitle('[9.4] [Synthetics] Fix private location creation (#275709) (#277098)'),
    ).to.equal(277098);
  });

  it('returns null when the title has no pull number', () => {
    expect(sourcePullNumberFromTitle('[9.4] Fix private locations')).to.equal(null);
  });
});

describe('pullsMissingFromTarget', () => {
  it('drops PRs already backported to the target and keeps the closest older branch', () => {
    const missing = pullsMissingFromTarget(
      [
        { sourcePullNumber: 10, olderBranch: '9.3', olderMinor: 3, backportPullNumber: 100 },
        { sourcePullNumber: 10, olderBranch: '9.4', olderMinor: 4, backportPullNumber: 101 },
        { sourcePullNumber: 11, olderBranch: '9.4', olderMinor: 4, backportPullNumber: 102 },
      ],
      new Set([11]),
    );
    expect(missing).to.eql([
      { sourcePullNumber: 10, olderBranch: '9.4', olderMinor: 4, backportPullNumber: 101 },
    ]);
  });
});

describe('isCommitOnBranch', () => {
  it('treats a compare with nothing ahead as already on the branch', () => {
    expect(isCommitOnBranch(0)).to.equal(true);
    expect(isCommitOnBranch(2)).to.equal(false);
  });
});

describe('alreadyNotified', () => {
  it('matches the hidden marker for this branch only', () => {
    const body = gapComment({ targetBranch: '9.5', olderBranch: '9.4', backportPullNumber: 277656 });
    expect(alreadyNotified([body], '9.5')).to.equal(true);
    expect(alreadyNotified([body], '9.4')).to.equal(false);
  });
});

describe('backportSearchQuery', () => {
  it('limits the scan to merged backport PRs on that branch', () => {
    expect(backportSearchQuery('elastic/kibana', '9.4', '2026-04-01')).to.equal(
      'repo:elastic/kibana is:pr is:merged base:9.4 label:backport merged:>=2026-04-01',
    );
  });
});

describe('isoDateDaysAgo', () => {
  it('formats a UTC date', () => {
    expect(isoDateDaysAgo(1, new Date('2026-09-28T12:00:00Z'))).to.equal('2026-09-27');
  });
});
