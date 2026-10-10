/**
 * 输入区发送可用性 + 消息渲染性能守门测试（2026-10-10，用户实报修复）。
 *
 * 三条实报症状：
 *   ①「追加任务时发送按钮是禁用状态」→ 按钮 disabled 误把重入锁 `sending` 当成了"禁止发送"。
 *   ②「发送按钮应该只有内容全空才禁用」→ 三处判据（按钮 / canSubmit / canSend）漂移。
 *   ③「pageAgent 一跑整个页面卡」→ 两处性能洞：renderMarkdown 无缓存 + browserSteps 无上限。
 *
 * 本测试全部走**源码静态断言**（ui 包依赖重，且本机 vitest 未装全，不宜整体挂载）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = readFileSync(resolve(__dirname, '../../components/chat/ChatInputArea.vue'), 'utf8');
const CHAT = readFileSync(resolve(__dirname, 'useChat.ts'), 'utf8');
const STORE = readFileSync(resolve(__dirname, '../../stores/chat.ts'), 'utf8');

describe('发送按钮禁用条件（症状①②）', () => {
  it('★ 按钮 disabled 只看 canSubmit —— 不得再挂 sending / streaming', () => {
    // 取发送按钮那一行
    const m = INPUT.match(/<el-button[^>]*class="send-btn"[^>]*\/>/);
    expect(m, '★ 找不到发送按钮').not.toBeNull();
    const btn = m![0];
    expect(btn, '★ 发送按钮仍把 sending 挂进 disabled（任务跑着/建会话窗口期点不动）').toMatch(/:disabled="!canSubmit"/);
    expect(btn, '★ 发送按钮仍内联旧的四段式 disabled 表达式').not.toMatch(/:disabled="sending \|\|/);
    expect(btn, '★ 发送按钮未复用 canSubmit').not.toMatch(/uploadedFiles\.length === 0 && quotedUrls\.length === 0/);
  });

  it('★ canSubmit 判据 = 有内容（文字/文件/引用任一）且选了模型', () => {
    const i = INPUT.indexOf('const canSubmit = computed');
    expect(i, '★ 找不到 canSubmit').toBeGreaterThan(-1);
    const body = INPUT.slice(i, i + 700);
    expect(body).toMatch(/input\.value\.trim\(\)/);
    expect(body).toMatch(/uploadedFiles\.value\.length\s*>\s*0/);
    expect(body).toMatch(/quotedUrls\.value\.length\s*>\s*0/);
    expect(body).toMatch(/!!selectedModelId\.value/);
    // 不得含 sending / streaming 语义
    expect(body, '★ canSubmit 混入了 sending').not.toMatch(/\bsending\b/);
    expect(body, '★ canSubmit 混入了 streaming').not.toMatch(/streaming/);
  });

  it('★ canSend（useChat 侧）与 canSubmit 同口径 —— 不得再用 !isConvStreaming 拦发送', () => {
    const i = CHAT.indexOf('const canSend = computed');
    expect(i, '★ 找不到 canSend').toBeGreaterThan(-1);
    // 取该行（computed 是单行）
    const line = CHAT.slice(i, CHAT.indexOf('\n', i));
    expect(line, '★ canSend 仍在用 !isConvStreaming 拦发送（与"追加队列"设计冲突）')
      .not.toMatch(/isConvStreaming/);
    expect(line).toMatch(/input\.value\.trim\(\)/);
    expect(line).toMatch(/!!selectedModelId\.value/);
  });

  it('行为语义：入队分支自身无 await（点追加即入队，不被网络/落盘拖住）', () => {
    const i = CHAT.indexOf('if (runningConv && store.isConvStreaming(runningConv)) {');
    expect(i, '★ 找不到追加队列分支').toBeGreaterThan(-1);
    const body = CHAT.slice(i, i + 700);
    expect(body, '★ 追加分支里找不到 enqueueMessage').toMatch(/store\.enqueueMessage\(/);
    // 该分支必须**同步**入队后 return —— 中间不得插入 await
    const seg = body.slice(0, body.indexOf('return;'));
    expect(seg, '★ 追加分支内出现 await —— 点"发送"后要先等网络/落盘才入队').not.toMatch(/\bawait\b/);
  });
});

describe('Markdown 渲染缓存（症状③ · 整页卡）', () => {
  it('★ renderMarkdown 命中缓存即返回，不再每次都 md.render', () => {
    const i = CHAT.indexOf('function renderMarkdown');
    expect(i, '★ 找不到 renderMarkdown').toBeGreaterThan(-1);
    // 常量声明在函数**之前** → 窗口往前取，覆盖声明段到函数体
    const start = Math.max(0, CHAT.lastIndexOf('const mdCache', i) - 400);
    const body = CHAT.slice(start, i + 900);
    expect(body, '★ 缺缓存 Map').toMatch(/const\s+mdCache\s*=\s*new Map/);
    expect(body, '★ 未先查缓存').toMatch(/mdCache\.get\(/);
    expect(body, '★ 未写回缓存').toMatch(/mdCache\.set\(/);
    expect(body, '★ 缺 LRU 上限').toMatch(/MD_CACHE_MAX/);
    // 必须仍有 md.render 兜底（缓存未命中时）
    expect(body).toMatch(/md\.render\(/);
  });
});

describe('browserSteps 容量上限（症状③ · 内存与重渲）', () => {
  it('★ 只经 pushBrowserStep 写入，且带容量与单条截断', () => {
    const i = STORE.indexOf('function pushBrowserStep');
    expect(i, '★ 找不到 pushBrowserStep').toBeGreaterThan(-1);
    const body = STORE.slice(i, i + 1600);
    expect(body, '★ 缺容量上限常量').toMatch(/BROWSER_STEPS_MAX/);
    expect(body, '★ 缺单条长度上限常量').toMatch(/BROWSER_STEP_RESULT_MAX/);
    expect(body, '★ 未做超限裁剪').toMatch(/splice\(0,/);
  });

  it('★ 所有 browser_* 步骤登记点都走 pushBrowserStep（无裸 push 散落）', () => {
    // 允许 helper 内部那一处裸 push
    const raw = (STORE.match(/browserSteps\.value\.push\(/g) || []).length;
    expect(raw, `★ 仍有 ${raw} 处裸 push（应为 1：helper 内部）`).toBe(1);
    const calls = (STORE.match(/pushBrowserStep\(/g) || []).length;
    // 1 处定义 + 8 处调用点
    expect(calls, '★ pushBrowserStep 调用点数量异常（应 >= 8 + 定义 1）').toBeGreaterThanOrEqual(9);
  });
});
