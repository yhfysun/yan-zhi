/**
 * CDP 端点重解析（B8，2026-10-09）守门测试。
 *
 * 背景（实测）：桌面端 CDP 端口默认**自动分配**（`remote-debugging-port=0`），
 *   实际端口写在 `userData/DevToolsActivePort`。主进程把解析结果经 env 注入服务端 ——
 *   这条路径本身是对的。但**服务端是独立进程**：桌面主进程崩溃/重启后（端口重新分配）
 *   而服务端仍活着时，服务端会拿旧端点**永远** ECONNREFUSED
 *   （三次重试全打在已无人监听的端口上，重试也没意义）。
 *
 * 本测试钉：
 *   ① 端点从 `const` 改为可变 + 有重解析函数；
 *   ② 重解析的**目录候选**与 `bin/dev.mjs` **同源**（dev / 打包两套 userData 都要覆盖）；
 *   ③ 端口范围校验（>0 且 <65536，挡住 file 里的 `devtools` 第二行或脏数据）；
 *   ④ ★★★ 只在**失败后**才重解析（成功路径零开销、行为不变）；
 *   ⑤ ★★ 重解析结果必须**写回** `CDP_ENDPOINT`（否则下次 getBrowser 又用旧端点，
 *      等于只修了"这一次重试"，下次仍失败）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const BROWSER = read('apps/server/src/routes/browser.ts');
const DEV_MJS = read('bin/dev.mjs');
const MAIN = read('apps/desktop/main.cjs');

describe('① 端点可变 + 重解析函数存在', () => {
  it('★★ CDP_ENDPOINT 不能是 const（否则无法重解析后写回）', () => {
    expect(BROWSER, '★ CDP_ENDPOINT 仍是 const → 重解析结果写不回去（下次仍用旧端点）')
      .toMatch(/let CDP_ENDPOINT\s*=/);
    expect(BROWSER, '★ 已无 const CDP_ENDPOINT').not.toMatch(/const CDP_ENDPOINT\s*=/);
  });

  it('★★ 必须有 reResolveCdpEndpoint', () => {
    expect(BROWSER, '★ 缺重解析函数（主进程重启后服务端永远连旧端口）')
      .toMatch(/function reResolveCdpEndpoint\s*\(/);
  });
});

describe('② 目录候选必须与 dev.mjs/main.cjs 同源', () => {
  it('★★★ 必须覆盖 dev 与打包两套 userData 目录', () => {
    const i = BROWSER.indexOf('function reResolveCdpEndpoint');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 缺 yan-zhi-dev（开发版 userData）').toMatch(/yan-zhi-dev/);
    expect(body, '★ 缺 yan-zhi（打包版 userData）').toMatch(/'yan-zhi'/);
  });

  it('★★ 必须读 DevToolsActivePort 文件名（三处同源）', () => {
    for (const [name, src] of [['browser.ts', BROWSER], ['dev.mjs', DEV_MJS], ['main.cjs', MAIN]] as const) {
      expect(src, `★ ${name} 未读 DevToolsActivePort`).toMatch(/DevToolsActivePort/);
    }
  });

  it('★★ 三端的平台差异处理必须一致（darwin/win32/其它）', () => {
    const i = BROWSER.indexOf('function reResolveCdpEndpoint');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 缺 darwin 分支').toMatch(/darwin/);
    expect(body, '★ 缺 win32 分支').toMatch(/win32/);
    // dev.mjs 的写法（作为"同源"基准）
    expect(DEV_MJS, '★ dev.mjs 里找不到平台分支（基准变了）').toMatch(/darwin/);
  });
});

describe('③ 端口校验', () => {
  it('★★ 必须校验端口范围（挡脏数据）', () => {
    const i = BROWSER.indexOf('function reResolveCdpEndpoint');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 未校验 port > 0').toMatch(/port\s*>\s*0/);
    expect(body, '★ 未校验 port < 65536').toMatch(/port\s*<\s*65536/);
  });

  it('★★ 只取首行（DevToolsActivePort 第二行是 devtools 路径）', () => {
    const i = BROWSER.indexOf('function reResolveCdpEndpoint');
    const body = BROWSER.slice(i, i + 1600);
    // 源码里的写法是 split(/\r?\n/)[0]；在**正则字面量**里匹配它需要恰当转义：
    //   /\[\0\]/ 部分用普通字符串包含判断更稳（避免多层转义搞错，第一版就写错了层级）。
    expect(body, '★ 未取 split 后的 [0]（第二行是 devtools 路径，parseInt 会得 NaN/0）')
      .toContain('split(/\\r?\\n/)[0]');
  });
});

describe('④⑤ 调用时机与写回', () => {
  it('★★★ 必须在连接**失败后**才重解析（成功路径零开销）', () => {
    const i = BROWSER.indexOf('async function connectCdpWithRetry');
    const body = BROWSER.slice(i, i + 1600);
    const catchIdx = body.indexOf('catch');
    const reIdx = body.indexOf('reResolveCdpEndpoint()');
    expect(catchIdx, '★ 锚点缺失：catch').toBeGreaterThan(-1);
    expect(reIdx, '★ 未在连接失败路径里重解析').toBeGreaterThan(-1);
    expect(reIdx, '★ 重解析发生在 try/catch 之外（成功路径也会重读文件，白开销）')
      .toBeGreaterThan(catchIdx);
  });

  it('★★★ 重解析结果必须写回 CDP_ENDPOINT（否则下次 getBrowser 仍用旧端点）', () => {
    const i = BROWSER.indexOf('async function connectCdpWithRetry');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 未写回 CDP_ENDPOINT → 只修了本次重试，下次仍连旧端口（静默半修）')
      .toMatch(/CDP_ENDPOINT\s*=\s*fresh/);
  });

  it('★★ 必须仍保留原有退避重试（不因加重解析而丢掉）', () => {
    const i = BROWSER.indexOf('async function connectCdpWithRetry');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 退避重试丢失').toMatch(/setTimeout/);
    expect(body, '★ 重试次数变了').toMatch(/attempt < 3/);
  });

  it('★★ 重解析只在端点**变化**时采用（不变则不折腾）', () => {
    const i = BROWSER.indexOf('async function connectCdpWithRetry');
    const body = BROWSER.slice(i, i + 1600);
    expect(body, '★ 未判断端点是否变化').toMatch(/fresh\s*!==\s*ep/);
  });
});