import { randomUUID } from 'node:crypto';
import type { AutomationBrowserTarget, AutomationParamDef, AutomationScriptDraft, AutomationStep } from '@yan-zhi/shared';
import { db } from '../db.js';
import { callBrowserBridgeRaw } from '../browser-bridge.js';

export interface RecordedBrowserEvent {
  type: 'click' | 'type' | 'key';
  at: number;
  target?: AutomationBrowserTarget;
  text?: string;
  key?: string;
  sensitive?: boolean;
  tag?: string;
}

export interface AutomationRecording {
  id: string;
  userId: string;
  url: string;
  conversationId: string;
  status: 'recording' | 'stopped' | 'cancelled';
  events: RecordedBrowserEvent[];
  draft: AutomationScriptDraft | null;
  createdAt: number;
  updatedAt: number;
  stoppedAt: number | null;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToRecording(row: any): AutomationRecording {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    url: String(row.url || ''),
    conversationId: String(row.conversation_id),
    status: String(row.status) as AutomationRecording['status'],
    events: parseJson<RecordedBrowserEvent[]>(row.events_json, []),
    draft: parseJson<AutomationScriptDraft | null>(row.draft_json, null),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    stoppedAt: row.stopped_at == null ? null : Number(row.stopped_at),
  };
}

function targetKey(target?: AutomationBrowserTarget): string {
  return JSON.stringify(target || null);
}

export function convertRecordedBrowserEvents(
  url: string,
  events: RecordedBrowserEvent[],
): AutomationScriptDraft {
  const steps: AutomationStep[] = [];
  const params: AutomationParamDef[] = [];
  let secretCount = 0;
  let lastClickKey = '';
  let lastClickAt = 0;

  if (/^https?:\/\//i.test(url)) {
    steps.push({ id: `rec_${steps.length + 1}`, type: 'browser.navigate', url });
  }

  for (const event of events) {
    if (event.type === 'click' && event.target) {
      const key = targetKey(event.target);
      if (key === lastClickKey && event.at - lastClickAt < 700) continue;
      lastClickKey = key;
      lastClickAt = event.at;
      steps.push({ id: `rec_${steps.length + 1}`, type: 'browser.click', target: event.target });
      continue;
    }

    if (event.type === 'type' && event.target && typeof event.text === 'string') {
      const prev = steps[steps.length - 1];
      let text = event.text;
      if (event.sensitive) {
        secretCount++;
        const key = `secret_${secretCount}`;
        text = `{{${key}}}`;
        if (!params.some((param) => param.key === key)) {
          params.push({
            key,
            label: `敏感输入 ${secretCount}`,
            type: 'string',
            required: true,
            secret: true,
            description: '录制时已脱敏，请在每次运行前填写',
          });
        }
      }
      if (
        prev?.type === 'browser.type' &&
        targetKey(prev.target) === targetKey(event.target) &&
        event.at - Number((prev as any).__recordedAt || 0) < 2_500
      ) {
        prev.text = text;
        (prev as any).__recordedAt = event.at;
      } else {
        const step: AutomationStep = {
          id: `rec_${steps.length + 1}`,
          type: 'browser.type',
          target: event.target,
          text,
        };
        (step as any).__recordedAt = event.at;
        steps.push(step);
      }
      continue;
    }

    if (event.type === 'key' && event.key) {
      const prev = steps[steps.length - 1];
      if (event.key === 'Enter' && prev?.type === 'browser.type') {
        prev.pressEnter = true;
      } else {
        steps.push({ id: `rec_${steps.length + 1}`, type: 'browser.press', keys: [event.key] });
      }
    }
  }

  for (const step of steps) delete (step as any).__recordedAt;
  if (steps.length === 0 && /^https?:\/\//i.test(url)) {
    steps.push({ id: 'rec_1', type: 'browser.navigate', url });
  }
  return {
    schemaVersion: 1,
    name: `录制脚本 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    kind: 'browser',
    params,
    steps,
  };
}

const INSTALL_SCRIPT = String.raw`(() => {
  const KEY = '__YZ_RPA_RECORDER__';
  if (window[KEY]) return { ok: true, existing: true };
  const state = { events: [], startedAt: Date.now() };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const attr = (el, name) => el && el.getAttribute ? (el.getAttribute(name) || '') : '';
  const textOf = (el) => norm(el && (el.innerText || el.textContent || el.value || ''));
  const labelOf = (el) => {
    if (!el) return '';
    if (el.labels && el.labels[0]) return textOf(el.labels[0]);
    const id = attr(el, 'id');
    if (id) {
      const label = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (label) return textOf(label);
    }
    const parent = el.closest && el.closest('label');
    return parent ? textOf(parent) : '';
  };
  const cssPath = (el) => {
    if (!el || !el.tagName) return '';
    const testId = attr(el, 'data-testid');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    if (el.id) return '#' + CSS.escape(el.id);
    const name = attr(el, 'name');
    if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((x) => x.tagName === cur.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  };
  const targetOf = (el) => {
    if (!el) return null;
    const explicitRole = attr(el, 'role');
    const tag = String(el.tagName || '').toLowerCase();
    const role = explicitRole || (tag === 'button' ? 'button' : tag === 'a' ? 'link' : tag === 'input' ? (attr(el, 'type') === 'checkbox' ? 'checkbox' : 'textbox') : tag === 'select' ? 'combobox' : '');
    const label = labelOf(el);
    const name = attr(el, 'aria-label') || label || textOf(el) || attr(el, 'placeholder') || attr(el, 'title');
    if (role && name) return { by: 'role', role, name: name.slice(0, 120) };
    if (label) return { by: 'label', label: label.slice(0, 120) };
    const placeholder = attr(el, 'placeholder');
    if (placeholder) return { by: 'placeholder', placeholder: placeholder.slice(0, 120) };
    const selector = cssPath(el);
    return selector ? { by: 'css', selector } : null;
  };
  const interactive = (el) => el && el.closest ? el.closest('button,a,input,textarea,select,[role],[contenteditable="true"]') : null;
  const sensitive = (el) => {
    if (!el) return false;
    const hint = [attr(el, 'type'), attr(el, 'name'), attr(el, 'id'), attr(el, 'aria-label'), attr(el, 'placeholder')].join(' ');
    return attr(el, 'type').toLowerCase() === 'password' || /password|passwd|passcode|secret|token|cookie|密码|验证码/i.test(hint);
  };
  document.addEventListener('click', (event) => {
    const el = interactive(event.target);
    if (!el) return;
    const target = targetOf(el);
    if (target) state.events.push({ type: 'click', at: Date.now(), target });
  }, true);
  document.addEventListener('input', (event) => {
    const el = interactive(event.target);
    if (!el) return;
    const target = targetOf(el);
    if (!target) return;
    state.events.push({
      type: 'type',
      at: Date.now(),
      target,
      text: sensitive(el) ? '' : String(el.value == null ? el.textContent || '' : el.value),
      sensitive: sensitive(el),
      tag: String(el.tagName || '').toLowerCase(),
    });
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') state.events.push({ type: 'key', at: Date.now(), key: 'Enter' });
  }, true);
  window[KEY] = state;
  return { ok: true, existing: false, eventCount: 0 };
})()`;

const DRAIN_SCRIPT = String.raw`(() => {
  const KEY = '__YZ_RPA_RECORDER__';
  const state = window[KEY];
  if (!state) return { ok: true, events: [], active: false };
  const events = state.events.splice(0, state.events.length);
  return { ok: true, events, active: true };
})()`;

const STOP_SCRIPT = String.raw`(() => {
  const KEY = '__YZ_RPA_RECORDER__';
  const state = window[KEY];
  const events = state ? state.events.splice(0, state.events.length) : [];
  try { delete window[KEY]; } catch (e) { window[KEY] = null; }
  return { ok: true, events, active: false };
})()`;

async function runPageScript(conversationId: string, userId: string, script: string): Promise<any> {
  const result = await callBrowserBridgeRaw(
    conversationId,
    'browser_run_script',
    { script },
    30_000,
    `recording:${conversationId}`,
    userId,
  );
  if (result?.error) throw new Error(String(result.error));
  let value = result?.result;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* keep string */ }
  }
  return value;
}

export async function startBrowserRecording(
  userId: string,
  input: { url: string },
): Promise<AutomationRecording> {
  const url = String(input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('录制地址必须是 http/https URL');
  const id = `autorec_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const conversationId = `automation_recording_${id}`;
  await callBrowserBridgeRaw(conversationId, 'browser_navigate', { url }, 45_000, `recording:${id}`, userId);
  await runPageScript(conversationId, userId, INSTALL_SCRIPT);
  const now = Date.now();
  db.prepare(`
    INSERT INTO automation_recording
      (id, user_id, url, conversation_id, status, events_json, draft_json, created_at, updated_at, stopped_at)
    VALUES (?, ?, ?, ?, 'recording', '[]', NULL, ?, ?, NULL)
  `).run(id, userId, url, conversationId, now, now);
  return getBrowserRecording(userId, id)!;
}

export function getBrowserRecording(userId: string, id: string): AutomationRecording | null {
  const row = db.prepare(
    'SELECT * FROM automation_recording WHERE id = ? AND user_id = ?',
  ).get(id, userId) as any;
  return row ? rowToRecording(row) : null;
}

export async function drainBrowserRecording(userId: string, id: string): Promise<AutomationRecording> {
  const recording = getBrowserRecording(userId, id);
  if (!recording) throw new Error('录制会话不存在');
  if (recording.status !== 'recording') return recording;
  const value = await runPageScript(recording.conversationId, userId, DRAIN_SCRIPT);
  const events = Array.isArray(value?.events) ? value.events as RecordedBrowserEvent[] : [];
  if (events.length) {
    const merged = [...recording.events, ...events].slice(-5000);
    db.prepare(
      'UPDATE automation_recording SET events_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).run(JSON.stringify(merged), Date.now(), id, userId);
  }
  return getBrowserRecording(userId, id)!;
}

export async function stopBrowserRecording(userId: string, id: string): Promise<AutomationRecording> {
  const recording = getBrowserRecording(userId, id);
  if (!recording) throw new Error('录制会话不存在');
  if (recording.status !== 'recording') return recording;
  const value = await runPageScript(recording.conversationId, userId, STOP_SCRIPT);
  const events = Array.isArray(value?.events) ? value.events as RecordedBrowserEvent[] : [];
  const allEvents = [...recording.events, ...events].slice(-5000);
  const draft = convertRecordedBrowserEvents(recording.url, allEvents);
  const now = Date.now();
  db.prepare(`
    UPDATE automation_recording SET
      status = 'stopped', events_json = ?, draft_json = ?, updated_at = ?, stopped_at = ?
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(allEvents), JSON.stringify(draft), now, now, id, userId);
  return getBrowserRecording(userId, id)!;
}

export function cancelBrowserRecording(userId: string, id: string): boolean {
  const now = Date.now();
  return db.prepare(`
    UPDATE automation_recording SET status = 'cancelled', updated_at = ?, stopped_at = ?
    WHERE id = ? AND user_id = ? AND status = 'recording'
  `).run(now, now, id, userId).changes > 0;
}
