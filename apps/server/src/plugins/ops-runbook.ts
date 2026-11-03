import type { StoredConnection } from './ops-shell.js';

interface RunbookStepBase {
  id: string;
  name: string;
  continueOnError?: boolean;
}

export interface RunbookExecStep extends RunbookStepBase {
  type: 'exec';
  command: string;
  timeoutMs?: number;
}

export interface RunbookHttpStep extends RunbookStepBase {
  type: 'http';
  url: string;
  expectedStatus: number;
  timeoutMs?: number;
}

export interface RunbookWaitStep extends RunbookStepBase {
  type: 'wait';
  seconds: number;
}

export type OpsRunbookStep = RunbookExecStep | RunbookHttpStep | RunbookWaitStep;

export interface OpsRunbookParameter {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
}

export interface OpsRunbook {
  id: string;
  name: string;
  description?: string;
  connectionId: string;
  enabled: boolean;
  version: number;
  parameters: OpsRunbookParameter[];
  steps: OpsRunbookStep[];
  rollbackSteps: OpsRunbookStep[];
  createdAt: number;
  updatedAt: number;
}

export interface OpsRunbookStepResult {
  id: string;
  name: string;
  type: OpsRunbookStep['type'];
  status: 'success' | 'failed' | 'skipped';
  startedAt: number;
  finishedAt: number;
  output?: string;
  error?: string;
}

export type OpsRunbookRunStatus = 'running' | 'success' | 'failed' | 'rolled_back' | 'cancelled';

export interface OpsRunbookRun {
  id: string;
  runbookId: string;
  runbookName: string;
  runbookVersion: number;
  connectionId: string;
  connectionName: string;
  status: OpsRunbookRunStatus;
  approvalId?: string;
  scheduledTaskId?: string;
  inputParams: Record<string, string>;
  snapshot: OpsRunbook;
  stepResults: OpsRunbookStepResult[];
  rollbackResults: OpsRunbookStepResult[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface RunbookInput {
  name: string;
  description?: string;
  connectionId: string;
  enabled: boolean;
  parameters: OpsRunbookParameter[];
  steps: OpsRunbookStep[];
  rollbackSteps: OpsRunbookStep[];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function safeUrl(raw: unknown): string {
  const value = String(raw || '').trim();
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function safeUrlTemplate(raw: unknown): string {
  const template = String(raw || '').trim();
  if (!template) return '';
  const probe = template.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, '1');
  return safeUrl(probe) ? template : '';
}

const PARAM_VALUE_RE = /^[A-Za-z0-9_./:@%+=,?~-]{0,300}$/;
const PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const RESERVED_PARAM_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeParameters(raw: unknown): { parameters?: OpsRunbookParameter[]; error?: string } {
  if (raw === undefined) return { parameters: [] };
  if (!Array.isArray(raw)) return { error: '参数必须是数组' };
  if (raw.length > 20) return { error: '参数最多 20 个' };
  const parameters: OpsRunbookParameter[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: '参数格式非法' };
    const value = item as Record<string, unknown>;
    const key = String(value.key || '').trim();
    if (!PARAM_KEY_RE.test(key) || RESERVED_PARAM_KEYS.has(key)) {
      return { error: `参数 key 非法：${key || '（空）'}` };
    }
    if (keys.has(key)) return { error: `参数 key 重复：${key}` };
    keys.add(key);
    const defaultValue = value.defaultValue === undefined || value.defaultValue === null
      ? undefined
      : String(value.defaultValue);
    if (defaultValue !== undefined && !PARAM_VALUE_RE.test(defaultValue)) {
      return { error: `参数 ${key} 的默认值包含不安全字符` };
    }
    parameters.push({
      key,
      label: String(value.label || key).trim().slice(0, 80) || key,
      required: value.required !== false,
      defaultValue,
    });
  }
  return { parameters };
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
}

function validatePlaceholders(steps: OpsRunbookStep[], parameters: OpsRunbookParameter[]): string | null {
  const known = new Set(parameters.map((parameter) => parameter.key));
  for (const step of steps) {
    const text = step.type === 'exec' ? step.command : step.type === 'http' ? step.url : '';
    for (const key of placeholders(text)) {
      if (!known.has(key)) return `步骤「${step.name}」引用了未声明参数：${key}`;
    }
  }
  return null;
}

function normalizeStep(raw: unknown, index: number, prefix: string): { step?: OpsRunbookStep; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: `第 ${index + 1} 个步骤格式非法` };
  const value = raw as Record<string, unknown>;
  const type = String(value.type || '').trim();
  const name = String(value.name || '').trim().slice(0, 120);
  if (!name) return { error: `第 ${index + 1} 个步骤缺少名称` };
  const base = {
    id: String(value.id || `${prefix}-${type || 'step'}-${index + 1}`).trim().slice(0, 80),
    name,
    continueOnError: value.continueOnError === true,
  };
  if (type === 'wait') {
    const seconds = Math.floor(Number(value.seconds));
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
      return { error: `等待步骤「${name}」必须为 1–300 秒` };
    }
    return { step: { ...base, type: 'wait', seconds } };
  }
  if (type === 'http') {
    const url = safeUrlTemplate(value.url);
    if (!url) return { error: `HTTP 步骤「${name}」URL 必须是 http/https 且不能含账号密码` };
    const expected = Math.floor(Number(value.expectedStatus || 200));
    if (!Number.isFinite(expected) || expected < 100 || expected > 599) {
      return { error: `HTTP 步骤「${name}」预期状态码非法` };
    }
    const timeoutMs = Math.max(1000, Math.min(600000, Number(value.timeoutMs) || 10000));
    return { step: { ...base, type: 'http', url, expectedStatus: expected, timeoutMs } };
  }
  if (type === 'exec') {
    const command = String(value.command || '').trim();
    if (!command) return { error: `命令步骤「${name}」缺少 command` };
    const timeoutMs = Math.max(1000, Math.min(600000, Number(value.timeoutMs) || 120000));
    return { step: { ...base, type: 'exec', command, timeoutMs } };
  }
  return { error: `第 ${index + 1} 个步骤类型非法：${type || '（空）'}` };
}

function normalizeSteps(raw: unknown, prefix: string, min: number, max: number): { steps?: OpsRunbookStep[]; error?: string } {
  if (!Array.isArray(raw)) return { error: `${prefix}步骤必须是数组` };
  if (raw.length < min) return { error: `${prefix}步骤至少 ${min} 个` };
  if (raw.length > max) return { error: `${prefix}步骤最多 ${max} 个` };
  const steps: OpsRunbookStep[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = normalizeStep(raw[i], i, prefix);
    if (item.error) return { error: item.error };
    if (ids.has(item.step!.id)) return { error: `${prefix}步骤 id 重复：${item.step!.id}` };
    ids.add(item.step!.id);
    steps.push(item.step!);
  }
  return { steps };
}

export function normalizeRunbookInput(raw: Record<string, unknown>): { value?: RunbookInput; error?: string } {
  const name = String(raw.name || '').trim().slice(0, 120);
  const connectionId = String(raw.connectionId || '').trim();
  if (!name) return { error: 'Runbook 名称必填' };
  if (!connectionId) return { error: '必须选择执行连接' };
  const parameterResult = normalizeParameters(raw.parameters);
  if (parameterResult.error) return { error: parameterResult.error };
  const main = normalizeSteps(raw.steps, '执行', 1, 30);
  if (main.error) return { error: main.error };
  const rollback = normalizeSteps(raw.rollbackSteps === undefined ? [] : raw.rollbackSteps, '回滚', 0, 20);
  if (rollback.error) return { error: rollback.error };
  const placeholderError = validatePlaceholders(
    [...main.steps!, ...rollback.steps!],
    parameterResult.parameters!,
  );
  if (placeholderError) return { error: placeholderError };
  return {
    value: {
      name,
      description: String(raw.description || '').trim().slice(0, 500) || undefined,
      connectionId,
      enabled: raw.enabled !== false,
      parameters: parameterResult.parameters!,
      steps: main.steps!,
      rollbackSteps: rollback.steps!,
    },
  };
}

export function buildRunbook(input: RunbookInput, existing?: OpsRunbook): OpsRunbook {
  const now = Date.now();
  return {
    id: existing?.id || `rb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    description: input.description,
    connectionId: input.connectionId,
    enabled: input.enabled,
    version: (existing?.version || 0) + 1,
    parameters: input.parameters,
    steps: input.steps,
    rollbackSteps: input.rollbackSteps,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function resolveRunbookParams(
  runbook: OpsRunbook,
  input: Record<string, unknown> = {},
): { params?: Record<string, string>; error?: string } {
  const params: Record<string, string> = Object.create(null);
  const known = new Set(runbook.parameters.map((parameter) => parameter.key));
  const unknown = Object.keys(input).find((key) => !known.has(key));
  if (unknown) return { error: `未声明的运行参数：${unknown}` };
  for (const parameter of runbook.parameters) {
    const raw = Object.prototype.hasOwnProperty.call(input, parameter.key)
      ? input[parameter.key]
      : undefined;
    const value = raw === undefined || raw === null || raw === ''
      ? parameter.defaultValue
      : String(raw);
    if (value === undefined || value === '') {
      if (parameter.required) {
        const label = parameter.label || parameter.key;
        return { error: label === parameter.key ? `缺少必填参数：${label}` : `缺少必填参数：${label}（${parameter.key}）` };
      }
      params[parameter.key] = '';
      continue;
    }
    if (!PARAM_VALUE_RE.test(value)) {
      return { error: `参数 ${parameter.key} 包含不安全字符` };
    }
    params[parameter.key] = value;
  }
  return { params };
}

function renderText(text: string, params: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => params[key] ?? '');
}

export function renderRunbook(runbook: OpsRunbook, params: Record<string, string>): OpsRunbook {
  const renderStep = (step: OpsRunbookStep): OpsRunbookStep => {
    if (step.type === 'exec') return { ...step, command: renderText(step.command, params) };
    if (step.type === 'http') {
      const url = safeUrl(renderText(step.url, params));
      if (!url) throw new Error(`HTTP 步骤「${step.name}」参数替换后 URL 非法`);
      return { ...step, url };
    }
    return { ...step };
  };
  return {
    ...runbook,
    steps: runbook.steps.map(renderStep),
    rollbackSteps: runbook.rollbackSteps.map(renderStep),
  };
}

function stepSummary(step: OpsRunbookStep): string {
  if (step.type === 'exec') return `${step.name}[exec]：${step.command}`;
  if (step.type === 'http') return `${step.name}[http]：${step.url} → ${step.expectedStatus}`;
  return `${step.name}[wait]：${step.seconds}s`;
}

export function buildRunbookApprovalSubject(runbook: OpsRunbook, conn: StoredConnection): string {
  return [
    `[Runbook 审批] ${runbook.name} v${runbook.version}`,
    `连接：${conn.name}（${conn.host}）${conn.tag ? ` · ${conn.tag}` : ''}`,
    '执行步骤：',
    ...runbook.steps.map((step) => `- ${stepSummary(step)}`),
    '失败回滚：',
    ...(runbook.rollbackSteps.length ? runbook.rollbackSteps.map((step) => `- ${stepSummary(step)}`) : ['- 未配置']),
  ].join('\n');
}

export interface RunbookExecutionDeps {
  execRemote(command: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }>;
  wait(ms: number): Promise<void>;
  shouldCancel?(): boolean;
}

async function executeStep(step: OpsRunbookStep, deps: RunbookExecutionDeps): Promise<OpsRunbookStepResult> {
  const startedAt = Date.now();
  try {
    if (step.type === 'wait') {
      await deps.wait(step.seconds * 1000);
      return { id: step.id, name: step.name, type: step.type, status: 'success', startedAt, finishedAt: Date.now() };
    }
    if (step.type === 'exec') {
      const value = await deps.execRemote(step.command, step.timeoutMs || 120000);
      const code = value.code ?? (value.stderr ? 1 : 0);
      return {
        id: step.id, name: step.name, type: step.type,
        status: code === 0 ? 'success' : 'failed',
        startedAt, finishedAt: Date.now(),
        output: value.stdout.slice(-4000),
        error: code === 0 ? undefined : value.stderr.slice(-4000) || `exit ${code}`,
      };
    }
    const command = `curl -sS -o /dev/null -w '%{http_code}' --max-time 5 --connect-timeout 3 ${shellQuote(step.url)}`;
    const value = await deps.execRemote(command, step.timeoutMs || 10000);
    const status = Number(value.stdout.trim());
    const ok = value.code === 0 && status === step.expectedStatus;
    return {
      id: step.id, name: step.name, type: step.type,
      status: ok ? 'success' : 'failed',
      startedAt, finishedAt: Date.now(),
      output: String(status || ''),
      error: ok ? undefined : (value.stderr || `HTTP ${Number.isNaN(status) ? '无响应' : status}，预期 ${step.expectedStatus}`),
    };
  } catch (e) {
    return {
      id: step.id, name: step.name, type: step.type, status: 'failed',
      startedAt, finishedAt: Date.now(), error: (e as Error).message,
    };
  }
}

export async function executeRunbook(runbook: OpsRunbook, deps: RunbookExecutionDeps): Promise<{
  status: OpsRunbookRunStatus;
  stepResults: OpsRunbookStepResult[];
  rollbackResults: OpsRunbookStepResult[];
  error?: string;
  startedAt: number;
  finishedAt: number;
}> {
  const startedAt = Date.now();
  const stepResults: OpsRunbookStepResult[] = [];
  let failed = false;
  for (const step of runbook.steps) {
    if (deps.shouldCancel?.()) {
      return { status: 'cancelled', stepResults, rollbackResults: [], startedAt, finishedAt: Date.now() };
    }
    const result = await executeStep(step, deps);
    stepResults.push(result);
    if (result.status === 'failed') {
      failed = true;
      if (!step.continueOnError) break;
    }
  }
  if (!failed && deps.shouldCancel?.()) {
    return { status: 'cancelled', stepResults, rollbackResults: [], startedAt, finishedAt: Date.now() };
  }
  const rollbackResults: OpsRunbookStepResult[] = [];
  if (!failed) {
    return { status: 'success', stepResults, rollbackResults, startedAt, finishedAt: Date.now() };
  }
  for (const step of runbook.rollbackSteps) {
    rollbackResults.push(await executeStep(step, deps));
  }
  const rolledBack = rollbackResults.length > 0 && rollbackResults.every((result) => result.status === 'success');
  return {
    status: rolledBack ? 'rolled_back' : 'failed',
    stepResults,
    rollbackResults,
    error: rolledBack ? undefined : (rollbackResults.find((result) => result.status === 'failed')?.error || '执行失败且无可用回滚步骤'),
    startedAt,
    finishedAt: Date.now(),
  };
}
