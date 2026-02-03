export interface Version {
  version: string;
  branch: string;
  branchType?: 'development' | 'release' | 'unmaintained';
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

export function parseVersions(versionsFile: Versions): VersionsParsed {
  const currentVersion = versionsFile.versions.find((v) => v.branch === 'main');

  if (!currentVersion) {
    throw new Error("Couldn't determine current version (no main branch found)");
  }

  const parsed: VersionsParsed = {
    current: currentVersion,
    all: versionsFile.versions,
  };

  return parsed;
}
