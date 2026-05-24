/**
 * Bundled Skills Index
 * 
 * 导出所有专业Skills
 */

import { dreamSkill } from './dream.js';
export { dreamSkill };
export const registerDreamSkill = () => dreamSkill;

import { verifySkill } from './verify.js';
export { verifySkill };
export const registerVerifySkill = () => verifySkill;

import { hunterSkill } from './hunter.js';
export { hunterSkill };
export const registerHunterSkill = () => hunterSkill;

import { batchSkill } from './batch.js';
export { batchSkill };
export const registerBatchSkill = () => batchSkill;

/**
 * 获取所有专业Skills
 */
export function getAllSpecializedSkills() {
  return [
    registerDreamSkill(),
    registerVerifySkill(),
    registerHunterSkill(),
    registerBatchSkill(),
  ];
}
