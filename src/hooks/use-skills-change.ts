/**
 * Use Skills Change Hook
 *
 * React hook for listening to skill directory changes.
 * Uses file system watching to detect when skills are added/modified/removed.
 */

import { watch, FSWatcher } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Skill change event types
 */
export type SkillChangeType = 'added' | 'modified' | 'removed';

/**
 * Skill change event
 */
export interface SkillChangeEvent {
  type: SkillChangeType;
  skillName: string;
  skillPath: string;
  timestamp: number;
}

/**
 * Skills directory state
 */
export interface SkillsDirectoryState {
  /** List of discovered skills */
  skills: string[];
  /** Whether directory is being watched */
  isWatching: boolean;
  /** Last scan timestamp */
  lastScanTime: number;
}

/**
 * Options for useSkillsChange hook
 */
export interface UseSkillsChangeOptions {
  /** Skills directory path */
  skillsDir: string;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** File extensions to watch (default: ['.md']) */
  extensions?: string[];
  /** Whether to scan on mount (default: true) */
  scanOnMount?: boolean;
  /** Whether to recursive watch subdirectories (default: false) */
  recursive?: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Partial<UseSkillsChangeOptions> = {
  debounceMs: 300,
  extensions: ['.md'],
  scanOnMount: true,
  recursive: false,
};

/**
 * Hook for watching skill directory changes
 *
 * @param options - Configuration options
 * @param onChange - Callback for skill changes
 * @returns Skills directory state and controls
 */
export function useSkillsChange(
  options: UseSkillsChangeOptions,
  onChange?: (event: SkillChangeEvent) => void
): SkillsDirectoryState & {
  /** Trigger a manual rescan */
  rescan: () => Promise<void>;
  /** Start watching for changes */
  startWatching: () => void;
  /** Stop watching for changes */
  stopWatching: () => void;
} {
  const { skillsDir, debounceMs, extensions, scanOnMount, recursive } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const [skills, setSkills] = useState<string[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);

  const watcherRef = useRef<FSWatcher | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSkillsRef = useRef<Set<string>>(new Set());

  /**
   * Scan directory for skills
   */
  const scanDirectory = useCallback(async (): Promise<string[]> => {
    try {
      const discoveredSkills: string[] = [];
      const files = await readdir(skillsDir, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const ext = extname(file.name).toLowerCase();
          if (extensions!.includes(ext)) {
            const skillName = file.name.replace(ext, '');
            discoveredSkills.push(skillName);
          }
        } else if (file.isDirectory() && recursive) {
          // Recursively scan subdirectories
          const subDir = join(skillsDir, file.name);
          try {
            const subFiles = await readdir(subDir);
            for (const subFile of subFiles) {
              const subExt = extname(subFile).toLowerCase();
              if (extensions!.includes(subExt)) {
                const skillName = `${file.name}/${subFile.replace(subExt, '')}`;
                discoveredSkills.push(skillName);
              }
            }
          } catch {
            // Skip inaccessible directories
          }
        }
      }

      return discoveredSkills;
    } catch {
      return [];
    }
  }, [skillsDir, extensions, recursive]);

  /**
   * Detect changes between old and new skill lists
   */
  const detectChanges = useCallback(async (
    oldSkills: Set<string>,
    forceRescan = false
  ): Promise<void> => {
    const newSkills = forceRescan ? await scanDirectory() : (await scanDirectory()).filter((s: string) => !oldSkills.has(s) || forceRescan);

    // If forceRescan, compare with previous
    const allSkills = forceRescan ? await scanDirectory() : Array.from(new Set([...oldSkills, ...newSkills]));

    for (const skill of allSkills) {
      const wasAdded = !oldSkills.has(skill);
      const wasRemoved = !newSkills.includes(skill) && forceRescan;

      if (wasAdded) {
        onChange?.({
          type: 'added',
          skillName: skill,
          skillPath: join(skillsDir, `${skill}.md`),
          timestamp: Date.now(),
        });
      } else if (wasRemoved) {
        onChange?.({
          type: 'removed',
          skillName: skill,
          skillPath: join(skillsDir, `${skill}.md`),
          timestamp: Date.now(),
        });
      }
    }

    setSkills(await scanDirectory());
    previousSkillsRef.current = new Set(await scanDirectory());
    setLastScanTime(Date.now());
  }, [scanDirectory, onChange, skillsDir]);

  /**
   * Debounced handler for file changes
   */
  const handleFileChange = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      await detectChanges(previousSkillsRef.current);
    }, debounceMs);
  }, [debounceMs, detectChanges]);

  /**
   * Start watching for file changes
   */
  const startWatching = useCallback(() => {
    if (watcherRef.current) return;

    try {
      watcherRef.current = watch(skillsDir, { recursive }, (eventType, filename) => {
        if (filename) {
          const ext = extname(filename).toLowerCase();
          if (extensions!.includes(ext)) {
            handleFileChange();
          }
        }
      });

      watcherRef.current.on('error', () => {
        // Watcher error, stop watching
        stopWatching();
      });

      setIsWatching(true);
    } catch {
      // Failed to start watching
    }
  }, [skillsDir, recursive, extensions, handleFileChange]);

  /**
   * Stop watching for file changes
   */
  const stopWatching = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.close();
      watcherRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsWatching(false);
  }, []);

  /**
   * Trigger a manual rescan
   */
  const rescan = useCallback(async () => {
    const oldSkills = previousSkillsRef.current;
    const currentSkills = await scanDirectory();

    // Compare and emit change events
    for (const skill of currentSkills) {
      if (!oldSkills.has(skill)) {
        onChange?.({
          type: 'added',
          skillName: skill,
          skillPath: join(skillsDir, `${skill}.md`),
          timestamp: Date.now(),
        });
      }
    }

    for (const skill of oldSkills) {
      if (!currentSkills.includes(skill)) {
        onChange?.({
          type: 'removed',
          skillName: skill,
          skillPath: join(skillsDir, `${skill}.md`),
          timestamp: Date.now(),
        });
      }
    }

    previousSkillsRef.current = new Set(currentSkills);
    setSkills(currentSkills);
    setLastScanTime(Date.now());
  }, [scanDirectory, onChange, skillsDir]);

  // Initial scan and watching
  useEffect(() => {
    if (scanOnMount) {
      scanDirectory().then((skills: string[]) => {
        setSkills(skills);
        previousSkillsRef.current = new Set(skills);
        setLastScanTime(Date.now());
      });
      startWatching();
    }

    return () => {
      stopWatching();
    };
  }, [scanOnMount, scanDirectory, startWatching, stopWatching]);

  return {
    skills,
    isWatching,
    lastScanTime,
    rescan,
    startWatching,
    stopWatching,
  };
}

/**
 * Hook for detecting skill changes with debounce
 * Simpler API for common use cases.
 *
 * @param skillsDir - Directory containing skills
 * @param onSkillsChange - Callback with new skill list
 * @param debounceMs - Debounce delay (default: 300)
 */
export function useSkillsList(
  skillsDir: string,
  onSkillsChange: (skills: string[]) => void,
  debounceMs = 300
): string[] {
  const [skills, setSkills] = useState<string[]>([]);

  const { rescan, stopWatching } = useSkillsChange(
    {
      skillsDir,
      debounceMs,
      scanOnMount: true,
    },
    () => {
      // Just trigger rescan, the state update will notify via onSkillsChange
    }
  );

  useEffect(() => {
    onSkillsChange(skills);
  }, [skills, onSkillsChange]);

  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  return skills;
}

// ============================================================================
// Non-React Utilities
// ============================================================================

/**
 * Create a skills change watcher (non-React)
 *
 * @param skillsDir - Directory to watch
 * @param callbacks - Change callbacks
 * @returns Watcher control object
 */
export function createSkillsWatcher(
  skillsDir: string,
  callbacks: {
    onAdded?: (skillName: string, skillPath: string) => void;
    onRemoved?: (skillName: string, skillPath: string) => void;
    onChanged?: (skillName: string, skillPath: string) => void;
  }
) {
  let watcher: FSWatcher | null = null;
  const skills = new Set<string>();

  const scan = async (): Promise<string[]> => {
    try {
      const files = await readdir(skillsDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  };

  const checkForChanges = async (): Promise<void> => {
    const current = new Set(await scan());

    // Find added skills
    for (const skill of current) {
      if (!skills.has(skill)) {
        callbacks.onAdded?.(skill, join(skillsDir, `${skill}.md`));
      }
    }

    // Find removed skills
    for (const skill of skills) {
      if (!current.has(skill)) {
        callbacks.onRemoved?.(skill, join(skillsDir, `${skill}.md`));
      }
    }

    skills.clear();
    current.forEach(s => skills.add(s));
  };

  return {
    /**
     * Start watching for changes
     */
    start: async (): Promise<void> => {
      const initialSkills = await scan();
      initialSkills.forEach(s => skills.add(s));

      watcher = watch(skillsDir, (eventType, filename) => {
        if (filename?.endsWith('.md')) {
          setTimeout(checkForChanges, 100);
        }
      });
    },

    /**
     * Stop watching
     */
    stop: (): void => {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },

    /**
     * Rescan and return current skills
     */
    rescan: async (): Promise<string[]> => {
      await checkForChanges();
      return Array.from(skills);
    },
  };
}
