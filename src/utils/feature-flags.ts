/**
 * Feature Flags - Claude Code-style feature flag system
 *
 * Provides:
 * - Environment variable based feature flags
 * - Default values for all features
 * - Type-safe flag accessors
 *
 * Reference: Loucode's src/lib/feature-flags.ts
 */

// ============================================================================
// Feature Flag Types
// ============================================================================

/**
 * Feature flag types
 */
export type FeatureFlagType = 'boolean' | 'number' | 'string';

/**
 * Feature flag definition
 */
export interface FeatureFlag<T = boolean | number | string> {
  /** Flag name */
  name: string;
  /** Flag type */
  type: FeatureFlagType;
  /** Default value */
  defaultValue: T;
  /** Environment variable name */
  envVar: string;
  /** Description */
  description: string;
}

/**
 * Feature flag value types by name
 */
export interface FeatureFlagValues {
  // Memory extraction flags
  'dexter_memory_extraction': boolean;       // Enable memory extraction
  'dexter_auto_dream': boolean;              // Enable AutoDream consolidation
  'dexter_session_memory': boolean;          // Enable session memory
  'dexter_team_memory': boolean;             // Enable team memory sync
  'dexter_extraction_throttle': number;      // Turns between extractions
  'dexter_max_memories_per_extraction': number;

  // AutoDream flags
  'dexter_auto_dream_min_hours': number;     // Minimum hours between dreams
  'dexter_auto_dream_min_sessions': number;  // Minimum sessions between dreams
  'dexter_auto_dream_max_memories': number;  // Max memories to consolidate

  // Session memory flags
  'dexter_session_memory_budget': number;    // Token budget for session memory
  'dexter_session_memory_init_threshold': number; // Messages before first update

  // Hook flags
  'dexter_stop_hooks_enabled': boolean;      // Master switch for stop hooks
  'dexter_memory_extraction_hook': boolean;   // Memory extraction hook
  'dexter_session_memory_hook': boolean;      // Session memory hook

  // Debug flags
  'dexter_debug_memory': boolean;            // Debug memory operations
  'dexter_debug_hooks': boolean;              // Debug hook execution
}

// ============================================================================
// Feature Flag Definitions
// ============================================================================

const FEATURE_FLAG_DEFINITIONS: FeatureFlag[] = [
  // Memory extraction
  {
    name: 'dexter_memory_extraction',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_MEMORY_EXTRACTION',
    description: 'Enable automatic memory extraction after turns',
  },
  {
    name: 'dexter_auto_dream',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_AUTO_DREAM',
    description: 'Enable automatic dream consolidation',
  },
  {
    name: 'dexter_session_memory',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_SESSION_MEMORY',
    description: 'Enable session memory tracking',
  },
  {
    name: 'dexter_team_memory',
    type: 'boolean',
    defaultValue: false,
    envVar: 'DEXTER_TEAM_MEMORY',
    description: 'Enable team memory synchronization',
  },
  {
    name: 'dexter_extraction_throttle',
    type: 'number',
    defaultValue: 5,
    envVar: 'DEXTER_EXTRACTION_THROTTLE',
    description: 'Minimum turns between memory extractions',
  },
  {
    name: 'dexter_max_memories_per_extraction',
    type: 'number',
    defaultValue: 3,
    envVar: 'DEXTER_MAX_MEMORIES_PER_EXTRACTION',
    description: 'Maximum memories to extract per turn',
  },

  // AutoDream
  {
    name: 'dexter_auto_dream_min_hours',
    type: 'number',
    defaultValue: 24,
    envVar: 'DEXTER_AUTO_DREAM_MIN_HOURS',
    description: 'Minimum hours between AutoDream consolidations',
  },
  {
    name: 'dexter_auto_dream_min_sessions',
    type: 'number',
    defaultValue: 5,
    envVar: 'DEXTER_AUTO_DREAM_MIN_SESSIONS',
    description: 'Minimum sessions between AutoDream consolidations',
  },
  {
    name: 'dexter_auto_dream_max_memories',
    type: 'number',
    defaultValue: 20,
    envVar: 'DEXTER_AUTO_DREAM_MAX_MEMORIES',
    description: 'Maximum memories to process in one AutoDream',
  },

  // Session memory
  {
    name: 'dexter_session_memory_budget',
    type: 'number',
    defaultValue: 12000,
    envVar: 'DEXTER_SESSION_MEMORY_BUDGET',
    description: 'Token budget for session memory',
  },
  {
    name: 'dexter_session_memory_init_threshold',
    type: 'number',
    defaultValue: 10,
    envVar: 'DEXTER_SESSION_MEMORY_INIT_THRESHOLD',
    description: 'Messages before first session memory update',
  },

  // Hooks
  {
    name: 'dexter_stop_hooks_enabled',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_STOP_HOOKS_ENABLED',
    description: 'Master switch for all stop hooks',
  },
  {
    name: 'dexter_memory_extraction_hook',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_MEMORY_EXTRACTION_HOOK',
    description: 'Enable memory extraction stop hook',
  },
  {
    name: 'dexter_session_memory_hook',
    type: 'boolean',
    defaultValue: true,
    envVar: 'DEXTER_SESSION_MEMORY_HOOK',
    description: 'Enable session memory stop hook',
  },

  // Debug
  {
    name: 'dexter_debug_memory',
    type: 'boolean',
    defaultValue: false,
    envVar: 'DEXTER_DEBUG_MEMORY',
    description: 'Enable memory operation debugging',
  },
  {
    name: 'dexter_debug_hooks',
    type: 'boolean',
    defaultValue: false,
    envVar: 'DEXTER_DEBUG_HOOKS',
    description: 'Enable hook execution debugging',
  },
];

// ============================================================================
// Flag Accessors
// ============================================================================

/**
 * Get environment variable value
 */
function getEnvValue(envVar: string): string | undefined {
  return process.env[envVar];
}

/**
 * Parse environment variable value to the correct type
 */
function parseEnvValue(value: string | undefined, type: FeatureFlagType): boolean | number | string | undefined {
  if (value === undefined) {
    return undefined;
  }

  switch (type) {
    case 'boolean':
      if (value === '1' || value === 'true' || value === 'yes') return true;
      if (value === '0' || value === 'false' || value === 'no') return false;
      return undefined;
    case 'number':
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    case 'string':
      return value;
  }
}

/**
 * Get a boolean feature flag value
 */
export function isFeatureEnabled(flagName: string): boolean {
  const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);
  if (!flag) {
    return false;
  }

  // Environment variable takes precedence
  const envValue = parseEnvValue(getEnvValue(flag.envVar), 'boolean') as boolean | undefined;
  if (envValue !== undefined) {
    return envValue;
  }

  // Return default
  return Boolean(flag.defaultValue);
}

/**
 * Get a boolean feature flag value (alias for isFeatureEnabled)
 */
export function getFeatureFlag(flagName: string): boolean {
  return isFeatureEnabled(flagName);
}

/**
 * Get a number feature flag value
 */
export function getFeatureNumber(flagName: string): number {
  const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);
  if (!flag) {
    return 0;
  }

  // Environment variable takes precedence
  const envValue = parseEnvValue(getEnvValue(flag.envVar), 'number') as number | undefined;
  if (envValue !== undefined) {
    return envValue;
  }

  // Return default
  return Number(flag.defaultValue);
}

/**
 * Get a string feature flag value
 */
export function getFeatureString(flagName: string): string {
  const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);
  if (!flag) {
    return '';
  }

  // Environment variable takes precedence
  const envValue = parseEnvValue(getEnvValue(flag.envVar), 'string') as string | undefined;
  if (envValue !== undefined) {
    return envValue;
  }

  // Return default
  return String(flag.defaultValue);
}

/**
 * Get all feature flags as an object
 */
export function getAllFeatureFlags(): Record<string, boolean | number | string> {
  const flags: Record<string, boolean | number | string> = {};

  for (const flag of FEATURE_FLAG_DEFINITIONS) {
    switch (flag.type) {
      case 'boolean':
        flags[flag.name] = isFeatureEnabled(flag.name);
        break;
      case 'number':
        flags[flag.name] = getFeatureNumber(flag.name);
        break;
      case 'string':
        flags[flag.name] = getFeatureString(flag.name);
        break;
    }
  }

  return flags;
}

// ============================================================================
// Flag Configuration
// ============================================================================

/**
 * Feature flag configuration
 */
export interface FeatureFlagConfig {
  /** Override specific flags */
  overrides?: Partial<Record<string, boolean | number | string>>;
  /** Disable all flags */
  disableAll?: boolean;
}

/**
 * Get effective flag value with optional override
 */
export function getEffectiveFlag(
  flagName: string,
  config?: FeatureFlagConfig
): boolean | number | string {
  // Check if all disabled
  if (config?.disableAll) {
    const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);
    return flag?.defaultValue ?? false;
  }

  // Check override
  if (config?.overrides && flagName in config.overrides) {
    return config.overrides[flagName]!;
  }

  // Return default
  const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);
  return flag?.defaultValue ?? false;
}

// ============================================================================
// Flag Registration (for dynamic flags)
// ============================================================================

const dynamicFlags: FeatureFlag[] = [];

/**
 * Register a dynamic feature flag
 */
export function registerFeatureFlag<T extends boolean | number | string>(
  flag: FeatureFlag<T>
): void {
  // Check if already exists
  const existing = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flag.name);
  if (existing) {
    // Update existing
    Object.assign(existing, flag);
  } else {
    FEATURE_FLAG_DEFINITIONS.push(flag);
    dynamicFlags.push(flag);
  }
}

/**
 * Get all registered flags including dynamic ones
 */
export function getAllRegisteredFlags(): FeatureFlag[] {
  return [...FEATURE_FLAG_DEFINITIONS];
}

/**
 * Check if a flag is registered
 */
export function isFlagRegistered(flagName: string): boolean {
  return FEATURE_FLAG_DEFINITIONS.some(f => f.name === flagName);
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Get flag status for debugging
 */
export function getFlagStatus(flagName: string): {
  registered: boolean;
  defaultValue: boolean | number | string | undefined;
  envValue: string | undefined;
  effectiveValue: boolean | number | string;
} {
  const flag = FEATURE_FLAG_DEFINITIONS.find(f => f.name === flagName);

  if (!flag) {
    return {
      registered: false,
      defaultValue: undefined,
      envValue: undefined,
      effectiveValue: false,
    };
  }

  return {
    registered: true,
    defaultValue: flag.defaultValue,
    envValue: getEnvValue(flag.envVar),
    effectiveValue: getEffectiveFlag(flagName),
  };
}

/**
 * Print all flags to console (for debugging)
 */
export function printFeatureFlags(): void {
  console.log('\n📋 Feature Flags Status\n' + '─'.repeat(50));

  for (const flag of FEATURE_FLAG_DEFINITIONS) {
    const status = getFlagStatus(flag.name);
    const statusIcon = status.envValue !== undefined ? '🔧' : '📦';
    const value = status.effectiveValue;

    console.log(
      `${statusIcon} ${flag.name}: ${value} (${flag.type})`
    );
    console.log(`   └─ ${flag.description}`);
    if (status.envValue !== undefined) {
      console.log(`   └─ env: ${flag.envVar}=${status.envValue}`);
    }
  }

  console.log('─'.repeat(50) + '\n');
}
