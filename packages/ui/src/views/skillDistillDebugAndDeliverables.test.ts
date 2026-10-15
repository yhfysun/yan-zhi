// Skill 蒸馏 P2-10「去调试」+ P2-11「交付内容」契约（2026-10-15）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM），判据一律**剥注释后再匹配** ——
//   注释里出现同一个词会假绿（同 ctxMenuIconsMarkRaw.test.ts 的教训）。
//
// ★★ 为什么专门钉「打开会话必须走 selectConv」：`/chat/:convId` 这个路由参数**全仓无人消费**
//    （Chat.vue 不读 route.params，路由也没开 props），只 router.push 的话目标会话根本不会被
//    打开 —— 调试 prompt 会落进上一个会话的输入框（用户一按回车就发错任务），且非办公模式下
//    `/chat*` 还会被守卫重定向。本文件第一版正是按错误写法写的（断言 router.push(`/chat/${convId}`)），
//    反过来会阻止修复，故在此显式反向钉住。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const VIEW = strip(read('views/SkillDistill.vue'));
const STORE = strip(read('stores/chat.ts'));
const USE_CHAT = strip(read('composables/chat/useChat.ts'));

/** 取某个函数体（剥注释后）；内层大括号都缩进，故 `\n}` 只会命中函数自身的收尾 */
function fnBody(signature: RegExp, label: string): string {
  const m = VIEW.match(new RegExp(signature.source + '[\\s\\S]*?\\n\\}'));
  expect(m, `找不到 ${label} 函数体`).toBeTruthy();
  return m![0];
}

const debugFn = () => fnBody(/async function doDebugDraft\(\)/, 'doDebugDraft');
const deliverableFn = () => fnBody(/async function openDeliverable\(/, 'openDeliverable');

describe('会话导航口径：必须 selectConv，不能靠 /chat/:convId 参数', () => {
  it('★ SkillDistill 里不得再出现 `/chat/${...}` 形式的导航', () => {
    expect(VIEW, '`/chat/:convId` 参数全仓无人消费，这么跳打不开目标会话').not.toMatch(/router\.push\(`\/chat\/\$\{/);
  });

  it('★ 展示与路由的既有写法一致：useChat().selectConv 负责"打开哪个会话"', () => {
    expect(VIEW, '未引入 useChat').toMatch(/useChat\(\)/);
    expect(VIEW).toMatch(/const chat = useChat\(\)/);
  });
});

describe('P2-10 去调试：临时 skill 行 + 临时会话挂载（方案 A）', () => {
  it('右屏有「去调试」按钮且绑到 doDebugDraft', () => {
    expect(VIEW, '缺少去调试按钮').toMatch(/@click="doDebugDraft"/);
    expect(VIEW).toMatch(/>\s*去调试/);
  });

  it('★ 先落一条 [调试] 前缀的正式 skill 行 —— 技能挂载只认 skill 表的 id，草稿挂不上', () => {
    const fn = debugFn();
    expect(fn, '调试技能名缺 [调试] 前缀').toMatch(/`\[调试\] \$\{displayName\}`/);
    expect(fn, '未走 skillStore.createCustom 落 skill 行').toMatch(/skillStore\.createCustom\(/);
  });

  it('同名调试技能复用（否则反复调试会在技能库里堆一串同名项）', () => {
    const fn = debugFn();
    expect(fn, '未按名字查重复用').toMatch(/skillStore\.skills\.find\(/);
    expect(fn, '复用时未按当前编辑态刷新内容').toMatch(/skillStore\.updateSkill\(/);
  });

  it('建临时会话时把该技能挂上（skillIds → conversation.skill_ids_json）', () => {
    expect(debugFn()).toMatch(/chatStore\.createConversation\([\s\S]*?skillIds:\s*\[skillId\]/);
  });

  it('★ 切到该会话并跳转（selectConv + push /chat），而不是 push 路由参数', () => {
    const fn = debugFn();
    expect(fn, '未 selectConv → 调试会话打不开，prompt 会落进上一个会话').toMatch(/chat\.selectConv\(convId\)/);
    expect(fn, '未跳转到任务页').toMatch(/router\.push\('\/chat'\)/);
  });

  it('★ 预填必须晚于 selectConv（selectConv 内部 resetDraftState 会清空输入框）', () => {
    const fn = debugFn();
    const atSelect = fn.indexOf('chat.selectConv(convId)');
    const atPrefill = fn.indexOf('chatStore.prefillInput(');
    expect(atPrefill, '未预填 prompt').toBeGreaterThan(-1);
    expect(atPrefill, '预填早于 selectConv → 会被 resetDraftState 清掉').toBeGreaterThan(atSelect);
  });

  it('★ chat store 带 pendingPrefill 中转，且 useChat 真写进输入框并取走即清', () => {
    expect(STORE, 'chat store 缺 pendingPrefill').toMatch(/pendingPrefill = ref\(''\)/);
    expect(STORE, '缺 prefillInput 动作').toMatch(/function prefillInput\(/);
    expect(USE_CHAT, 'useChat 未消费 pendingPrefill').toMatch(/\(\)\s*=>\s*store\.pendingPrefill/);
    expect(USE_CHAT, '★ 只清了 store 却没写进输入框 = 预填没生效').toMatch(/input\.value = text/);
    expect(USE_CHAT, '消费后未清空 → 同一条 prompt 会重复灌入').toMatch(/store\.pendingPrefill = ''/);
  });
});

describe('P2-11 交付内容 tab：任务过程 vs 交付物分流', () => {
  it('左屏有「任务处理过程 / 交付内容」两个 tab', () => {
    expect(VIEW).toMatch(/>任务处理过程</);
    expect(VIEW).toMatch(/交付内容</);
    expect(VIEW, '缺少 tab 切换控件').toMatch(/v-model="leftTab"/);
  });

  it('交付内容取自 category=deliverable，且复用 fileStore 既有查询（不另起读取通道）', () => {
    expect(VIEW).toMatch(/filesByCategory\.deliverable/);
    expect(VIEW, '未复用 useFileStore').toMatch(/useFileStore\(\)/);
  });

  it('★ 必须按当前会话过滤 —— fileStore 是全局单例，失败时会残留上一个会话的行', () => {
    expect(VIEW, '未按 conversationId 过滤').toMatch(/filesByCategory\.deliverable\s*\.filter\(/);
    expect(VIEW).toMatch(/f\.conversationId === selectedConvId\.value/);
  });

  it('切会话时刷新交付内容，且读失败不打断切会话', () => {
    const fn = fnBody(/async function selectConv\(/, 'selectConv');
    expect(fn, '切会话未刷新交付内容').toMatch(/fileStore\.loadConversationFiles\(convId\)/);
    expect(fn, '未吞掉失败 → 旁路展示的读失败会打断切会话').toMatch(/loadConversationFiles\(convId\)\.catch\(/);
  });

  it('两种空态都有文案（未选任务 / 该任务无交付物）', () => {
    expect(VIEW).toMatch(/请先选择任务/);
    expect(VIEW).toMatch(/该任务暂无交付内容/);
  });

  it('★ 点交付物 → 先切到该任务，再摊开文件预览（同样不能靠路由参数）', () => {
    const fn = deliverableFn();
    expect(fn, '未 selectConv → 会看到 A 任务的消息配 B 任务的预览').toMatch(/chat\.selectConv\(convId\)/);
    expect(fn, '未复用聊天既有 openTab').toMatch(/chatStore\.openTab\(\{\s*kind:\s*'file'/);
    expect(fn).toMatch(/router\.push\('\/chat'\)/);
  });
});
