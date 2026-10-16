// SFTP 传输任务列表契约（2026-10-16）
//
// 背景（用户原话）：「运维模式删除远程目录或者文件都要有记录，尤其是删除目录最后有个地方
//   能看到实时删除的文件，还有上传文件和目录也要有任务列表可以看到进度」
//   —— 旧实现只有一条 `transfer` 聚合进度条：同时干两件事会互相覆盖 label，删目录时既不知道
//   删到哪儿了、也看不到「删了哪些」，上传文件夹同样没有逐个文件的进度概念。
//
// 判据全是结构可判（谁建任务、谁订阅、终态怎么判、明细有没有上限），
// 与 opsSftpMenu.test.ts 同口径：剥注释后再匹配，避免被说明性注释喂饱。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');
const SRC = strip(readFileSync(resolve(__dirname, 'SftpPanel.vue'), 'utf8'));

describe('任务列表：三种操作统一进列表', () => {
  it('面板存在，且只在有任务时渲染（常驻一个空壳是噪音）', () => {
    expect(SRC).toMatch(/v-if="tasks\.length"/);
    expect(SRC).toMatch(/class="sftp-tasks"/);
  });

  it('★ 上传 / 下载 / 删除都登记任务（漏一个就等于那种操作没有进度）', () => {
    const adds = SRC.match(/addTask\(/g) ?? [];
    expect(adds.length, '建任务的调用点少于 3 处').toBeGreaterThanOrEqual(3);
    expect(SRC, '上传未建任务').toMatch(/addTask\(r\.data\.jobId, 'upload'/);
    expect(SRC, '下载未建任务').toMatch(/addTask\(r\.data\.jobId, 'download'/);
    expect(SRC, '删除未建任务').toMatch(/addTask\(res\.data\.jobId, 'delete'/);
  });

  it('★ 删除任务登记后要订阅进度（否则"实时删除的文件"根本不流过来）', () => {
    const seg = SRC.slice(SRC.indexOf("addTask(res.data.jobId, 'delete'"));
    expect(seg.slice(0, 200)).toMatch(/await subscribeTask\(res\.data\.jobId\)/);
  });

  it('★ 删除任务的名字区分目录/文件（后端先 lstat 探类型，前端如实显示）', () => {
    expect(SRC).toMatch(/res\.data\.isDir \? '删除目录' : '删除文件'/);
  });
});

describe('进度订阅：终态以 state 为准', () => {
  it('★ 不再靠读字节哨兵猜状态（旧实现漏读最后一帧就永远显示进行中）', () => {
    const fn = SRC.match(/async function subscribeTask\([\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, '找不到 subscribeTask').not.toBe('');
    expect(fn, '未认 state 终态').toMatch(/data\.state === 'done' \|\| data\.state === 'failed'/);
    // 哨兵值判据必须彻底消失（transferred === 0 && total === 1 之类的旧暗号）
    expect(fn, '仍在使用旧的字节哨兵').not.toMatch(/transferred === 0/);
  });

  it('★ 流关了却没见终态帧 → 如实标失败，而不是装作完成', () => {
    const fn = SRC.match(/async function subscribeTask\([\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, '缺少 sawFinal 记录').toContain('sawFinal');
    expect(fn, '中断未落成失败态').toMatch(/t\.state = 'failed'/);
  });

  it('旧的单条 transfer 进度条已下线（留着就是两套状态互相打脸）', () => {
    expect(SRC).not.toMatch(/sftp-progress/);
    expect(SRC).not.toMatch(/const transfer = ref\(/);
  });
});

describe('删除明细：实时滚动 + 有上限', () => {
  it('★ 明细按 deletedCount 的增量追加，不是整段重放（否则同一批会重复显示）', () => {
    const fn = SRC.match(/function applyJobFrame\([\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, '找不到 applyJobFrame').not.toBe('');
    expect(fn, '未用增量').toContain('const delta = d.deletedCount - t.deletedCount');
    expect(fn, '未按增量切片').toMatch(/slice\(all\.length - delta\)/);
  });

  it('★ 前端保留与渲染都有上限（长任务不能把 DOM 撑爆）', () => {
    expect(SRC).toMatch(/const DELETED_KEEP = \d+/);
    expect(SRC).toMatch(/const DELETED_ROWS = \d+/);
    expect(SRC, '未按上限裁剪').toMatch(/\.slice\(-DELETED_KEEP\)/);
    expect(SRC, '渲染未限量').toMatch(/\.slice\(-DELETED_ROWS\)/);
  });

  it('明细默认收起、点开才渲染（列表本身要能一眼看完）', () => {
    expect(SRC).toMatch(/t\.expanded = !t\.expanded/);
    expect(SRC).toMatch(/v-if="t\.expanded"/);
  });
});

describe('列表本身可用', () => {
  it('进行中的排前面，且能一键清掉已完成的', () => {
    expect(SRC).toMatch(/const orderedTasks = computed/);
    expect(SRC).toMatch(/function clearFinishedTasks\(\)/);
    expect(SRC).toMatch(/tasks\.value\.filter\(\(t\) => t\.state === 'running'\)/);
  });

  it('任务行建好后一律经 taskOf 取**响应式代理**再改（否则改了不渲染）', () => {
    expect(SRC).toMatch(/tasks\.value = \[\.\.\.tasks\.value, \{/);
    expect(SRC, '缺少按 id 取代理的入口').toMatch(/const taskOf = \(id: string\): SftpTask \| undefined => tasks\.value\.find/);
  });
});
