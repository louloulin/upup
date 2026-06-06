import { describe, test, expect, beforeEach } from 'bun:test';
import { SkillScheduler } from './scheduler.js';

describe('SkillScheduler', () => {
  let scheduler: SkillScheduler;

  beforeEach(() => {
    scheduler = new SkillScheduler({ checkIntervalMs: 10 });
  });

  test('schedule creates an entry', () => {
    const entry = scheduler.schedule('stock-analysis', 60000, 'AAPL');
    expect(entry.id).toBeTruthy();
    expect(entry.skillName).toBe('stock-analysis');
    expect(entry.intervalMs).toBe(60000);
    expect(entry.args).toBe('AAPL');
    expect(entry.enabled).toBe(true);
    expect(entry.nextRunAt).toBeGreaterThan(0);
  });

  test('list returns all schedules', () => {
    scheduler.schedule('a', 60000);
    scheduler.schedule('b', 120000);
    expect(scheduler.list()).toHaveLength(2);
  });

  test('get returns specific schedule', () => {
    const entry = scheduler.schedule('a', 60000);
    expect(scheduler.get(entry.id)).toBe(entry);
  });

  test('unschedule removes entry', () => {
    const entry = scheduler.schedule('a', 60000);
    expect(scheduler.unschedule(entry.id)).toBe(true);
    expect(scheduler.get(entry.id)).toBeUndefined();
    expect(scheduler.list()).toHaveLength(0);
  });

  test('enable/disable toggles schedule', () => {
    const entry = scheduler.schedule('a', 60000);
    scheduler.disable(entry.id);
    const disabled = scheduler.get(entry.id)!;
    expect(disabled.enabled).toBe(false);
    expect(disabled.nextRunAt).toBeNull();

    scheduler.enable(entry.id);
    const enabled = scheduler.get(entry.id)!;
    expect(enabled.enabled).toBe(true);
    expect(enabled.nextRunAt).toBeGreaterThan(0);
  });

  test('getBySkill returns matching schedules', () => {
    scheduler.schedule('a', 60000);
    scheduler.schedule('b', 60000);
    scheduler.schedule('a', 120000);
    expect(scheduler.getBySkill('a')).toHaveLength(2);
    expect(scheduler.getBySkill('b')).toHaveLength(1);
  });

  test('size returns count', () => {
    expect(scheduler.size()).toBe(0);
    scheduler.schedule('a', 60000);
    expect(scheduler.size()).toBe(1);
  });

  test('clear removes all', () => {
    scheduler.schedule('a', 60000);
    scheduler.schedule('b', 60000);
    scheduler.clear();
    expect(scheduler.size()).toBe(0);
  });

  test('executor is called on tick when schedule is due', async () => {
    const executed: string[] = [];
    scheduler.setExecutor(async (name, args) => {
      executed.push(`${name}:${args ?? 'no-args'}`);
    });

    // Schedule with past nextRunAt to trigger immediate execution
    const entry = scheduler.schedule('test-skill', 60000, 'arg1');
    // Force nextRunAt to the past
    entry.nextRunAt = Date.now() - 1;

    // Start scheduler and wait for tick
    scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    scheduler.stop();

    expect(executed.length).toBeGreaterThan(0);
    expect(executed[0]).toBe('test-skill:arg1');
  });

  test('disabled schedule is not executed', async () => {
    const executed: string[] = [];
    scheduler.setExecutor(async (name) => {
      executed.push(name);
    });

    const entry = scheduler.schedule('test', 60000);
    entry.nextRunAt = Date.now() - 1;
    scheduler.disable(entry.id);

    scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    scheduler.stop();

    expect(executed).toHaveLength(0);
  });

  test('runCount increments after execution', async () => {
    scheduler.setExecutor(async () => {});

    const entry = scheduler.schedule('test', 60000);
    entry.nextRunAt = Date.now() - 1;

    scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    scheduler.stop();

    expect(entry.runCount).toBeGreaterThan(0);
    expect(entry.lastRunAt).toBeGreaterThan(0);
  });

  test('emits scheduled event', () => {
    let emitted = false;
    scheduler.on('scheduled', () => { emitted = true; });
    scheduler.schedule('test', 60000);
    expect(emitted).toBe(true);
  });

  test('emits unscheduled event', () => {
    let emitted = false;
    scheduler.on('unscheduled', () => { emitted = true; });
    const entry = scheduler.schedule('test', 60000);
    scheduler.unschedule(entry.id);
    expect(emitted).toBe(true);
  });
});
