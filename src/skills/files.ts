/**
 * Skill Files - Extract and manage skill-referenced files
 *
 * Allows SKILL.md files to reference additional files that should be
 * extracted to disk when the skill is executed. This is similar to
 * Claude Code's bundled skill files feature.
 *
 * Files can be referenced in SKILL.md frontmatter:
 * ```yaml
 * ---
 * name: my-skill
 * files:
 *   - template.md
 *   - config.json
 * ---
 * ```
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { BundledSkillDefinition } from '@upup/skills';

/**
 * Skill files configuration
 */
export interface SkillFilesConfig {
  /** Skill root directory */
  skillRoot: string;
  /** Files to extract (relative paths) */
  files: string[];
  /** Target directory for extracted files */
  targetDir?: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
}

/**
 * Result of file extraction
 */
export interface ExtractResult {
  /** Whether extraction was successful */
  success: boolean;
  /** Extracted file paths */
  extractedFiles: string[];
  /** Errors encountered */
  errors: string[];
}

/**
 * Extract files referenced by a skill
 *
 * @param config - Extraction configuration
 * @returns Extraction result
 */
export async function extractSkillFiles(config: SkillFilesConfig): Promise<ExtractResult> {
  const { skillRoot, files, targetDir, overwrite = false } = config;
  const extractedFiles: string[] = [];
  const errors: string[] = [];

  // Default target is skill root
  const target = targetDir || skillRoot;

  for (const file of files) {
    try {
      const sourcePath = join(skillRoot, file);
      const destPath = join(target, file);

      // Check if source exists
      if (!existsSync(sourcePath)) {
        errors.push(`File not found: ${sourcePath}`);
        continue;
      }

      // Check if destination exists and we shouldn't overwrite
      if (existsSync(destPath) && !overwrite) {
        extractedFiles.push(destPath);
        continue;
      }

      // Create parent directories if needed
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      // Read and write file
      const content = readFileSync(sourcePath, 'utf-8');
      writeFileSync(destPath, content, 'utf-8');

      extractedFiles.push(destPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract ${file}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    extractedFiles,
    errors,
  };
}

/**
 * Extract files from a bundled skill definition
 *
 * Bundled skills can include files as a Record<string, string>
 * where the key is the filename and value is the file content.
 *
 * @param skill - Bundled skill with files
 * @param targetDir - Target directory for extracted files
 * @param overwrite - Whether to overwrite existing files
 * @returns Extraction result
 */
export async function extractBundledSkillFiles(
  skill: BundledSkillDefinition,
  targetDir: string,
  overwrite = false
): Promise<ExtractResult> {
  const extractedFiles: string[] = [];
  const errors: string[] = [];

  // Bundled skill files are in skill.files
  const files = skill.files || {};

  for (const [filename, content] of Object.entries(files)) {
    try {
      const destPath = join(targetDir, filename);

      // Check if destination exists and we shouldn't overwrite
      if (existsSync(destPath) && !overwrite) {
        extractedFiles.push(destPath);
        continue;
      }

      // Create parent directories if needed
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      // Write file content
      writeFileSync(destPath, content, 'utf-8');
      extractedFiles.push(destPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to extract ${filename}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    extractedFiles,
    errors,
  };
}

/**
 * Get files referenced in a SKILL.md file
 *
 * Reads the SKILL.md frontmatter and extracts the files list.
 *
 * @param skillPath - Path to SKILL.md file
 * @returns List of file paths referenced by the skill
 */
export function getSkillReferencedFiles(skillPath: string): string[] {
  try {
    const content = readFileSync(skillPath, 'utf-8');
    const { data } = require('gray-matter')(content);

    // Support both 'files' and 'file' (singular) fields
    const files = data.files || data.file || [];

    if (typeof files === 'string') {
      return [files];
    }

    if (Array.isArray(files)) {
      return files.filter((f): f is string => typeof f === 'string');
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Extract all files referenced by a skill
 *
 * Combines file extraction from both disk-based and bundled skills.
 *
 * @param skillPath - Path to SKILL.md file (for disk-based skills)
 * @param skillRoot - Root directory of the skill
 * @param targetDir - Target directory for extraction
 * @param bundledFiles - Files from bundled skill definition
 * @param overwrite - Whether to overwrite existing files
 * @returns Extraction result
 */
export async function extractAllSkillFiles(
  skillPath: string,
  skillRoot: string,
  targetDir?: string,
  bundledFiles?: Record<string, string>,
  overwrite = false
): Promise<ExtractResult> {
  const allExtracted: string[] = [];
  const allErrors: string[] = [];

  // Extract disk-based skill files
  const diskFiles = getSkillReferencedFiles(skillPath);
  if (diskFiles.length > 0) {
    const diskResult = await extractSkillFiles({
      skillRoot,
      files: diskFiles,
      targetDir,
      overwrite,
    });
    allExtracted.push(...diskResult.extractedFiles);
    allErrors.push(...diskResult.errors);
  }

  // Extract bundled skill files
  if (bundledFiles && Object.keys(bundledFiles).length > 0) {
    const bundledResult = await extractBundledSkillFiles(
      {
        name: 'bundled',
        description: '',
        path: skillPath,
        source: 'builtin',
        instructions: '',
        files: bundledFiles,
      },
      targetDir || skillRoot,
      overwrite
    );
    allExtracted.push(...bundledResult.extractedFiles);
    allErrors.push(...bundledResult.errors);
  }

  return {
    success: allErrors.length === 0,
    extractedFiles: allExtracted,
    errors: allErrors,
  };
}

/**
 * Clean up extracted skill files
 *
 * Removes files that were extracted for a skill.
 *
 * @param files - File paths to remove
 */
export async function cleanupSkillFiles(files: string[]): Promise<void> {
  const { unlinkSync, rmSync } = await import('fs');

  for (const file of files) {
    try {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Skill files manager
 *
 * Tracks files that have been extracted for skills and handles cleanup.
 */
export class SkillFilesManager {
  private extractedFiles = new Map<string, string[]>();

  /**
   * Extract files for a skill and track them
   */
  async extract(skillName: string, config: SkillFilesConfig): Promise<ExtractResult> {
    const result = await extractSkillFiles(config);
    this.extractedFiles.set(skillName, result.extractedFiles);
    return result;
  }

  /**
   * Get files extracted for a skill
   */
  getExtracted(skillName: string): string[] {
    return this.extractedFiles.get(skillName) || [];
  }

  /**
   * Clean up files for a specific skill
   */
  async cleanup(skillName: string): Promise<void> {
    const files = this.extractedFiles.get(skillName);
    if (files) {
      await cleanupSkillFiles(files);
      this.extractedFiles.delete(skillName);
    }
  }

  /**
   * Clean up all extracted files
   */
  async cleanupAll(): Promise<void> {
    const skills = Array.from(this.extractedFiles.keys());
    for (const skill of skills) {
      await this.cleanup(skill);
    }
  }
}

// Default global manager instance
export const defaultSkillFilesManager = new SkillFilesManager();