export interface VersioningConfig {
  enabled: boolean;
  maxVersionsPerFile: number;
  maxVersionAgeDays: number;
  skipVersioningUnder: number;
  versionOnSync: boolean;
  quotaIncludesVersions: boolean;
}

export const DEFAULT_VERSIONING_CONFIG: VersioningConfig = {
  enabled: true,
  maxVersionsPerFile: 10,
  maxVersionAgeDays: 90,
  skipVersioningUnder: 10240, // don't version files < 10KB
  versionOnSync: true, // version when sync overwrites
  quotaIncludesVersions: false // versions don't count against user quota
};

export interface ConflictResolutionStrategy {
  strategy: 'keep_both' | 'last_write_wins' | 'ask_user';
  defaultStrategy: 'keep_both';
}

export const DEFAULT_CONFLICT_CONFIG: ConflictResolutionStrategy = {
  strategy: 'keep_both',
  defaultStrategy: 'keep_both'
};