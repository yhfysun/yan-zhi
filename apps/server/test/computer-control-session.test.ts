import { describe, expect, it } from 'vitest';
import {
  ComputerControlCoordinator,
  ControlSessionError,
  actionRequiresConfirmation,
  assertObservationReferences,
  pickUniqueControlWindow,
} from '../src/plugins/computer-control-session.js';

const windowA = { id: 'w1', app: 'notepad.exe', pid: 101, title: '无标题 - 记事本', rect: { x: 10, y: 20, width: 800, height: 600 } };
const windowB = { id: 'w2', app: 'notepad.exe', pid: 202, title: '另一个记事本', rect: { x: 30, y: 40, width: 700, height: 500 } };

describe('computer control session state machine', () => {
  it('starts, binds one window, observes and completes one action', () => {
    const c = new ComputerControlCoordinator();
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1', now: 1_000 });
    c.bindWindow('s1', windowA, 1_100);
    c.observe('s1', {
      version: 'obs-1',
      windowId: 'w1',
      screenshotId: 'shot-1',
      refs: ['uia:1.2'],
      createdAt: 1_200,
    });

    const acting = c.beginAction('s1', 'local_write', 1_300);
    expect(acting.phase).toBe('acting');
    const receipt = c.finishAction('s1', 'ok', 1_400);
    expect(receipt.status).toBe('ok');
    expect(c.get('s1')?.phase).toBe('observing');
    expect(c.get('s1')?.observation).toBeNull();
  });

  it('rejects invalid transitions and actions without an observation', () => {
    const c = new ComputerControlCoordinator();
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1' });
    expect(() => c.beginHandoff('s1')).toThrow(ControlSessionError);
    expect(() => c.beginAction('s1', 'read')).toThrow(/observe/i);
  });

  it('rejects a second write session on the same device and expires idle sessions', () => {
    const c = new ComputerControlCoordinator({ idleTimeoutMs: 5_000 });
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1', now: 1_000 });
    expect(() => c.start({ sessionId: 's2', deviceId: 'pc', conversationId: 'c2', now: 1_100 }))
      .toThrow(/active session/i);
    expect(c.expire(6_001)).toBe(1);
    expect(c.get('s1')?.phase).toBe('ended');
    expect(() => c.start({ sessionId: 's2', deviceId: 'pc', conversationId: 'c2', now: 6_002 })).not.toThrow();
  });
});

describe('window binding and observation versions', () => {
  it('requires exactly one matching window', () => {
    expect(pickUniqueControlWindow([windowA, windowB], { pid: 101 }).id).toBe('w1');
    expect(pickUniqueControlWindow([windowA, windowB], { title: '无标题' }).id).toBe('w1');
    expect(() => pickUniqueControlWindow([windowA, windowB], { app: 'notepad.exe' })).toThrow(/2 windows/i);
    expect(() => pickUniqueControlWindow([windowA, windowB], { pid: 999 })).toThrow(/no window/i);
  });

  it('rejects stale screenshot and accessibility references', () => {
    const observation = {
      version: 'obs-1',
      windowId: 'w1',
      screenshotId: 'shot-1',
      refs: ['uia:1.2'],
      createdAt: 1,
    };
    expect(() => assertObservationReferences(observation, { version: 'obs-1', screenshotId: 'shot-1', ref: 'uia:1.2' })).not.toThrow();
    expect(() => assertObservationReferences(observation, { version: 'obs-0', screenshotId: 'shot-1' })).toThrow(/stale/i);
    expect(() => assertObservationReferences(observation, { version: 'obs-1', screenshotId: 'shot-0' })).toThrow(/screenshot/i);
    expect(() => assertObservationReferences(observation, { version: 'obs-1', ref: 'uia:9.9' })).toThrow(/reference/i);
  });

  it('serializes actions and reports unknown outcomes without an automatic retry', async () => {
    const c = new ComputerControlCoordinator();
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1' });
    c.bindWindow('s1', windowA);
    c.observe('s1', { version: 'obs-1', windowId: 'w1', screenshotId: 'shot-1', refs: [], createdAt: 1 });
    const order: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const first = c.runAction('s1', 'read', async () => {
      order.push('first-start');
      await blocked;
      order.push('first-end');
    }, async () => ({ version: 'obs-2', windowId: 'w1', screenshotId: 'shot-2', refs: [], createdAt: 2 }));
    const second = c.runAction('s1', 'read', async () => {
      order.push('second');
    }, async () => ({ version: 'obs-3', windowId: 'w1', screenshotId: 'shot-3', refs: [], createdAt: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['first-start']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('marks an action unknown when the executor throws', async () => {
    const c = new ComputerControlCoordinator();
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1' });
    c.bindWindow('s1', windowA);
    c.observe('s1', { version: 'obs-1', windowId: 'w1', screenshotId: 'shot-1', refs: [], createdAt: 1 });
    const receipt = await c.runAction('s1', 'local_write', async () => {
      throw new Error('input transport closed');
    });
    expect(receipt.status).toBe('unknown');
    expect(c.get('s1')?.phase).toBe('observing');
    expect(c.get('s1')?.observation).toBeNull();
  });
});

describe('risk and handoff rules', () => {
  it('requires confirmation for external or unknown effects', () => {
    expect(actionRequiresConfirmation('read', false)).toBe(false);
    expect(actionRequiresConfirmation('local_write', false)).toBe(false);
    expect(actionRequiresConfirmation('external_send', false)).toBe(true);
    expect(actionRequiresConfirmation('unknown', true)).toBe(true);
    expect(actionRequiresConfirmation('external_send', true)).toBe(false);
    expect(actionRequiresConfirmation('destructive', true)).toBe(false);
  });

  it('freezes actions during handoff and requires a fresh observation after return', () => {
    const c = new ComputerControlCoordinator();
    c.start({ sessionId: 's1', deviceId: 'pc', conversationId: 'c1' });
    c.bindWindow('s1', windowA);
    c.observe('s1', { version: 'obs-1', windowId: 'w1', screenshotId: 'shot-1', refs: [], createdAt: 1 });
    c.beginHandoff('s1');
    expect(() => c.beginAction('s1', 'read')).toThrow(/handoff/i);
    c.returnControl('s1');
    expect(c.get('s1')?.phase).toBe('observing');
    expect(c.get('s1')?.observation).toBeNull();
    expect(() => c.beginAction('s1', 'read')).toThrow(/observe/i);
  });
});
