/**
 * 多模态「注入期展开」（C1，2026-10-09）守门测试。
 *
 * 背景（实测）：`Message.content` 只能是 string，`toApiMessage` 从不组装 `image_url`
 *   → **模型从未真正收到过图像**；截图分析是"假的"（靠模型自觉再调 `image_analyze`，
 *   而那个工具只在**前端**可执行，服务端全仓无 vision 调用）。
 *
 * 设计：**不把 `content` 改成 `ContentBlock[]` 落库**（`content` 被
 *   `sanitizeToolMessages` 的字符串拼接 / `estimateTokens` / 前端渲染三处当字符串用，
 *   改成数组会静默产出 `[object Object]` 或抛错），而是：
 *   落库仍纯字符串 → 发送前解析 `已存档: <path>` 标记 → 写 `imageParts` →
 *   `toApiMessage` 组装 `[{type:'text'},{type:'image_url'}]`（**唯一**产出数组处）。
 *
 * 本测试钉：
 *   ① 类型层：`imageParts` / `imagePartsTried` 存在；
 *   ② `toApiMessage` 真有 image_url 分支（且无 parts 时**保持字符串**，不回归）；
 *   ③ 服务端 attach 函数存在并被**主循环 + 子循环**调用（子智能体是最常截图的一方）；
 *   ④ Anthropic 侧能认这个数组（`toAnthropicBlocks` 的 image_url 分支，真跑）；
 *   ⑤ **base64 绝不进库/进快照**（只改 llmMessages，落库仍走 insertMessage）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TYPES = strip(read('packages/shared/src/types/index.ts'));
const CLIENT = strip(read('packages/core/src/llm/client.ts'));
const ANTH = strip(read('packages/core/src/llm/anthropic.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SNAP = strip(read('apps/server/src/services/context-snapshot.ts'));

describe('① 类型层', () => {
  it('★★ Message 必须有 imageParts（仅发送期，不落库）', () => {
    expect(TYPES, '★ 缺 imageParts —— 没有承载图片的通道').toMatch(/imageParts\?:/);
  });

  it('★★ 必须有 imagePartsTried（避免每步重复 stat 失效路径）', () => {
    expect(TYPES, '★ 缺 imagePartsTried → 失效路径会被每步重试（长任务白跑几百次日志）')
      .toMatch(/imagePartsTried\?:/);
  });

  it('★★★ 必须保留 content 为 string（不得改成 ContentBlock[]）', () => {
    // content 被字符串拼接/估算/渲染三处消费；改成数组会静默坏掉
    expect(TYPES, '★ content 被改成数组类型（会破坏 sanitizeToolMessages 的字符串拼接）')
      .toMatch(/content\?: string;/);
  });
});

describe('② toApiMessage（唯一协议转换出口）', () => {
  it('★★★ 必须真有 image_url 组装分支', () => {
    const i = CLIENT.indexOf('private toApiMessage');
    const body = CLIENT.slice(i, i + 2200);
    expect(body, '★ toApiMessage 仍不组装 image_url → 模型永远收不到图').toMatch(/image_url/);
    expect(body, '★ 未构造 data URL').toMatch(/data:\$\{/);
  });

  it('★★★ 无 imageParts 时必须保持字符串 content（不得回归）', () => {
    const i = CLIENT.indexOf('private toApiMessage');
    const body = CLIENT.slice(i, i + 2200);
    // 必须有 else 分支写字符串
    expect(body, '★ 无 imageParts 时未回落到字符串 content（可能把普通消息也变成数组）')
      .toMatch(/else if \(m\.content !== undefined\)/);
  });

  it('★★ 空 base64 必须跳过（否则产出上游无法解析的空图块 → 400）', () => {
    const i = CLIENT.indexOf('private toApiMessage');
    const body = CLIENT.slice(i, i + 2200);
    expect(body, '★ 未跳过空 base64').toMatch(/if \(!p\?\.base64\) continue/);
  });

  it('★★ 全是空图块时必须退回纯文本（不能产出空数组 content）', () => {
    const i = CLIENT.indexOf('private toApiMessage');
    const body = CLIENT.slice(i, i + 2200);
    expect(body, '★ 可能产出空数组 content（上游会 400）').toMatch(/some\(.*image_url/);
  });
});

describe('③ 服务端注入接线', () => {
  it('★★ attachImagesToMessages 必须存在', () => {
    expect(LTM, '★ 缺图片注入函数').toMatch(/async function attachImagesToMessages/);
  });

  it('★★★ 必须被**主循环与子循环两处**调用（子智能体是最常截图的一方）', () => {
    const n = (LTM.match(/attachImagesToMessages\(llmMessages\)/g) || []).length;
    expect(n, `★ 注入点只有 ${n} 处 —— 子智能体循环看不到自己截的图，"委派子智能体看图"不成立`)
      .toBeGreaterThanOrEqual(2);
  });

  it('★★★ 只注入最近 N 条（历史图全量回放 = 每轮背几十张图）', () => {
    expect(LTM, '★ 无"只注入最近 N 条"的闸（C4 降级缺失 → 成本爆炸）')
      .toMatch(/IMAGE_INJECT_MAX_MESSAGES/);
    expect(LTM, '★ 无图片总数上限').toMatch(/IMAGE_INJECT_MAX_TOTAL/);
  });

  it('★★ 标记正则必须与 C6 归档格式一致（含全角右括号排除）', () => {
    expect(LTM, '★ 标记正则未排除全角右括号（与 C6 同一坑）').toMatch(/已存档[^/]*\\n）\)/);
  });

  it('★★ 失败必须标记 imagePartsTried（不重复尝试）', () => {
    expect(LTM, '★ 读图全失败后未标记 tried → 每步重复 stat').toMatch(/imagePartsTried = true/);
  });

  it('★★★ 必须**真的跳过**已尝试项（标了不用 = 白标）', () => {
    // ★★★ 这条是**变异验证补出来的**：第一版只断言"代码里有没有 imagePartsTried = true"，
    //   把"跳过已尝试项"的判定去掉（标记写了但从不检查）时**测试全绿** —— 典型的
    //   "断言了写入、没断言读取"（与"包了壳≠进了判定集合"同族）。
    //   ⇒ 必须断言**读取侧**：候选筛选里真的跳过 imagePartsTried。
    const i = LTM.indexOf('async function attachImagesToMessages');
    const body = LTM.slice(i, i + 3000);
    expect(body, '★ 标记了 imagePartsTried 却从不检查 → 失效路径仍会被每步重试')
      .toMatch(/if \(m\.imagePartsTried\) continue/);
  });

  it('★★★ 必须真的按条数闸筛选候选（常量存在 ≠ 真的用了）', () => {
    const i = LTM.indexOf('async function attachImagesToMessages');
    const body = LTM.slice(i, i + 3000);
    // 候选收集循环必须以条数上限为条件（且从后往前 = 取最近）
    expect(body, '★ 未用条数上限筛选候选（历史图会全量回放）')
      .toMatch(/candidates\.length < IMAGE_INJECT_MAX_MESSAGES/);
    expect(body, '★ 未从后往前取（会注入最旧的图而不是最近的）')
      .toMatch(/i >= 0/);
  });

  it('★★ 必须 fail-safe（注入失败不得影响主链路）', () => {
    const i = LTM.indexOf('async function attachImagesToMessages');
    const body = LTM.slice(i, i + 3000);
    expect(body, '★ 无 try/catch → 注入失败会让整次对话失败').toMatch(/catch/);
    expect(body, '★ 失败未降级为纯文本').toMatch(/降级为纯文本/);
  });
});

describe('④ Anthropic 侧真跑（已有 toAnthropicBlocks，防回归）', () => {
  it('★★★ data URL 必须能转成 Anthropic image source', async () => {
    // ★ 注意：`toAnthropicMessages` **没有**从 `@yan-zhi/core` 的 index 导出
    //   （core index 是白名单逐个 export，`anthropic.ts` 不在其中）——
    //   故直接引源文件（第一版用 `import('@yan-zhi/core')` 取不到 → 假红）。
    const mod = await import('../../../packages/core/src/llm/anthropic.js').catch(() => null);
    const fn = (mod as any)?.toAnthropicMessages;
    expect(typeof fn, '★ 无法取到 toAnthropicMessages（源文件路径也失败）').toBe('function');
    const msgs = [{
      id: 'u1', conversationId: 'c', role: 'user', createdAt: 0,
      content: [{ type: 'text', text: '看这张图' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }],
    }] as any;
    const req = fn(msgs);
    const content = req?.messages?.[0]?.content as any[];
    expect(Array.isArray(content), '★ content 未成块数组').toBe(true);
    const textBlock = content.find((b) => b.type === 'text');
    const imgBlock = content.find((b) => b.type === 'image');
    expect(textBlock, '★ 文本块丢失').toBeTruthy();
    expect(imgBlock, '★ image 块未生成 → Anthropic 侧仍看不到图').toBeTruthy();
    expect(imgBlock.source.type, '★ source 类型不对').toBe('base64');
    expect(imgBlock.source.media_type, '★ media_type 未解析出来').toBe('image/jpeg');
    expect(imgBlock.source.data, '★ data 丢失').toBe('AAAA');
  });

  it('★★ 字符串 content 不得被改变（Anthropic 侧回归）', async () => {
    const mod = await import('../../../packages/core/src/llm/anthropic.js').catch(() => null);
    const fn = (mod as any)?.toAnthropicMessages;
    if (typeof fn !== 'function') return;
    const req = fn([{ id: 'u1', conversationId: 'c', role: 'user', createdAt: 0, content: '纯文本' }] as any);
    const content = req?.messages?.[0]?.content as any[];
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe('纯文本');
  });
});

describe('⑤ base64 绝不进库/进快照', () => {
  it('★★★ 快照只取 id/role/content/toolCalls（不得带 imageParts）', () => {
    const i = SNAP.indexOf('export function toSnapshotMessages');
    const body = SNAP.slice(i, i + 700);
    expect(body, '★ 快照映射里出现了 imageParts（base64 会进快照 → 库膨胀）')
      .not.toMatch(/imageParts/);
    expect(body, '★ 快照未按既有字段白名单映射').toMatch(/role: m\.role/);
  });

  it('★★ 落库必须走 insertMessage（只落文本/元数据，不带 imageParts）', () => {
    const i = LTM.indexOf('function insertMessage(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 1200);
    expect(body, '★ insertMessage 带上了 imageParts（会把 base64 写进 message 表）')
      .not.toMatch(/imageParts/);
  });
});