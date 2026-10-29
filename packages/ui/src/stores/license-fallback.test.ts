// 2026-10-24 实报回归：「任务跑着跑着自动断了，还跳到未授权页面」。
//
// 两条独立但叠加的成因，本文件各守一条：
//   ① 看门狗阈值 15s 太紧：2224 条消息的会话首屏渲染要 16~35s（主进程日志 18 次
//      「心跳停止 15xxx~35209ms」），被误判成卡死后重载 → 又从头渲染 → 死循环；
//   ② 授权兜底：后端 tsx watch 重启的那两三秒里 `/license/verify` 失败，
//      旧代码把「网络失败」当成「授权无效」→ 删掉 keyring 里的授权码 + 踢到 /license。
//
// 为什么读源码断言而不是跑真环境：判据是结构性的（阈值数字、错误分支走向、兜底入口
// 是否在 `!beReady` 分支里），跑起来要真后端 + keyring + pinia，同口径见
// composables/coldStartBusinessData.test.ts 顶部说明。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');
const LICENSE = readFileSync(resolve(REPO, 'packages/ui/src/stores/license.ts'), 'utf8');

/** 去注释：注释里同样会出现这些标识符，不去掉会被注释喂饱。 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const LICENSE_CODE = strip(LICENSE);

/** 按大括号配平截取具名函数源码。 */
function fnSource(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `未找到 function ${name}(`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let i = src.indexOf('{', start);
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`function ${name} 大括号不配平`);
}

describe('看门狗：只在真卡死时重载', () => {
  it('连续无响应阈值 ≥ 45s（长会话首屏渲染实测 35s，忙 ≠ 死）', () => {
    const m = MAIN.match(/RENDERER_DEAD_AFTER_MS\s*=\s*(\d+)/);
    expect(m, '未找到 RENDERER_DEAD_AFTER_MS').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(45000);
  });

  it('判活用不可被节流的信号：主动探活，不再依赖渲染层心跳定时器', () => {
    // 2026-10-27 实报：心跳是 setInterval，窗口被遮挡/切后台时被 Chromium 节流到 1 分钟，
    // 于是"定时器停"被误判成"主线程卡死" → 两次 46~47s 误重载（自己和自己打架）。
    // 钉死：心跳通道移除，判活只看 executeJavaScript 回包。
    expect(MAIN).not.toContain('yz:renderer-heartbeat');
    expect(MAIN).toMatch(/function probeRendererAlive\(wc\)/);
    expect(MAIN).toMatch(/executeJavaScript\('1'/);
  });

  it('重载冷却 ≥ 60s，避免 30s 一轮的重载循环', () => {
    const m = MAIN.match(/RENDERER_RELOAD_COOLDOWN_MS\s*=\s*(\d+)/);
    expect(m, '未找到 RENDERER_RELOAD_COOLDOWN_MS').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(60000);
  });
});

describe('授权兜底：网络失败 ≠ 授权失效', () => {
  it('verify 请求失败时直接返回，不删本地授权码', () => {
    const body = fnSource(LICENSE_CODE, 'verifyCurrentCode');
    const errIdx = body.indexOf("'error' in result");
    expect(errIdx, 'verifyCurrentCode 缺少错误分支').toBeGreaterThanOrEqual(0);
    // 错误分支必须 return false（交给调用方保留授权态）
    expect(body.slice(errIdx, errIdx + 120)).toMatch(/return false/);
    // clearLicenseCode 只能出现在后端明确回「无效」之后
    const clearIdx = body.indexOf('clearLicenseCode');
    expect(clearIdx, '无效授权码需要清理 keyring').toBeGreaterThan(errIdx);
  });

  it('后端未就绪时先用上次校验通过的缓存放行', () => {
    const body = fnSource(LICENSE_CODE, 'init');
    const notReady = body.indexOf('if (!beReady)');
    expect(notReady, 'init 缺少 !beReady 分支').toBeGreaterThanOrEqual(0);
    const nextBlock = body.slice(notReady, body.indexOf('await verifyCurrentCode'));
    expect(nextBlock).toMatch(/restoreFromCache\(\)/);
    expect(nextBlock).toMatch(/revalidateWhenBackendReady\(\)/);
  });

  it('校验通过与激活成功都要写缓存，停用要清缓存', () => {
    expect(fnSource(LICENSE_CODE, 'verifyCurrentCode')).toMatch(/rememberVerified\(/);
    expect(fnSource(LICENSE_CODE, 'activate')).toMatch(/rememberVerified\(/);
    expect(fnSource(LICENSE_CODE, 'deactivate')).toMatch(/forgetVerified\(\)/);
  });

  it('缓存过期（expireAt 已过）不得放行', () => {
    const body = fnSource(LICENSE_CODE, 'readLastVerified');
    expect(body).toMatch(/expireAt/);
    expect(body).toMatch(/exp\s*<\s*Date\.now\(\)/);
  });
});
