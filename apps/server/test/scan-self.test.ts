/**
 * Electron 运行时配置审计（P4）：结构判定而不是逐行正则。
 *
 * 用临时仓库夹具验证：违规配置被定位到行、缺失项（权限处理器 / CSP）能识别、
 * 硬化过的入口不误报。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auditElectronConfig, extractMainCsp, extractWebPreferences,
} from '../src/plugins/sec-lab-tools/scan/self/electron';
import { matchSelfAsset, type SelfAsset } from '../src/plugins/sec-lab-tools/scan/self/assets';

const tmpDirs: string[] = [];
afterEach(async () => {
  for (const d of tmpDirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

async function repo(main: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yz-self-'));
  tmpDirs.push(dir);
  const p = path.join(dir, 'apps', 'desktop', 'main.cjs');
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, main, 'utf8');
  return dir;
}

describe('webPreferences 结构解析', () => {
  it('能配对多行块并给出起始行号', () => {
    const text = [
      'new BrowserWindow({',
      '  webPreferences: {',
      '    nodeIntegration: true,',
      '    contextIsolation: false,',
      '  },',
      '});',
    ].join('\n');
    const blocks = extractWebPreferences(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].line).toBe(2);
    expect(blocks[0].body).toContain('nodeIntegration: true');
  });

  it('CSP 只截取应用 CSP（不含产物预览那段 unsafe-eval）', () => {
    const text = [
      'const csp = "default-src \'self\'; script-src \'self\';";',
      'session.defaultSession.webRequest.onHeadersReceived(() => {});',
      'script-src \'unsafe-inline\' \'unsafe-eval\' https:;',
    ].join('\n');
    const csp = extractMainCsp(text);
    expect(csp?.text).not.toContain('unsafe-eval');
    expect(csp?.line).toBe(1);
  });
});

describe('自有资产匹配', () => {
  const assets: SelfAsset[] = [
    { id: 'self_runtime_3001', kind: 'runtime', value: 'http://127.0.0.1:3001', label: '本机服务 :3001' },
  ];

  it('本机固定端口：带协议、带路径、裸 host:port 都认；别的端口不认', () => {
    expect(matchSelfAsset('http://127.0.0.1:3001', assets)?.value).toBe('http://127.0.0.1:3001');
    expect(matchSelfAsset('http://127.0.0.1:3001/api/health', assets)?.value).toBe('http://127.0.0.1:3001');
    expect(matchSelfAsset('127.0.0.1:3001', assets)?.value).toBe('http://127.0.0.1:3001');
    expect(matchSelfAsset('localhost:3001', assets)?.value).toBe('http://127.0.0.1:3001');
    expect(matchSelfAsset('127.0.0.1:9999', assets)).toBeNull();
    expect(matchSelfAsset('https://example.com', assets)).toBeNull();
  });
});

describe('auditElectronConfig', () => {
  it('违规配置逐类报出，缺失项单独记录', async () => {
    const dir = await repo([
      'const { BrowserWindow } = require("electron");',
      'const w = new BrowserWindow({',
      '  webPreferences: {',
      '    nodeIntegration: true,',
      '    contextIsolation: false,',
      '    webSecurity: false,',
      '  },',
      '});',
    ].join('\n'));

    const r = await auditElectronConfig(dir);
    const ids = r.findings.map((f) => f.ruleId);
    expect(ids).toContain('self-electron-node-integration');
    expect(ids).toContain('self-electron-context-isolation-off');
    expect(ids).toContain('self-electron-web-security-off');
    expect(ids).toContain('self-electron-permission-handler-missing');
    expect(ids).toContain('self-electron-csp-missing');
    const node = r.findings.find((f) => f.ruleId === 'self-electron-node-integration');
    // 定位到 webPreferences 块起始行（夹具里是第 3 行）
    expect(node?.location).toBe('apps/desktop/main.cjs:3');
  });

  it('硬化过的入口不误报（权限处理器 + CSP + webview 钩子）', async () => {
    const dir = await repo([
      'const csp = "default-src \'self\'; script-src \'self\';";',
      'session.defaultSession.setPermissionRequestHandler(() => {});',
      'mainWindow.webContents.on("will-attach-webview", () => {});',
      'const w = new BrowserWindow({',
      '  webPreferences: {',
      '    nodeIntegration: false,',
      '    contextIsolation: true,',
      '    webviewTag: true,',
      '  },',
      '});',
      'session.defaultSession.webRequest.onHeadersReceived(() => {});',
    ].join('\n'));

    const r = await auditElectronConfig(dir);
    expect(r.findings.map((f) => f.ruleId)).toEqual([]);
  });

  it('没有 Electron 入口时给出说明而不是报错', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yz-self-empty-'));
    tmpDirs.push(dir);
    const r = await auditElectronConfig(dir);
    expect(r.findings).toEqual([]);
    expect(r.notes.join(' ')).toContain('跳过');
  });
});
