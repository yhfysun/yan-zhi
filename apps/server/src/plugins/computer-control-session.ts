export type ControlPhase = 'idle' | 'starting' | 'observing' | 'acting' | 'blocked' | 'handoff' | 'ended';

export type ControlActionEffect =
  | 'read'
  | 'local_write'
  | 'external_send'
  | 'destructive'
  | 'financial'
  | 'security_or_auth'
  | 'unknown';

export interface ControlWindow {
  id: string;
  app: string;
  pid?: number;
  title: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface ControlObservation {
  version: string;
  windowId: string;
  screenshotId?: string;
  refs: string[];
  createdAt: number;
  captureMode?: string;
}

export interface ControlSession {
  id: string;
  deviceId: string;
  conversationId: string;
  phase: ControlPhase;
  window: ControlWindow | null;
  observation: ControlObservation | null;
  startedAt: number;
  lastActivityAt: number;
  currentEffect: ControlActionEffect | null;
  lastReceipt: ControlActionReceipt | null;
}

export interface ControlActionReceipt {
  sessionId: string;
  effect: ControlActionEffect;
  status: 'ok' | 'failed' | 'unknown';
  at: number;
  observation?: ControlObservation | null;
  error?: string;
}

export class ControlSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ControlSessionError';
  }
}

function nowOf(value?: number): number {
  return Number.isFinite(value) ? Number(value) : Date.now();
}

function ensureWindow(window: ControlWindow): ControlWindow {
  if (!window || !String(window.id || '') || !String(window.app || '')) {
    throw new ControlSessionError('invalid-window', 'window.id and window.app are required');
  }
  return { ...window, title: String(window.title || '') };
}

export function pickUniqueControlWindow(
  windows: ControlWindow[],
  query: { id?: string; app?: string; pid?: number; title?: string } = {},
): ControlWindow {
  const id = String(query.id || '');
  const app = String(query.app || '').toLowerCase();
  const title = String(query.title || '').toLowerCase();
  const matches = (Array.isArray(windows) ? windows : []).filter((window) => {
    if (id && window.id !== id) return false;
    if (app && String(window.app || '').toLowerCase() !== app) return false;
    if (query.pid != null && Number(window.pid) !== Number(query.pid)) return false;
    if (title && !String(window.title || '').toLowerCase().includes(title)) return false;
    return true;
  });
  if (matches.length === 0) {
    throw new ControlSessionError('window-not-found', 'no window matched the requested target');
  }
  if (matches.length > 1) {
    throw new ControlSessionError(
      'window-ambiguous',
      `${matches.length} windows matched the requested target`,
      { candidates: matches },
    );
  }
  return matches[0];
}

export function assertObservationReferences(
  observation: ControlObservation | null,
  query: { version?: string; screenshotId?: string; ref?: string },
): void {
  if (!observation) {
    throw new ControlSessionError('observation-required', 'reobserve the target window before acting');
  }
  if (query.version && query.version !== observation.version) {
    throw new ControlSessionError('stale-observation', 'observation version is stale; reobserve before acting');
  }
  if (query.screenshotId && query.screenshotId !== observation.screenshotId) {
    throw new ControlSessionError('stale-screenshot', 'screenshot id is stale; reobserve before acting');
  }
  if (query.ref && !observation.refs.includes(query.ref)) {
    throw new ControlSessionError('stale-reference', 'accessibility reference is stale; reobserve before acting');
  }
}

export function actionRequiresConfirmation(effect: ControlActionEffect, preapproved: boolean): boolean {
  if (effect === 'unknown') return true;
  if (effect === 'read' || effect === 'local_write') return false;
  return !preapproved;
}

export class ComputerControlCoordinator {
  private sessions = new Map<string, ControlSession>();
  private queues = new Map<string, Promise<unknown>>();
  private readonly idleTimeoutMs: number;
  private readonly onExpire?: (session: ControlSession) => void;

  constructor(options: { idleTimeoutMs?: number; onExpire?: (session: ControlSession) => void } = {}) {
    this.idleTimeoutMs = Math.max(1_000, Number(options.idleTimeoutMs) || 120_000);
    this.onExpire = options.onExpire;
  }

  start(input: {
    sessionId: string;
    deviceId: string;
    conversationId: string;
    now?: number;
  }): ControlSession {
    const sessionId = String(input.sessionId || '');
    const deviceId = String(input.deviceId || '');
    if (!sessionId || !deviceId) throw new ControlSessionError('invalid-session', 'sessionId and deviceId are required');
    for (const current of this.sessions.values()) {
      if (current.deviceId === deviceId && current.phase !== 'ended') {
        throw new ControlSessionError(
          'session-active',
          `an active session already exists for device ${deviceId}`,
          { activeSessionId: current.id },
        );
      }
    }
    const at = nowOf(input.now);
    const session: ControlSession = {
      id: sessionId,
      deviceId,
      conversationId: String(input.conversationId || ''),
      phase: 'starting',
      window: null,
      observation: null,
      startedAt: at,
      lastActivityAt: at,
      currentEffect: null,
      lastReceipt: null,
    };
    session.phase = 'observing';
    this.sessions.set(sessionId, session);
    return this.copy(session);
  }

  get(sessionId: string): ControlSession | null {
    const session = this.sessions.get(String(sessionId));
    return session ? this.copy(session) : null;
  }

  bindWindow(sessionId: string, window: ControlWindow, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (session.phase !== 'observing') this.invalid(session, 'bind-window');
    session.window = ensureWindow(window);
    session.observation = null;
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  observe(sessionId: string, observation: ControlObservation, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (session.phase !== 'observing') this.invalid(session, 'observe');
    if (!session.window) {
      throw new ControlSessionError('window-required', 'bind a target window before observing');
    }
    if (!observation || observation.windowId !== session.window.id || !observation.version) {
      throw new ControlSessionError('invalid-observation', 'observation must belong to the bound window');
    }
    session.observation = {
      ...observation,
      refs: Array.isArray(observation.refs) ? observation.refs.map(String) : [],
    };
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  beginAction(sessionId: string, effect: ControlActionEffect, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (session.phase === 'handoff') {
      throw new ControlSessionError('user-handoff', 'user handoff is active; AI input is frozen');
    }
    if (session.phase !== 'observing') this.invalid(session, 'begin-action');
    if (!session.window || !session.observation) {
      throw new ControlSessionError('observation-required', 'reobserve the target window before acting');
    }
    session.phase = 'acting';
    session.currentEffect = effect;
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  finishAction(
    sessionId: string,
    status: 'ok' | 'failed' | 'unknown',
    now?: number,
    observation: ControlObservation | null = null,
  ): ControlActionReceipt {
    const session = this.requireSession(sessionId);
    if (session.phase !== 'acting' || !session.currentEffect) this.invalid(session, 'finish-action');
    const receipt: ControlActionReceipt = {
      sessionId,
      effect: session.currentEffect,
      status,
      at: nowOf(now),
      observation,
    };
    session.lastReceipt = receipt;
    session.currentEffect = null;
    session.phase = 'observing';
    session.observation = observation || null;
    session.lastActivityAt = receipt.at;
    return receipt;
  }

  beginHandoff(sessionId: string, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (!session.window || !session.observation || !['observing', 'acting', 'blocked'].includes(session.phase)) {
      this.invalid(session, 'begin-handoff');
    }
    session.phase = 'handoff';
    session.currentEffect = null;
    session.observation = null;
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  returnControl(sessionId: string, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (session.phase !== 'handoff') this.invalid(session, 'return-control');
    session.phase = 'observing';
    session.observation = null;
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  block(sessionId: string, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    if (session.phase === 'ended') this.invalid(session, 'block');
    session.phase = 'blocked';
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  end(sessionId: string, now?: number): ControlSession {
    const session = this.requireSession(sessionId);
    session.phase = 'ended';
    session.currentEffect = null;
    session.observation = null;
    session.lastActivityAt = nowOf(now);
    return this.copy(session);
  }

  expire(now = Date.now()): number {
    let expired = 0;
    for (const session of this.sessions.values()) {
      if (session.phase === 'ended' || session.phase === 'handoff') continue;
      if (now - session.lastActivityAt > this.idleTimeoutMs) {
        try { this.onExpire?.(this.copy(session)); } catch { /* cleanup must not block expiry */ }
        session.phase = 'ended';
        session.currentEffect = null;
        session.observation = null;
        expired += 1;
      }
    }
    return expired;
  }

  activeSessions(): ControlSession[] {
    return [...this.sessions.values()]
      .filter((session) => session.phase !== 'ended')
      .map((session) => this.copy(session));
  }

  async runAction(
    sessionId: string,
    effect: ControlActionEffect,
    execute: () => Promise<unknown>,
    refresh?: () => Promise<ControlObservation | null>,
  ): Promise<ControlActionReceipt> {
    const previous = this.queues.get(sessionId) || Promise.resolve();
    let run!: Promise<ControlActionReceipt>;
    const chained = previous.catch(() => undefined).then(async () => {
      this.beginAction(sessionId, effect);
      try {
        await execute();
        const observation = refresh ? await refresh() : null;
        return this.finishAction(sessionId, 'ok', Date.now(), observation);
      } catch (err) {
        const receipt = this.finishAction(sessionId, 'unknown', Date.now(), null);
        return { ...receipt, error: String((err as Error)?.message || err) };
      }
    });
    run = chained;
    this.queues.set(sessionId, chained.finally(() => {
      if (this.queues.get(sessionId) === run) this.queues.delete(sessionId);
    }));
    return run;
  }

  private requireSession(sessionId: string): ControlSession {
    const session = this.sessions.get(String(sessionId));
    if (!session) throw new ControlSessionError('session-not-found', `session not found: ${sessionId}`);
    return session;
  }

  private invalid(session: ControlSession, action: string): never {
    throw new ControlSessionError(
      'invalid-transition',
      `cannot ${action} while session is ${session.phase}`,
      { phase: session.phase },
    );
  }

  private copy(session: ControlSession): ControlSession {
    return {
      ...session,
      window: session.window ? { ...session.window, rect: session.window.rect ? { ...session.window.rect } : undefined } : null,
      observation: session.observation
        ? { ...session.observation, refs: [...session.observation.refs] }
        : null,
      lastReceipt: session.lastReceipt
        ? { ...session.lastReceipt, observation: session.lastReceipt.observation ? { ...session.lastReceipt.observation } : null }
        : null,
    };
  }
}
