import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const UPUP_DIR_NAME = '.upup';

export function getGlobalUpupDir(home = homedir()): string {
  return join(home, UPUP_DIR_NAME);
}

export function getProjectUpupDir(cwd = process.cwd()): string {
  return resolve(cwd, UPUP_DIR_NAME);
}

export function getGlobalUpupPath(...segments: string[]): string {
  return join(getGlobalUpupDir(), ...segments);
}

export function getProjectUpupPath(...segments: string[]): string {
  return join(getProjectUpupDir(), ...segments);
}
