// Electron 配置审计（P4，静态只读）。
//
// ★ 与源码引擎的分工：源码规则是"逐行正则"，能看到 `nodeIntegration: true`，
//   但看不到「这个窗口有没有权限处理器」「主窗口 CSP 是怎么注入的」这类**结构/缺失**问题。
//   这里按 webPreferences 块与 CSP 注入块做结构判定，规则 id 用 self-electron-* 区分。
// ★ 只读：不 require 被测的 Electron 入口，不执行任何代码。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanFinding } from '../types.js';
import { fingerprintOf } from '../types.js';

export interface ElectronAuditResult {
  findings: ScanFinding[];
  /** 实际审计到的文件（相对仓库根） */
  files: string[];
  notes: string[];
}

const MAIN_CANDIDATES = ['apps/desktop/main.cjs'];
const MAX_SCAN_FILES = 5;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** 从 `{` 开始做花括号配对，返回块内文本（不含外层大括号） */
function braceBlock(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return text.slice(openIndex + 1);
}

interface WebPrefBlock { line: number; body: string }

export function extractWebPreferences(text: string): WebPrefBlock[] {
  const out: WebPrefBlock[] = [];
  const re = /webPreferences\s*:\s*\{/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const open = text.indexOf('{', m.index);
    out.push({ line: lineOf(text, m.index), body: braceBlock(text, open) });
  }
  return out;
}

/** 主窗口 CSP：截取 `const csp =` 到首次 `onHeadersReceived` 之间（只含应用 CSP，不含产物 CSP） */
export function extractMainCsp(text: string): { text: string; line: number } | null {
  const start = /const\s+csp\s*=/.exec(text);
  if (!start) return null;
  const hookIdx = text.indexOf('onHeadersReceived', start.index);
  const end = hookIdx > 0 ? hookIdx : Math.min(text.length, start.index + 8000);
  return { text: text.slice(start.index, end), line: lineOf(text, start.index) };
}

async function readIfFile(p: string): Promise<string | null> {
  return fs.readFile(p, 'utf8').catch(() => null);
}

async function findMainFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const rel of MAIN_CANDIDATES) {
    const full = path.join(root, rel);
    if (await fs.stat(full).then((s) => s.isFile()).catch(() => false)) found.push(full);
  }
  if (found.length) return found;
  const dir = path.join(root, 'apps', 'desktop');
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  for (const name of names.filter((n) => n.endsWith('.cjs')).slice(0, 40)) {
    const full = path.join(dir, name);
    const text = await readIfFile(full);
    if (text && /new\s+BrowserWindow\s*\(/.test(text)) found.push(full);
    if (found.length >= MAX_SCAN_FILES) break;
  }
  return found;
}

function violationFinding(
  ruleId: string,
  title: string,
  severity: ScanFinding['severity'],
  rel: string,
  lines: number[],
  detail: string,
  remediation: string,
): ScanFinding {
  const location = `${rel}:${lines[0]}`;
  return {
    ruleId, title, severity,
    detail: `${detail}\n位置：${lines.map((l) => `${rel}:${l}`).join('、')}`,
    remediation,
    evidence: lines.map((l) => `L${l}`).join(','),
    location,
    fingerprint: fingerprintOf(ruleId, location, String(lines.join(','))),
  };
}

export async function auditElectronConfig(root: string): Promise<ElectronAuditResult> {
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const files: string[] = [];
  const mains = await findMainFiles(root);
  if (!mains.length) {
    notes.push('未找到 Electron 主进程入口（apps/desktop/main.cjs），跳过运行时配置审计');
    return { findings, files, notes };
  }

  for (const full of mains) {
    const text = await readIfFile(full);
    if (!text) continue;
    const rel = path.relative(root, full).split(path.sep).join('/');
    files.push(rel);

    const blocks = extractWebPreferences(text);
    if (!blocks.length) notes.push(`${rel}：未找到 webPreferences 块`);

    const hits = {
      nodeIntegration: [] as number[],
      contextIsolation: [] as number[],
      webSecurity: [] as number[],
    };
    for (const b of blocks) {
      if (/nodeIntegration\s*:\s*true/.test(b.body)) hits.nodeIntegration.push(b.line);
      if (/contextIsolation\s*:\s*false/.test(b.body)) hits.contextIsolation.push(b.line);
      if (/webSecurity\s*:\s*false/.test(b.body)) hits.webSecurity.push(b.line);
    }
    if (hits.nodeIntegration.length) {
      findings.push(violationFinding('self-electron-node-integration', 'Electron 窗口开启 nodeIntegration',
        'high', rel, hits.nodeIntegration,
        '该窗口的 webPreferences 允许渲染进程直接使用 Node API，页面脚本一旦被注入即可执行系统命令。',
        '设为 false；需要的能力经 preload + contextBridge 暴露最小接口。'));
    }
    if (hits.contextIsolation.length) {
      findings.push(violationFinding('self-electron-context-isolation-off', 'Electron 窗口关闭 contextIsolation',
        'high', rel, hits.contextIsolation,
        '关闭隔离后 preload 与页面共享全局上下文，页面可篡改注入的桥接对象。',
        '设为 true，只经 contextBridge 暴露最小 API。'));
    }
    if (hits.webSecurity.length) {
      findings.push(violationFinding('self-electron-web-security-off', 'Electron 窗口关闭 webSecurity',
        'high', rel, hits.webSecurity,
        '关闭 webSecurity 会绕过同源策略，渲染进程可读取任意源响应。',
        '开启 webSecurity；跨域需求走主进程代理并做白名单。'));
    }

    // 缺失项（结构级）：权限处理器没有就记一条低危，别当成高危误报
    if (!/setPermissionRequestHandler\s*\(/.test(text) && !/setPermissionCheckHandler\s*\(/.test(text)) {
      findings.push({
        ruleId: 'self-electron-permission-handler-missing',
        title: '未发现 Electron 权限请求处理器',
        severity: 'low',
        detail: '主进程没有 session.setPermissionRequestHandler / setPermissionCheckHandler：' +
          '页面请求摄像头、麦克风、通知、地理位置等权限时会走 Electron 默认策略。\n' +
          '位置：' + rel,
        remediation: '显式设置权限处理器，按白名单放行，其余一律拒绝。',
        evidence: 'setPermissionRequestHandler 未命中',
        location: rel,
        fingerprint: fingerprintOf('self-electron-permission-handler-missing', rel, 'absent'),
      });
    }

    const csp = extractMainCsp(text);
    if (!csp) {
      findings.push({
        ruleId: 'self-electron-csp-missing',
        title: '主窗口未注入 Content-Security-Policy',
        severity: 'medium',
        detail: '未找到主窗口 CSP 注入（onHeadersReceived / Content-Security-Policy）。\n位置：' + rel,
        remediation: '通过 session.webRequest.onHeadersReceived 注入最小可用 CSP。',
        evidence: 'CSP 注入块未命中',
        location: rel,
        fingerprint: fingerprintOf('self-electron-csp-missing', rel, 'absent'),
      });
    } else {
      if (/unsafe-eval/i.test(csp.text)) {
        findings.push(violationFinding('self-electron-csp-unsafe-eval', '主窗口 CSP 放行 unsafe-eval',
          'medium', rel, [csp.line],
          '应用 CSP（非产物预览 CSP）包含 unsafe-eval，代码注入防护基本失效。',
          '移除 unsafe-eval；必须动态执行的代码改用 Web Worker 或沙箱 iframe。'));
      }
      if (!/script-src/.test(csp.text)) {
        findings.push(violationFinding('self-electron-csp-no-script-src', '主窗口 CSP 未限制脚本源',
          'low', rel, [csp.line],
          'CSP 缺少 script-src 指令，脚本加载回退到 default-src，粒度不足。',
          "显式声明 script-src 'self'（需要时再加 nonce/hash）。"));
      }
    }
  }

  // 启用了 webviewTag 的入口必须统一硬化 guest
  for (const full of mains) {
    const t = await readIfFile(full);
    if (!t) continue;
    if (/webviewTag\s*:\s*true/.test(t) && !/will-attach-webview/.test(t)) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      findings.push({
        ruleId: 'self-electron-webview-hardening-missing',
        title: '启用 webviewTag 但未硬化 guest',
        severity: 'medium',
        detail: '窗口启用了 <webview>，但没有 will-attach-webview 钩子统一强制 nodeIntegration/contextIsolation。\n位置：' + rel,
        remediation: '在 will-attach-webview 中强制 nodeIntegration=false、contextIsolation=true，并删除 guest preload。',
        evidence: 'will-attach-webview 未命中',
        location: rel,
        fingerprint: fingerprintOf('self-electron-webview-hardening-missing', rel, 'absent'),
      });
    }
  }

  return { findings, files, notes };
}
