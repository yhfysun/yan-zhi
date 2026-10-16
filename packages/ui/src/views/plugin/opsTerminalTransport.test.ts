// 运维终端传输通道契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 守护的东西：终端从「SSE 收输出 + POST 送按键」换成 WebSocket 之后，
//   ① 必须优先 WS、连不上才回退 SSE（回退没了 = 被反代拦掉的环境直接不可用）；
//   ② 按键与输出必须是二进制帧（走文本会毁掉 Ctrl-C 这类控制字符）；
//   ③ UTF-8 必须用**流式**解码器（多字节字符会被切在两帧之间）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));
const SESSION = strip(readFileSync(resolve(__dirname, 'opsSession.ts'), 'utf8'));

describe('TermTransport · 通道抽象', () => {
  it('接口只暴露 send / resize / close 三件事', () => {
    const iface = SESSION.match(/export interface TermTransport \{[\s\S]*?\n\}/);
    expect(iface, '找不到 TermTransport').toBeTruthy();
    expect(iface![0]).toMatch(/send\(data: string\): void;/);
    expect(iface![0]).toMatch(/resize\(cols: number, rows: number\): void;/);
    expect(iface![0]).toMatch(/close\(\): void;/);
  });

  it('TermHandle 持有 transport（不再直接持有 AbortController）', () => {
    const h = SESSION.match(/export interface TermHandle \{[\s\S]*?\n\}/);
    expect(h, '找不到 TermHandle').toBeTruthy();
    expect(h![0]).toMatch(/transport: TermTransport \| null;/);
    expect(h![0]).not.toMatch(/stream:/);
  });

  it('窗口状态不再保留 termSessionId（只有一个真相源：通道自己）', () => {
    expect(SESSION).not.toMatch(/termSessionId/);
    expect(CONSOLE).not.toMatch(/termSessionId/);
  });
});

describe('OpsConsole · 通道选择与回退', () => {
  it('★ 先试 WebSocket，失败才回退 SSE（顺序反了等于没有 WS）', () => {
    const fn = CONSOLE.match(/async function openTermTransport\([\s\S]*?\n\}/);
    expect(fn, '找不到 openTermTransport').toBeTruthy();
    const body = fn![0];
    const wsAt = body.indexOf('openWsTermTransport');
    const sseAt = body.indexOf('openSseTermTransport');
    expect(wsAt).toBeGreaterThanOrEqual(0);
    expect(sseAt).toBeGreaterThan(wsAt);
  });

  it('WS 端点路径正确，且带上连接与初始行列', () => {
    expect(CONSOLE).toMatch(/wsUrl\(`\/plugin\/ops-shell\/term\/ws\?connectionId=/);
    expect(CONSOLE).toMatch(/&cols=\$\{cols\}&rows=\$\{rows\}/);
  });

  it('★ 按键以二进制帧发出、连接以 arraybuffer 接收', () => {
    const fn = CONSOLE.match(/function openWsTermTransport\([\s\S]*?\n\}\n/);
    expect(fn, '找不到 openWsTermTransport').toBeTruthy();
    expect(fn![0]).toMatch(/sock\.binaryType = 'arraybuffer'/);
    expect(fn![0]).toMatch(/sock\.send\(data\)/);
  });

  it('★ UTF-8 用流式解码器（逐帧新建 decoder 会把跨帧的多字节字符解成乱码）', () => {
    expect(CONSOLE).toMatch(/decoder\.decode\([\s\S]{0,80}\{ stream: true \}\)/);
  });

  it('resize 走文本控制帧，且是 { type: "resize" } 约定', () => {
    expect(CONSOLE).toMatch(/JSON\.stringify\(\{ type: 'resize', cols: c2, rows: r2 \}\)/);
  });

  it('握手阶段的错误要触发回退，就绪后的错误只提示', () => {
    const fn = CONSOLE.match(/function openWsTermTransport\([\s\S]*?\n\}\n/);
    expect(fn![0]).toMatch(/if \(settled\) ElMessage\.error[\s\S]{0,90}else fail\(/);
  });

  it('握手有超时兜底（否则反代吞掉 upgrade 时会一直转圈）', () => {
    expect(CONSOLE).toMatch(/setTimeout\(\(\) => fail\(new Error\('WebSocket 握手超时'\)\), \d+\)/);
  });

  it('★ 已就绪后连接断开 → 走统一收尾（释放句柄 + 提示可重连）', () => {
    const fn = CONSOLE.match(/function openWsTermTransport\([\s\S]*?\n\}\n/);
    expect(fn, '找不到 openWsTermTransport').toBeTruthy();
    expect(fn![0], '断开未走统一收尾').toMatch(/else markTermDisconnected\(w\)/);
    // 清掉连接与录制状态：断开后还显示「录制中」，用户以为还在录
    const dis = CONSOLE.match(/function disposeTerminal\(w: OpsWin\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(dis, '找不到 disposeTerminal').not.toBe('');
    expect(dis).toMatch(/w\.termOpen = false/);
    expect(dis).toMatch(/w\.termRecording = false/);
  });

  it('★★ 断开的死句柄不许走进「接回已有终端」分支（否则点「连接终端」毫无反应）', () => {
    // 真实事故（2026-10-16 用户实报「点击连接终端也没用」）：WS 断开只置 termOpen=false、
    // 句柄留在 terms 里 → openTerminal 见句柄就 attachTerm → xterm 被挂进 v-show=false 的
    // 容器且 termOpen 再没被置回 true ⇒ 按钮看着完全没反应。
    const fn = CONSOLE.match(/async function openTerminal\(w: OpsWin\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 openTerminal').not.toBe('');
    expect(fn, '早退分支未判"仍然连着"').toMatch(/if \(alive && w\.termOpen\)/);
    expect(fn, '残留死句柄未释放就往下走').toMatch(/if \(alive\) disposeTerminal\(w\)/);
    // 统一收尾必须真的释放句柄，而不是只改标志位
    const mk = CONSOLE.match(/function markTermDisconnected\(w: OpsWin\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(mk, '找不到 markTermDisconnected').not.toBe('');
    expect(mk, '未释放句柄').toContain('disposeTerminal(w)');
  });
});

describe('OpsConsole · SSE 回退通道', () => {
  it('回退通道仍然完整（open/input/resize/close 四个端点都在）', () => {
    const fn = CONSOLE.match(/async function openSseTermTransport\([\s\S]*?\n\}/);
    expect(fn, '找不到 openSseTermTransport').toBeTruthy();
    expect(fn![0]).toMatch(/\/plugin\/ops-shell\/term\/open/);
    expect(fn![0]).toMatch(/term\/\$\{sessionId\}\/input/);
    expect(fn![0]).toMatch(/term\/\$\{sessionId\}\/resize/);
    expect(fn![0]).toMatch(/term\/\$\{sessionId\}\/close/);
  });

  it('★ SSE 的 fetch 必须走 buildRequestHeaders（只带 Authorization 会漏 x-license，开授权后终端一片空白）', () => {
    const fn = CONSOLE.match(/async function openSseTermTransport\([\s\S]*?\n\}/);
    expect(fn![0]).toMatch(/headers: buildRequestHeaders\(\)/);
  });

  it('两条通道共用同一份输出处理（不要各写一份 write/accumulate）', () => {
    expect(CONSOLE).toMatch(/const onOutput = \(text: string\) => \{/);
    expect(CONSOLE).toMatch(/openTermTransport\(w, c, cols, rows, onOutput\)/);
    // xterm 的写入只应出现在 onOutput 里，通道工厂不该各写一遍（否则两条路径会漂移）
    const wsFn = CONSOLE.match(/function openWsTermTransport\([\s\S]*?\n\}\n/);
    expect(wsFn, '找不到 openWsTermTransport').toBeTruthy();
    expect(wsFn![0]).not.toMatch(/\.term\.write\(/);
    expect(CONSOLE.match(/\.term\.write\(/g) ?? []).toHaveLength(1);
  });
});

describe('OpsConsole · resize 上报', () => {
  it('尺寸变化经通道上报，不再直接 POST（SSE 回退由通道内部处理）', () => {
    const fn = CONSOLE.match(/function scheduleResizePost\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(fn, '找不到 scheduleResizePost').toBeTruthy();
    expect(fn![0]).toMatch(/h\.transport\.resize\(cols, rows\)/);
    expect(fn![0]).not.toMatch(/api\.post/);
    // 没有通道时直接返回，避免连不上还狂发请求
    expect(fn![0]).toMatch(/if \(!h\.term \|\| !h\.transport\) return;/);
  });
});
