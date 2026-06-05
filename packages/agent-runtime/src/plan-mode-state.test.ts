/**
 * Tests for Plan Mode State Manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  PlanModeStateManager,
  getPlanModeState,
  resetPlanModeState,
} from './plan-mode-state.js';

describe('PlanModeStateManager', () => {
  let manager: PlanModeStateManager;

  beforeEach(() => {
    resetPlanModeState();
    manager = new PlanModeStateManager();
  });

  afterEach(() => {
    resetPlanModeState();
  });

  describe('initial state', () => {
    it('starts inactive', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('allows all tools when inactive', () => {
      expect(manager.isToolAllowed('read_file')).toBe(true);
      expect(manager.isToolAllowed('write_file')).toBe(true);
      expect(manager.isToolAllowed('web_search')).toBe(true);
    });
  });

  describe('enter/exit', () => {
    it('enters plan mode', () => {
      manager.enter('plan-123');
      expect(manager.isActive()).toBe(true);
      expect(manager.getPlanId()).toBe('plan-123');
    });

    it('exits plan mode', () => {
      manager.enter('plan-123');
      manager.exit();
      expect(manager.isActive()).toBe(false);
      expect(manager.getPlanId()).toBe(undefined);
    });

    it('enters without plan ID', () => {
      manager.enter();
      expect(manager.isActive()).toBe(true);
      expect(manager.getPlanId()).toBe(undefined);
    });
  });

  describe('tool blocking in plan mode', () => {
    it('allows plan tools in plan mode', () => {
      manager.enter('plan-1');
      expect(manager.isToolAllowed('enter_plan_mode')).toBe(true);
      expect(manager.isToolAllowed('exit_plan_mode')).toBe(true);
      expect(manager.isToolAllowed('add_plan_step')).toBe(true);
      expect(manager.isToolAllowed('update_plan_step')).toBe(true);
      expect(manager.isToolAllowed('list_plan_steps')).toBe(true);
      expect(manager.isToolAllowed('get_plan')).toBe(true);
    });

    it('blocks non-plan tools in plan mode', () => {
      manager.enter('plan-1');
      expect(manager.isToolAllowed('read_file')).toBe(false);
      expect(manager.isToolAllowed('write_file')).toBe(false);
      expect(manager.isToolAllowed('web_search')).toBe(false);
      expect(manager.isToolAllowed('bash')).toBe(false);
    });

    it('allows all tools when not in plan mode', () => {
      expect(manager.isToolAllowed('read_file')).toBe(true);
      expect(manager.isToolAllowed('write_file')).toBe(true);
    });
  });

  describe('getBlockedMessage', () => {
    it('returns helpful message for blocked tool', () => {
      manager.enter('plan-1');
      const msg = manager.getBlockedMessage('read_file');
      expect(msg).toContain('read_file');
      expect(msg).toContain('blocked during plan mode');
      expect(msg).toContain('exit_plan_mode');
    });
  });

  describe('allowTool/disallowTool', () => {
    it('adds custom tool to allowed list', () => {
      manager.enter('plan-1');
      expect(manager.isToolAllowed('custom_tool')).toBe(false);

      manager.allowTool('custom_tool');
      expect(manager.isToolAllowed('custom_tool')).toBe(true);
    });

    it('removes tool from allowed list', () => {
      manager.enter('plan-1');
      expect(manager.isToolAllowed('add_plan_step')).toBe(true);

      manager.disallowTool('add_plan_step');
      expect(manager.isToolAllowed('add_plan_step')).toBe(false);
    });
  });

  describe('getState', () => {
    it('returns current state', () => {
      manager.enter('plan-1');
      const state = manager.getState();

      expect(state.active).toBe(true);
      expect(state.planId).toBe('plan-1');
      expect(state.allowedTools).toBeInstanceOf(Set);
    });
  });

  describe('reset', () => {
    it('resets to initial state', () => {
      manager.enter('plan-1');
      manager.allowTool('custom');

      manager.reset();

      expect(manager.isActive()).toBe(false);
      expect(manager.getPlanId()).toBe(undefined);
    });
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      const instance1 = getPlanModeState();
      const instance2 = getPlanModeState();
      expect(instance1).toBe(instance2);
    });

    it('resets singleton', () => {
      const instance1 = getPlanModeState();
      resetPlanModeState();
      const instance2 = getPlanModeState();
      expect(instance1).not.toBe(instance2);
    });
  });
});
