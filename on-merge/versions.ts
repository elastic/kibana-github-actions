export interface Version {
  version: string;
  branch: string;
  branchType: 'development' | 'release' | 'unmaintained';
}

export interface Versions {
  versions: Version[];
}

export interface VersionBranch {
  version: string;
  branch: string;
}

export interface VersionsParsed {
  current: Version;
  all: Version[];
}

export interface VersionMap {
  [regex: string]: string;
}

export function parseVersions(versions: Versions): VersionsParsed {
  const parsed: VersionsParsed = {
    current: versions.versions.find((v) => v.branchType === 'development')!,
    all: versions.versions,
  };

  return parsed;
}
