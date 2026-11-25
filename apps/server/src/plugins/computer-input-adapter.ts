import type { AgentEvent } from './remote-control-agent.js';
import { RemoteControlAgent, selfProcNames } from './remote-control-agent.js';
import { assertComboAllowed } from './cu-shared.js';
import type { ControlWindow } from './computer-control-session.js';

interface ResidentAgent {
  readonly running: boolean;
  start(config: { selfNames: string[]; selfPid?: number; allowSelf: boolean }): Promise<void>;
  call(op: Record<string, unknown>, timeout?: number): Promise<AgentEvent>;
  stop(): void;
}

export interface Point {
  x: number;
  y: number;
}

export function pointInWindow(
  window: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  return x >= window.x
    && y >= window.y
    && x < window.x + window.width
    && y < window.y + window.height;
}

export function windowPointToPhysical(
  window: { x: number; y: number },
  x: number,
  y: number,
  scale: number,
): Point {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    x: Math.round(window.x + x * safeScale),
    y: Math.round(window.y + y * safeScale),
  };
}

export class ComputerInputAdapter {
  private readonly agent: ResidentAgent;
  private readonly minimumRestartMs: number;
  private lastRestartAt = 0;
  private failed = false;

  constructor(options: {
    agent?: ResidentAgent;
    minimumRestartMs?: number;
  } = {}) {
    this.agent = options.agent || new RemoteControlAgent();
    this.minimumRestartMs = Math.max(0, Number(options.minimumRestartMs) || 0);
  }

  private get running(): boolean {
    return this.agent.running;
  }

  async start(): Promise<void> {
    if (this.running) {
      this.failed = false;
      return;
    }
    await this.agent.start({
      selfNames: selfProcNames(),
      selfPid: process.pid,
      allowSelf: false,
    });
    this.failed = false;
  }

  async restart(): Promise<void> {
    const wait = this.minimumRestartMs - (Date.now() - this.lastRestartAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try { this.agent.stop(); } catch { /* already stopped */ }
    this.lastRestartAt = Date.now();
    await this.start();
  }

  stop(): void {
    try { this.agent.stop(); } catch { /* already stopped */ }
    this.failed = false;
  }

  async callRaw(op: Record<string, unknown>, timeout = 8_000): Promise<AgentEvent> {
    if (this.failed) {
      throw new Error('desktop input channel failed; restart is required before another action');
    }
    await this.start();
    let event: AgentEvent;
    try {
      event = await this.agent.call(op, timeout);
    } catch (err) {
      this.failed = true;
      throw err;
    }
    if (!event?.ok) {
      this.failed = true;
      throw new Error(String(event?.error || 'desktop input action failed'));
    }
    return event;
  }

  private assertWindowPoint(point: Point, window?: ControlWindow): void {
    if (!window?.rect) return;
    if (!pointInWindow(window.rect, point.x, point.y)) {
      throw new Error(`point (${point.x}, ${point.y}) is outside the bound target window`);
    }
  }

  async click(input: {
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle';
    double?: boolean;
    window?: ControlWindow;
  }): Promise<AgentEvent> {
    const point = { x: Math.round(Number(input.x) || 0), y: Math.round(Number(input.y) || 0) };
    this.assertWindowPoint(point, input.window);
    return this.callRaw({
      op: 'click',
      x: point.x,
      y: point.y,
      button: input.button || 'left',
      double: !!input.double,
    });
  }

  async move(input: Point & { window?: ControlWindow }): Promise<AgentEvent> {
    const point = { x: Math.round(Number(input.x) || 0), y: Math.round(Number(input.y) || 0) };
    this.assertWindowPoint(point, input.window);
    return this.callRaw({ op: 'move', x: point.x, y: point.y });
  }

  async scroll(input: {
    x: number;
    y: number;
    deltaY: number;
    window?: ControlWindow;
  }): Promise<AgentEvent> {
    const point = { x: Math.round(Number(input.x) || 0), y: Math.round(Number(input.y) || 0) };
    this.assertWindowPoint(point, input.window);
    return this.callRaw({
      op: 'wheel',
      x: point.x,
      y: point.y,
      delta: Math.max(-2_000, Math.min(2_000, Math.round(Number(input.deltaY) || -120))),
    });
  }

  async pressKey(keys: string[]): Promise<AgentEvent> {
    assertComboAllowed(keys);
    return this.callRaw({ op: 'key', keys: keys.map(String) });
  }

  async typeText(text: string): Promise<AgentEvent> {
    const value = String(text ?? '');
    if (!value) return { i: 0, ok: true };
    return this.callRaw({ op: 'type', text: value });
  }

  async drag(input: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    window?: ControlWindow;
  }): Promise<AgentEvent[]> {
    const from = { x: Math.round(Number(input.fromX) || 0), y: Math.round(Number(input.fromY) || 0) };
    const to = { x: Math.round(Number(input.toX) || 0), y: Math.round(Number(input.toY) || 0) };
    this.assertWindowPoint(from, input.window);
    this.assertWindowPoint(to, input.window);
    const events: AgentEvent[] = [];
    events.push(await this.callRaw({ op: 'down', x: from.x, y: from.y, button: 'left' }));
    try {
      events.push(await this.callRaw({
        op: 'move',
        x: Math.round((from.x + to.x) / 2),
        y: Math.round((from.y + to.y) / 2),
      }));
      events.push(await this.callRaw({ op: 'move', x: to.x, y: to.y }));
    } finally {
      events.push(await this.callRaw({ op: 'up', x: to.x, y: to.y, button: 'left' }));
    }
    return events;
  }
}
