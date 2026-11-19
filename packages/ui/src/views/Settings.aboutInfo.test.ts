import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'Settings.vue'), 'utf8');
const KNOWLEDGE = readFileSync(resolve(__dirname, 'Knowledge.vue'), 'utf8');
const SERVER_KB = readFileSync(resolve(__dirname, '../../../../apps/server/src/services/kb.ts'), 'utf8');
const SERVER_ROUTE = readFileSync(resolve(__dirname, '../../../../apps/server/src/routes/kb.ts'), 'utf8');
const README = readFileSync(resolve(__dirname, '../../../../README.md'), 'utf8');

describe('设置 · 应用与许可信息', () => {
  it('版本从根 package.json 读取，不再写死 MVP 版本', () => {
    expect(SOURCE).toContain("import appPackage from '../../../../package.json'");
    expect(SOURCE).toContain("const appVersion = String(appPackage.version || '未知')");
    expect(SOURCE).toContain('版本：v{{ appVersion }}');
    expect(SOURCE).not.toContain('版本：v0.1.0 (MVP)');
  });

  it('关于页展示 YAN-ZHI 商业许可，不再冒充 Apache-2.0 开源项目', () => {
    expect(SOURCE).toContain('许可协议：YAN-ZHI 商业授权协议（专有软件，非开源）');
    expect(SOURCE).not.toContain('开源协议：Apache-2.0');
    expect(SOURCE).not.toContain('版本 · 开源信息');
    expect(README).toContain('采用自定义 **YAN-ZHI 商业授权协议**');
    expect(README).toContain('本项目**不是开源软件**');
  });

  it('内置应用说明带版本标记，并由前后端共同传递和校验', () => {
    expect(KNOWLEDGE).toContain('guideVersion: APP_GUIDE_VERSION');
    expect(SERVER_ROUTE).toContain('Number(req.body?.guideVersion) || undefined');
    expect(SERVER_KB).toContain('[guide:v');
    expect(SERVER_KB).toContain('versionMatches');
  });
});
