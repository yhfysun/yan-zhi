import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { callBrowserBridgeRaw } from '../browser-bridge.js';
import type { GoalCriterion } from './goal-store.js';

export interface GoalCriterionResult {
  id: string;
  title: string;
  passed: boolean;
  summary: string;
  evidence?: Record<string, unknown>;
}

export interface GoalDeterministicVerification {
  results: GoalCriterionResult[];
  unresolved: GoalCriterion[];
  needsHuman: boolean;
}

export interface GoalBrowserInspection {
  url?: string;
  title?: string;
  text?: string;
  selectorVisible?: Record<string, boolean>;
}

export interface GoalVerifierContext {
  conversationId?: string;
  userId?: string;
  inspectPage?: (criterion: GoalCriterion) => Promise<GoalBrowserInspection>;
}

function expectObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function insideWorkspace(workspaceDir: string, requested: string): { ok: boolean; path: string } {
  const root = path.resolve(workspaceDir);
  const target = path.resolve(root, requested);
  const rel = path.relative(root, target);
  return {
    ok: rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)),
    path: target,
  };
}

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise(resolve => {
    exec(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }, (error: any, stdout = '', stderr = '') => {
      resolve({
        exitCode: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        stdout: String(stdout).slice(-64_000),
        stderr: String(stderr).slice(-16_000),
        timedOut: !!error?.killed || error?.signal === 'SIGTERM',
      });
    });
  });
}

async function verifyFile(criterion: GoalCriterion, workspaceDir: string): Promise<GoalCriterionResult> {
  const requested = String(criterion.path || '').trim();
  if (!workspaceDir) {
    return {
      id: criterion.id,
      title: criterion.title,
      passed: false,
      summary: '目标未绑定工作目录，无法检查文件',
    };
  }
  if (!requested) {
    return { id: criterion.id, title: criterion.title, passed: false, summary: '验收项缺少 path' };
  }
  const checked = insideWorkspace(workspaceDir, requested);
  if (!checked.ok) {
    return {
      id: criterion.id,
      title: criterion.title,
      passed: false,
      summary: `文件路径越界：${requested}`,
      evidence: { path: requested },
    };
  }
  const exists = existsSync(checked.path);
  return {
    id: criterion.id,
    title: criterion.title,
    passed: exists,
    summary: exists ? `文件存在：${requested}` : `文件不存在：${requested}`,
    evidence: { path: checked.path, exists },
  };
}

async function verifyCommand(criterion: GoalCriterion, workspaceDir: string): Promise<GoalCriterionResult> {
  const command = String(criterion.command || '').trim();
  if (!workspaceDir) {
    return {
      id: criterion.id,
      title: criterion.title,
      passed: false,
      summary: '目标未绑定工作目录，拒绝执行验收命令',
    };
  }
  if (!command) {
    return { id: criterion.id, title: criterion.title, passed: false, summary: '验收项缺少 command' };
  }
  const expect = expectObject(criterion.expect);
  const expectedExit = Number.isFinite(Number(expect.exitCode)) ? Number(expect.exitCode) : 0;
  const run = await runCommand(command, path.resolve(workspaceDir), Math.max(1_000, Math.min(120_000, Number(expect.timeoutMs) || 60_000)));
  const stdoutIncludes = typeof expect.stdoutIncludes === 'string' ? expect.stdoutIncludes : '';
  const stderrIncludes = typeof expect.stderrIncludes === 'string' ? expect.stderrIncludes : '';
  const passed = !run.timedOut
    && run.exitCode === expectedExit
    && (!stdoutIncludes || run.stdout.includes(stdoutIncludes))
    && (!stderrIncludes || run.stderr.includes(stderrIncludes));
  return {
    id: criterion.id,
    title: criterion.title,
    passed,
    summary: passed
      ? `命令验收通过：${criterion.title}`
      : run.timedOut
        ? `命令验收超时：${criterion.title}`
        : `命令验收失败（退出码 ${run.exitCode ?? 'unknown'}）：${criterion.title}`,
    evidence: {
      command,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      stdout: run.stdout,
      stderr: run.stderr,
    },
  };
}

async function verifyHttp(criterion: GoalCriterion): Promise<GoalCriterionResult> {
  const rawUrl = String(criterion.url || '').trim();
  if (!/^https?:\/\//i.test(rawUrl)) {
    return { id: criterion.id, title: criterion.title, passed: false, summary: 'HTTP 验收项必须使用 http/https URL' };
  }
  const expect = expectObject(criterion.expect);
  const expectedStatus = Number.isFinite(Number(expect.status)) ? Number(expect.status) : 200;
  const bodyIncludes = typeof expect.bodyIncludes === 'string' ? expect.bodyIncludes : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(60_000, Number(expect.timeoutMs) || 15_000)));
  try {
    const response = await fetch(rawUrl, { signal: controller.signal, redirect: 'follow' });
    const body = (await response.text()).slice(0, 64_000);
    const passed = response.status === expectedStatus && (!bodyIncludes || body.includes(bodyIncludes));
    return {
      id: criterion.id,
      title: criterion.title,
      passed,
      summary: passed
        ? `HTTP 验收通过：${response.status}`
        : `HTTP 验收失败：状态 ${response.status}`,
      evidence: { url: rawUrl, status: response.status, body: body.slice(0, 8_000) },
    };
  } catch (error: any) {
    return {
      id: criterion.id,
      title: criterion.title,
      passed: false,
      summary: `HTTP 验收请求失败：${error?.message || error}`,
      evidence: { url: rawUrl },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectPageViaBridge(
  criterion: GoalCriterion,
  context: GoalVerifierContext,
): Promise<GoalBrowserInspection> {
  if (!context.conversationId) throw new Error('缺少会话，无法读取浏览器现场');
  const userId = context.userId || 'guest';
  const page = await callBrowserBridgeRaw(
    context.conversationId,
    'browser_get_page_content',
    {},
    20_000,
    undefined,
    userId,
  );
  if (page?.error) throw new Error(String(page.error));
  const expect = expectObject(criterion.expect);
  const selectors = [
    ...(Array.isArray(expect.selectors) ? expect.selectors : []),
    ...Object.keys(expectObject(expect.selectorVisible)).map(selector => ({
      selector,
      visible: expectObject(expect.selectorVisible)[selector],
    })),
  ];
  const selectorVisible: Record<string, boolean> = {};
  for (const item of selectors) {
    const selector = String(item?.selector || '').trim();
    if (!selector) continue;
    const observed = await callBrowserBridgeRaw(
      context.conversationId,
      'browser_is_visible',
      { selector },
      15_000,
      undefined,
      userId,
    );
    selectorVisible[selector] = observed?.visible === true;
  }
  return {
    url: page?.url ? String(page.url) : '',
    title: page?.title ? String(page.title) : '',
    text: page?.text ? String(page.text) : '',
    selectorVisible,
  };
}

async function verifyBrowser(
  criterion: GoalCriterion,
  context: GoalVerifierContext,
): Promise<GoalCriterionResult> {
  try {
    const inspection = await (context.inspectPage || (c => inspectPageViaBridge(c, context)))(criterion);
    const expect = expectObject(criterion.expect);
    const problems: string[] = [];
    const urlChecks = Array.isArray(expect.urlIncludes)
      ? expect.urlIncludes.map(String)
      : typeof expect.urlIncludes === 'string' ? [expect.urlIncludes] : [];
    for (const part of urlChecks) {
      if (!String(inspection.url || '').includes(part)) problems.push(`URL 不含「${part}」`);
    }
    if (typeof expect.titleIncludes === 'string'
      && !String(inspection.title || '').includes(expect.titleIncludes)) {
      problems.push(`标题不含「${expect.titleIncludes}」`);
    }
    const textChecks = Array.isArray(expect.textIncludes)
      ? expect.textIncludes.map(String)
      : typeof expect.textIncludes === 'string' ? [expect.textIncludes] : [];
    for (const part of textChecks) {
      if (!String(inspection.text || '').includes(part)) problems.push(`页面正文不含「${part}」`);
    }
    const expectedSelectors = [
      ...(Array.isArray(expect.selectors) ? expect.selectors : []),
      ...Object.entries(expectObject(expect.selectorVisible)).map(([selector, visible]) => ({ selector, visible })),
    ];
    for (const item of expectedSelectors) {
      const selector = String(item?.selector || '').trim();
      if (!selector) continue;
      const actual = inspection.selectorVisible?.[selector] === true;
      const expected = item?.visible !== false;
      if (actual !== expected) problems.push(`选择器 ${selector} 期望${expected ? '可见' : '不可见'}，实际${actual ? '可见' : '不可见'}`);
    }
    return {
      id: criterion.id,
      title: criterion.title,
      passed: problems.length === 0,
      summary: problems.length ? `页面验收未通过：${problems.join('；')}` : '浏览器页面验收通过',
      evidence: {
        url: inspection.url || '',
        title: inspection.title || '',
        text: String(inspection.text || '').slice(0, 8_000),
        selectorVisible: inspection.selectorVisible || {},
      },
    };
  } catch (error: any) {
    return {
      id: criterion.id,
      title: criterion.title,
      passed: false,
      summary: `浏览器页面验收失败：${error?.message || error}`,
    };
  }
}

export async function verifyDeterministicCriterion(
  criterion: GoalCriterion,
  workspaceDir: string,
  context: GoalVerifierContext = {},
): Promise<GoalCriterionResult | null> {
  const kind = String(criterion.kind || 'text').toLowerCase();
  if (kind === 'file_exists' || kind === 'file' || kind === 'path_exists') {
    return verifyFile(criterion, workspaceDir);
  }
  if (kind === 'command') {
    return verifyCommand(criterion, workspaceDir);
  }
  if (kind === 'http' || kind === 'url') {
    return verifyHttp(criterion);
  }
  if (kind === 'browser' || kind === 'page') {
    return verifyBrowser(criterion, context);
  }
  return null;
}

export async function verifyDeterministicCriteria(
  criteria: GoalCriterion[],
  workspaceDir: string,
  context: GoalVerifierContext = {},
): Promise<GoalDeterministicVerification> {
  const results: GoalCriterionResult[] = [];
  const unresolved: GoalCriterion[] = [];
  for (const criterion of criteria) {
    const result = await verifyDeterministicCriterion(criterion, workspaceDir, context);
    if (result) results.push(result);
    else unresolved.push(criterion);
  }
  return {
    results,
    unresolved,
    needsHuman: unresolved.some(c => String(c.kind || '').toLowerCase() === 'human'),
  };
}
