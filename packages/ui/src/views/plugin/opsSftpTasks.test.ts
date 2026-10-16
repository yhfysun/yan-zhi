// SFTP 任务中心契约（2026-10-16）
//
// 背景（用户原话两轮）：
//   ① 「运维模式删除远程目录或者文件都要有记录，尤其是删除目录最后有个地方能看到实时删除
//      的文件，还有上传文件和目录也要有任务列表可以看到进度」—— 于是有了任务模型；
//   ② 「任务展示地方不对，可以在刷新旁边弄个任务图标按钮点击后下拉弹窗显示任务详情，
//      正在执行中，已执行完成，待执行任务（主要是上传文件）可以先把要上传的文件扫描后排队上传」
//      —— 于是任务从**内嵌面板**挪到**刷新旁边的图标按钮 + 下拉弹窗**，并分成三段，
//         上传改成"后端先扫描出清单 → 按清单排队传"。
//
// 判据全是结构可判（入口在哪、三段在不在、队列怎么切、上限有没有），与 opsSftpMenu.test.ts
// 同口径：剥注释后再匹配，避免被说明性注释喂饱。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');
const SRC = strip(readFileSync(resolve(__dirname, 'SftpPanel.vue'), 'utf8'));

describe('任务中心：刷新旁边的图标按钮 + 下拉弹窗', () => {
  it('★ 入口是图标按钮上的下拉弹窗（用户拍板：不再内嵌在文件面板里占高度）', () => {
    expect(SRC).toMatch(/<el-popover[\s\S]{0,200}v-model:visible="tasksOpen"/);
    expect(SRC, '弹窗应为点击触发').toMatch(/trigger="click"/);
    expect(SRC, '图标按钮缺少 Tickets 图标').toMatch(/:icon="Tickets"/);
    // 角标 = 进行中的任务数，用户一眼能看到有活在跑
    expect(SRC).toMatch(/<el-badge :value="runningCount"/);
    // 旧的常驻面板必须彻底消失，否则又占着文件列表的高度
    expect(SRC, '旧的内嵌任务面板还在').not.toMatch(/class="sftp-tasks"/);
  });

  it('★ 按钮就挂在「刷新」旁边（.sftp-head-actions 里，Refresh 之前）', () => {
    const head = SRC.slice(SRC.indexOf('class="sftp-head-actions"'));
    const popIdx = head.indexOf('<el-popover');
    const refreshIdx = head.indexOf(':icon="Refresh"');
    expect(popIdx, '头部操作区里找不到任务弹窗').toBeGreaterThan(-1);
    expect(refreshIdx, '头部操作区里找不到刷新按钮').toBeGreaterThan(-1);
    expect(popIdx, '任务按钮没挨着刷新（顺序变了）').toBeLessThan(refreshIdx);
  });

  it('★ 三段分组齐全：正在执行中 / 待执行 / 已执行完成', () => {
    expect(SRC, '缺「正在执行中」段').toMatch(/正在执行中（\{\{ runningCount \}\}）/);
    expect(SRC, '缺「待执行」段').toMatch(/待执行（\{\{ pendingFiles\.length \}\}）/);
    expect(SRC, '缺「已执行完成」段').toMatch(/已执行完成（\{\{ finishedCount \}\}）/);
  });

  it('已完成段不无限长（弹窗要一眼看完）', () => {
    expect(SRC).toMatch(/const FINISHED_ROWS = \d+/);
    expect(SRC).toMatch(/slice\(-FINISHED_ROWS\)/);
    expect(SRC, '缺"另有 N 条"的收尾').toMatch(/另有 \{\{ finishedCount - finishedTasks\.length \}\} 条/);
  });
});

describe('上传：先扫描成队列，再排队执行', () => {
  it('★ 队列来自后端回传的扫描清单 plan（不是等传完才知道有哪些文件）', () => {
    expect(SRC, '上传响应类型里没有 plan').toMatch(/plan\?: Array<\{ name: string; size: number \}>/);
    expect(SRC, '没把 plan 灌进任务').toMatch(/files: r\.data\.plan \?\? \[\]/);
    expect(SRC, '没把截断标记灌进任务').toMatch(/filesTruncated: r\.data\.planTruncated/);
  });

  it('★ 待执行 = 队列里还没轮到的那些（按 doneCount 切，且跳过正在传的那一个）', () => {
    const fn = SRC.match(/const pendingFiles = computed\([\s\S]*?\n\}\);/)?.[0] ?? '';
    expect(fn, '找不到 pendingFiles').not.toBe('');
    expect(fn, '没限定上传任务').toContain("t.kind !== 'upload'");
    expect(fn, '没限定进行中').toContain("t.state !== 'running'");
    expect(fn, '切片起点不对（会把正在传的那个也算进待执行）').toMatch(/t\.files\.slice\(t\.doneCount \+ 1\)/);
  });

  it('待执行清单有渲染上限（几千个文件不能全塞进 DOM）', () => {
    expect(SRC).toMatch(/const PENDING_ROWS = \d+/);
    expect(SRC).toMatch(/slice\(0, PENDING_ROWS\)/);
    expect(SRC, '超出部分没有收尾提示').toContain('pendingMore');
  });

  it('正在执行里显示"正在传哪个文件"', () => {
    expect(SRC).toMatch(/正在传输：\{\{ basename\(t\.currentFile\) \}\}/);
  });
});

describe('进度订阅：终态以 state 为准', () => {
  it('★ 不再靠读字节哨兵猜状态（旧实现漏读最后一帧就永远显示进行中）', () => {
    const fn = SRC.match(/async function subscribeTask\([\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, '找不到 subscribeTask').not.toBe('');
    expect(fn, '未认 state 终态').toMatch(/data\.state === 'done' \|\| data\.state === 'failed'/);
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

  it('明细默认收起、点开才渲染（弹窗本身要能一眼看完）', () => {
    expect(SRC).toMatch(/t\.expanded = !t\.expanded/);
    expect(SRC).toMatch(/v-if="t\.expanded"/);
  });
});

describe('任务状态本身可用', () => {
  it('进行中的排前面并有计数，且能一键清掉已完成的', () => {
    expect(SRC).toMatch(/const runningTasks = computed/);
    expect(SRC).toMatch(/const finishedTasks = computed/);
    expect(SRC).toMatch(/function clearFinishedTasks\(\)/);
    expect(SRC).toMatch(/tasks\.value\.filter\(\(t\) => t\.state === 'running'\)/);
  });

  it('起任务时把弹窗打开（要能看见"扫描后排队"，藏在图标后面等于没有）', () => {
    const fn = SRC.match(/const addTask = \([\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn, '找不到 addTask').not.toBe('');
    expect(fn, '起任务后没展开弹窗').toMatch(/tasksOpen\.value = true/);
  });

  it('任务行建好后一律经 taskOf 取**响应式代理**再改（否则改了不渲染）', () => {
    expect(SRC).toMatch(/tasks\.value = \[\.\.\.tasks\.value, \{/);
    expect(SRC, '缺少按 id 取代理的入口').toMatch(/const taskOf = \(id: string\): SftpTask \| undefined => tasks\.value\.find/);
  });
});
