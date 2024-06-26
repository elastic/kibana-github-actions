export interface Version {
  version: string;
  branch: string;
  currentMajor?: boolean;
  currentMinor?: boolean;
  previousMinor?: boolean;
  previousMajor?: boolean;
}

export interface Versions {
  versions: Version[];
}

export interface VersionBranch {
  version: string;
  branch: string;
}

export interface VersionsParsed {
  currentMinor: Version;
  previousMinor: Version[];
  previousMajor: Version;
  others: Version[];
  all: Version[];
}

export function parseVersions(versions: Versions): VersionsParsed {
  const currentMinor = versions.versions.find((version) => version.currentMinor);
  const previousMinor = versions.versions.filter((version) => version.previousMinor);
  const previousMajor = versions.versions.find((version) => version.previousMajor);

  if (!currentMinor) {
    throw new Error('versions.json is missing current minor version information');
  }

  if (!previousMinor) {
    throw new Error('versions.json is missing previous minor version information');
  }

  if (!previousMajor) {
    throw new Error('versions.json is missing previous major version information');
  }

  const others = versions.versions.filter(
    (version) => !version.currentMinor && !version.previousMinor && !version.previousMajor,
  );

  const parsed: VersionsParsed = {
    currentMinor,
    previousMinor,
    previousMajor,
    others,
    all: versions.versions,
  };

  return parsed;
}
