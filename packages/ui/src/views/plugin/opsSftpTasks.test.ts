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
/** 弹窗内容的样式住在全局表里（popper 会被 teleport 到 body，scoped 吃不到 data-v） */
const CSS = strip(readFileSync(resolve(__dirname, '../../styles/menu.css'), 'utf8'));

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

  // 2026-10-17 用户要求：「弄成 3 个 tab 页切换，这样每个 tab 页显示内容多点，
  // 每个 tab 页可以滚动，上面还能显示当前任务类型的任务数量」——于是三段堆叠改成 tab。
  it('★ 三个 tab 齐全（正在执行中 / 待执行 / 已执行完成），不再是堆叠的三段', () => {
    expect(SRC, '没有用 el-tabs').toMatch(/<el-tabs v-model="taskTab"/);
    expect(SRC, '缺「正在执行中」tab').toMatch(/<el-tab-pane name="running">[\s\S]{0,500}正在执行中<span class="stp-num"/);
    expect(SRC, '缺「待执行」tab').toMatch(/<el-tab-pane name="pending">[\s\S]{0,500}待执行<span class="stp-num"/);
    expect(SRC, '缺「已执行完成」tab').toMatch(/<el-tab-pane name="finished">[\s\S]{0,500}已执行完成<span class="stp-num"/);
    // 旧的"段标题"必须下线，否则就是两套分区并存
    expect(SRC, '旧的 .stp-group / .stp-title 还在').not.toMatch(/class="stp-group"|class="stp-title"/);
  });

  it('★ 数量标在 tab 上，且是**实时计数**（写死的数字没有意义）', () => {
    expect(SRC).toMatch(/stp-num[^>]*>\{\{ runningCount \}\}/);
    expect(SRC).toMatch(/stp-num[^>]*>\{\{ pendingFiles\.length \}\}/);
    expect(SRC).toMatch(/stp-num[^>]*>\{\{ finishedCount \}\}/);
    // 为 0 时压暗，别让一排"0"抢注意力
    expect(SRC).toMatch(/'is-zero'/);
  });

  it('★ 每个 tab 有自己的滚动容器（三份），高度有下限也有上限', () => {
    expect((SRC.match(/class="stp-pane"/g) ?? []).length, '三个 tab 没有各自的滚动容器').toBe(3);
    expect(CSS, '缺 .stp-pane 滚动规则').toMatch(/\.sftp-task-popper \.stp-pane \{[^}]*overflow: auto/);
    expect(CSS, '缺 .stp-pane 高度上限').toMatch(/\.sftp-task-popper \.stp-pane \{[^}]*max-height: 46vh/);
    // ★ 下限：只有一两行、或空的时候，弹窗不能塌成一条细缝
    expect(CSS, '缺 .stp-pane 高度下限').toMatch(/\.sftp-task-popper \.stp-pane \{[^}]*min-height: \d+px/);
    // 弹窗整体不再滚（否则 tab 头会被一起滚走）
    expect(CSS, '弹窗本体还在滚').not.toMatch(/\.sftp-task-pop \{[^}]*overflow: auto/);
  });

  // 用户原话：「没有任务的时候高度也能稍微高点，设置个最低高度和最高高度，
  //            没有任务显示中间图标加文字」
  it('★ 空状态是"图标 + 文字"，三个 tab 各一块，不是一行灰字', () => {
    expect((SRC.match(/class="stp-empty-state"/g) ?? []).length, '三个 tab 的空状态没改全').toBe(3);
    const cases = [
      ['VideoPlay', '没有正在执行的任务'],
      ['Clock', '没有排队中的文件'],
      ['CircleCheck', '还没有完成的任务'],
    ] as const;
    for (const [icon, text] of cases) {
      expect(SRC, `缺「${text}」的空状态（要图标 + 文案）`)
        .toMatch(new RegExp(`stp-empty-state">\\s*<el-icon><${icon} /><\\/el-icon>\\s*<span class="stp-empty-title">${text}</span>`));
    }
    expect(SRC, '图标没导入').toMatch(/CircleCheck, Clock/);
  });

  it('★ 空状态居中、有最小高度、图标有尺寸（否则就是几行贴顶的小字）', () => {
    expect(CSS, '缺 .stp-empty-state 布局').toMatch(/\.stp-empty-state \{[^}]*justify-content: center/);
    expect(CSS, '空状态没有最小高度').toMatch(/\.stp-empty-state \{[^}]*min-height: \d+px/);
    expect(CSS, '缺图标尺寸').toMatch(/\.stp-empty-state \.el-icon \{[^}]*font-size: \d+px/);
  });

  it('起任务时切到「正在执行」tab（否则新任务在别的页里，等于看不见）', () => {
    const fn = SRC.match(/const addTask = \([\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn, '找不到 addTask').not.toBe('');
    expect(fn, '起任务后没切 tab').toContain("taskTab.value = 'running'");
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

  it('★ 待执行 = 队列里还没轮到的那些（扣掉已完成与**在飞**的，一个都不能重复计）', () => {
    const fn = SRC.match(/const pendingFiles = computed\([\s\S]*?\n\}\);/)?.[0] ?? '';
    expect(fn, '找不到 pendingFiles').not.toBe('');
    expect(fn, '没限定上传任务').toContain("t.kind !== 'upload'");
    expect(fn, '没限定进行中').toContain("t.state !== 'running'");
    // ★ 少了 activeFiles.length 这一截，正在传的文件会被同时算进"待执行"（看着像重复排队）
    expect(fn, '切片没扣掉在飞的文件数').toMatch(/t\.files\.slice\(t\.doneCount \+ t\.activeFiles\.length\)/);
  });

  it('★ 并发窗口：展示"正在传 N 个"以及是哪几个', () => {
    expect(SRC, '任务模型缺 activeFiles').toMatch(/activeFiles: string\[\]/);
    expect(SRC, 'SSE 帧没落到 activeFiles').toMatch(/Array\.isArray\(d\.activeFiles\)/);
    expect(SRC, '没展示在飞文件数').toMatch(/\{\{ t\.activeFiles\.length \}\} 个/);
    expect(SRC, '暂停后仍显示"正在传"，看不出它停在断点上')
      .toMatch(/t\.paused \? '已停在断点' : '正在传'/);
    // 名字太长只报前几个，title 里给全量
    expect(SRC).toMatch(/function activeNames\(t: SftpTask\)/);
    expect(SRC).toMatch(/:title="t\.activeFiles\.join\('\\n'\)"/);
  });

  it('待执行清单有渲染上限（几千个文件不能全塞进 DOM）', () => {
    expect(SRC).toMatch(/const PENDING_ROWS = \d+/);
    expect(SRC).toMatch(/slice\(0, PENDING_ROWS\)/);
    expect(SRC, '超出部分没有收尾提示').toContain('pendingMore');
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

describe('已完成任务：明细可展开 + 历史入库', () => {
  // 用户原话：「已完成任务的明细也要能展示啊，这些数据都要入库的啊」
  it('★ 已完成行也能翻明细（删除看删掉了哪些，上传看传了哪些）', () => {
    expect(SRC).toMatch(/function detailRows\(t: SftpTask\)/);
    expect(SRC).toMatch(/function detailTitle\(t: SftpTask\)/);
    const finished = SRC.slice(SRC.indexOf('name="finished"'));
    expect(finished, '已完成行没有明细展开块').toMatch(/v-if="detailRows\(t\)\.length"/);
    expect(finished).toMatch(/detailTitle\(t\)/);
  });

  it('★ 明细取数：删除用 deleted、上传用 files（两者都得有）', () => {
    const fn = SRC.match(/function detailRows\(t: SftpTask\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 detailRows').not.toBe('');
    expect(fn).toContain("t.kind === 'delete' ? t.deleted : t.files.map");
  });

  it('★ 历史是**入库后读回来**的，不是只留在内存里', () => {
    expect(SRC, '没调历史接口').toContain('/plugin/ops-shell/sftp/jobs/history');
    expect(SRC, '挂载时没读历史').toMatch(/void loadTaskHistory\(\)/);
    // 落库记录要能还原成任务行：明细灌进 files / deleted
    const fn = SRC.match(/function toTaskRow\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 toTaskRow').not.toBe('');
    expect(fn, '删除明细没还原').toMatch(/deleted: h\.kind === 'delete' \? h\.detail : \[\]/);
    expect(fn, '上传明细没还原').toMatch(/files: h\.kind === 'delete' \? \[\] : h\.detail/);
  });

  it('★「清除已完成」连库一起清，且先弹窗确认', () => {
    const fn = SRC.match(/async function clearFinishedTasks\(\): Promise<void> \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 clearFinishedTasks').not.toBe('');
    expect(fn, '没弹确认框（删了不可恢复）').toContain('ElMessageBox.confirm');
    expect(fn, '没删库里的历史 —— 只清视图等于骗人')
      .toContain("api.delete<{ cleared: boolean }>('/plugin/ops-shell/sftp/jobs/history')");
  });

  it('★ 单条已完成也能删，历史一并删掉', () => {
    const fn = SRC.match(/async function removeFinishedTask\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 removeFinishedTask').not.toBe('');
    expect(fn, '没弹确认框').toContain('ElMessageBox.confirm');
    expect(fn, '没调单条删除接口')
      .toContain('/plugin/ops-shell/sftp/jobs/history/${encodeURIComponent(t.id)}');
    const finished = SRC.slice(SRC.indexOf('name="finished"'));
    expect(finished, '已完成行上没有删除入口').toMatch(/removeFinishedTask\(t\)/);
    expect(finished, '删除按钮没图标').toMatch(/:icon="Close"/);
  });
});
//   ① 「顶多加个暂停任务按钮」—— 待执行本来就是自动跑的，不需要"点开始"；
//   ② 「点了暂停正在执行的任务和待执行的都得暂停，还得支持断点续传」——
//      所以暂停是后端调度的事（在飞的那个也停在断点），前端只负责发指令 + 如实显示。
describe('暂停 / 继续 + 断点续传', () => {
  it('★ 任务模型带 paused，SSE 帧把它落进任务行', () => {
    expect(SRC, 'SftpTask 缺 paused').toMatch(/paused: boolean/);
    expect(SRC, 'SSE 帧没落到 paused').toMatch(/typeof d\.paused === 'boolean'/);
    expect(SRC, '新建任务没给 paused 初值').toMatch(/paused: false/);
  });

  it('★ 暂停按钮只在上传任务上（下载/删除中途停没有安全点，后端会拒）', () => {
    expect(SRC).toMatch(/v-if="t\.kind === 'upload'"[\s\S]{0,400}togglePause\(t\)/);
    expect(SRC, '按钮没有随状态切换图标').toMatch(/:icon="t\.paused \? VideoPlay : VideoPause"/);
    expect(SRC, '缺 VideoPause 图标导入').toMatch(/\bVideoPause, VideoPlay\b/);
  });

  it('★ 暂停状态要看得见（只有图标的话用户不知道停在哪了）', () => {
    expect(SRC).toMatch(/class="stp-paused"/);
    expect(SRC).toContain('已暂停');
  });

  it('★ 调后端的暂停接口，并用响应里的 paused 回写（不靠本地猜）', () => {
    const fn = SRC.match(/async function togglePause\([\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn, '找不到 togglePause').not.toBe('');
    expect(fn).toContain('/plugin/ops-shell/sftp/job/pause');
    expect(fn, '没把 jobId 一起发').toMatch(/jobId: t\.id/);
    expect(fn, '拿本地状态改了就算数（应该以服务端返回为准）').toMatch(/row\.paused = /);
  });

  it('★ 断点续传要对用户可见（否则"暂停后从一半接着传"看不出来）', () => {
    expect(SRC, '暂停按钮的提示词没提断点').toMatch(/从断点接着传/);
    expect(SRC, '「已暂停」的说明没提断点').toMatch(/断点/);
  });
});
