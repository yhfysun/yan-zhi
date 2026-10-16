// 主机密钥 UI 契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 守护的东西：这是 SSH 信任根的用户侧入口。最要紧的两条：
//   ① 「忘记」必须先确认 —— 手滑点掉等于把中间人的密钥变成受信密钥；
//   ② 关闭校验（off）时页面必须**明说风险**，不能让人以为一切照旧。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const read = (...p: string[]) => strip(readFileSync(resolve(__dirname, ...p), 'utf8'));
const CONSOLE = read('OpsConsole.vue');
const PANEL = read('../../components/ops/OpsKnownHostsPanel.vue');

describe('OpsConsole · 主机密钥入口', () => {
  it('顶层有「主机密钥」Tab，渲染对应面板', () => {
    expect(CONSOLE).toMatch(/<el-tab-pane label="主机密钥" name="kh">/);
    expect(CONSOLE).toMatch(/<OpsKnownHostsPanel ref="khPanelRef" \/>/);
  });

  it('切到该 Tab 时刷新列表', () => {
    const fn = CONSOLE.match(/function onTabChange\(name: string\)[\s\S]*?\n\}/);
    expect(fn, '找不到 onTabChange').toBeTruthy();
    expect(fn![0]).toMatch(/name === 'kh'/);
    expect(fn![0]).toMatch(/khPanelRef\.value\?\.load\(\)/);
  });
});

describe('OpsKnownHostsPanel', () => {
  it('从 /known-hosts 取已记录主机与服务端当前策略', () => {
    expect(PANEL).toMatch(/api\.get<KnownHost\[\]>\('\/plugin\/ops-shell\/known-hosts'\)/);
    expect(PANEL).toMatch(/mode\.value = m/);
  });

  it('★ 「忘记」必须先确认，且说清后果（手滑等于把中间人的密钥变受信）', () => {
    const fn = PANEL.match(/async function forget\(row: KnownHost\)[\s\S]*?\n\}/);
    expect(fn, '找不到 forget').toBeTruthy();
    expect(fn![0]).toMatch(/ElMessageBox\.confirm/);
    expect(fn![0]).toMatch(/重新信任当时拿到的密钥/);
    expect(fn![0].indexOf('ElMessageBox.confirm')).toBeLessThan(fn![0].indexOf('api.delete'));
  });

  it('主机名要 encodeURIComponent（host:port 里的冒号不能裸着进路径）', () => {
    expect(PANEL).toMatch(/known-hosts\/\$\{encodeURIComponent\(row\.host\)\}/);
  });

  it('★ 关闭校验时页面必须明说风险，不能让人以为照旧安全', () => {
    expect(PANEL).toMatch(/中间人可顶替服务器/);
    // off 用 danger 色标出来，而不是和 tofu 一样是普通提示
    expect(PANEL).toMatch(/mode\.value === 'off' \? 'danger'/);
  });

  it('三种模式在标签与说明里都有文案（模式改了页面不能空着）', () => {
    // modeLabel 与 modeTip 两张映射各出现一次 → 每个模式至少出现 2 次
    for (const m of ['tofu', 'strict', 'off']) {
      const n = (PANEL.match(new RegExp(`${m}:`, 'g')) ?? []).length;
      expect(n, `模式 ${m} 的文案不全（label/tip 各需一条）`).toBeGreaterThanOrEqual(2);
    }
  });
});
