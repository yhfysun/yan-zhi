/**
 * ChatMessageList 模板属性名守门测试（2026-10-13）。
 *
 * 背景（真踩）：做「消息列表窗口化渲染」时用了机械替换（`\bround\b`→`vr.round`、
 *   `\bri\b`→`vr.ri`）批量改写模板表达式。它把 **属性名** `:round` 也改成了 `:vr.round`
 *   —— Vue 把 `:vr.round="x"` 解析成「v-bind:vr + 修饰符 round」⇒ `vr` 成了新 prop、
 *   真正的 `round` prop 缺失 ⇒ `SubAgentRoundView` 里 `props.round.subAgentName`
 *   直接抛 `TypeError: Cannot read properties of undefined`，整个消息列表渲染失败。
 *
 *   为什么没被更早发现：模板**编译期零错误**（语法合法）、类型检查也过（`:vr` 是动态 prop），
 *   只有**运行时**才炸。所以必须靠静态断言把"属性名不许带点"钉死。
 *
 * ★ 本测试钉：
 *   ① 模板里任何**属性名**不得含点号（`@click.stop` / `@keyup.ctrl.enter` 这类
 *      Vue 事件修饰符是合法例外，单独放行）；
 *   ② `SubAgentRoundView` 必须收到 `:round=`（正面钉住本次踩的那一处）；
 *   ③ 窗口化的 v-for 契约：数据源 `visibleRounds`、`(全量下标, round)` 对、
 *      key 稳定（用 round.user.id 而不是下标 —— 下标做 key 会在 prepend 时全量重挂）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/components → 上溯四级到仓库根（components→src→ui→packages→根）
const REPO = resolve(__dirname, '..', '..', '..', '..');
const FILE = 'packages/ui/src/components/chat/ChatMessageList.vue';
const RAW = readFileSync(resolve(REPO, FILE), 'utf8');
// 模板里还有嵌套的 `<template v-if=...>`，其 `</template>` 在前 —— 必须取**最后**一个才是根模板闭合
const TEMPLATE = RAW.slice(RAW.indexOf('<template>'), RAW.lastIndexOf('</template>') + 11);
const SCRIPT = RAW.slice(RAW.lastIndexOf('</template>') + 11);

/** Vue 事件修饰符白名单（`@click.stop` 里的 `.stop` 是修饰符不是属性名的一部分） */
const EVENT_MODIFIER_OK = /^@[\w-]+(\.(stop|prevent|self|once|passive|capture|exact|sync|ctrl|shift|alt|meta|enter|esc|tab|delete|backspace|space|up|down|left|right|native))+$/;

/** 收集模板中所有「属性名」（`<Tag ... >` 区间内、`=` 之前的那一段） */
function attributeNames(tpl: string): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const lines = tpl.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(^|\s)((?::|@|v-|#)[\w.-]+|[a-zA-Z][\w-]*)\s*=/g)) {
      // 排除表达式内部的比较（如 `r.toolCallId === tc.id` 会被误抓成属性名 `r.toolCallId`）：
      // 真属性名后面紧跟 `="` 或 `='`，比较运算后面不会是引号。
      const after = line.slice(m.index + m[0].length);
      if (!/^["']/.test(after)) continue;
      out.push({ name: m[2], line: i + 1 });
    }
  });
  return out;
}

describe('① 属性名不得含点号（机械重命名踩过的坑）', () => {
  it('★★★ 模板属性名全都是合法形态（点号只允许出现在 @ 事件修饰符里）', () => {
    const bad = attributeNames(TEMPLATE)
      .filter((a) => a.name.includes('.'))
      .filter((a) => !EVENT_MODIFIER_OK.test(a.name));
    expect(
      bad,
      `★ 属性名含点号：${bad.map((b) => `L${b.line} \`${b.name}\``).join('、')}\n` +
      '  （Vue 会把 `:a.b` 解析成「绑定 a + 修饰符 b」→ 真正的 prop 缺失、运行时才炸）',
    ).toEqual([]);
  });

  it('★★★ SubAgentRoundView 必须收到 :round（正面钉住本次踩的那一处）', () => {
    const i = TEMPLATE.indexOf('<SubAgentRoundView');
    expect(i, '★ 锚点缺失：SubAgentRoundView').toBeGreaterThan(-1);
    const block = TEMPLATE.slice(i, TEMPLATE.indexOf('/>', i));
    expect(block, '★ SubAgentRoundView 没收到 :round（写成 :vr.round 会静默变成 vr prop，运行时崩）')
      .toMatch(/:round=/);
    expect(block, '★ 出现了 :vr.round 这种坏属性名').not.toMatch(/:vr\.round/);
  });
});

describe('② 窗口化 v-for 契约', () => {
  it('★★★ 数据源是 visibleRounds（不是全量 messageRounds）', () => {
    expect(TEMPLATE, '★ 模板又改回全量 messageRounds —— 长会话会把所有轮次挂进 DOM（窗口化失效）')
      .toMatch(/v-for="vr in visibleRounds"/);
  });

  it('★★★ key 必须用轮次身份（round.user.id），不能用下标', () => {
    // 下标做 key：向上翻页 prepend 时下标整体位移 → 全部 key 变化 → Vue 卸载重挂全部 DOM + 滚动跳飞
    expect(TEMPLATE, '★ key 用了下标（prepend 时会全量重挂并让滚动位置跳飞）')
      .not.toMatch(/:key="vr\.ri"/);
    expect(TEMPLATE, '★ key 未用轮次身份').toMatch(/:key="vr\.round\.user\?\.id/);
  });

  it('★★ data-round 仍是全量下标（跳转/高亮/折叠状态 key 都以外层全量下标为锚）', () => {
    expect(TEMPLATE, '★ data-round 改成了窗口内下标 —— scrollToRound / updateActiveNavRound 会错位')
      .toMatch(/:data-round="vr\.ri"/);
  });

  it('★★ 模板里不残留裸 round / ri 引用（说明替换彻底，没有半途而废的表达式）', () => {
    // 只看表达式区（属性值），静态文本里出现这些词无妨
    // ★ 例外：右侧「轮次横岗」那段 v-for 自己声明了循环变量 `ri`（`v-for="(ri, idx) in
    //   userRoundIndices"`），那里的裸 ri 是**合法**的，与窗口化无关 —— 先把整段挖掉，
    //   否则切片范围修正为完整模板后它会误报。（此前 TEMPLATE 只切到模板里第一个
    //   `</template>`，后半段根本没被扫到。）
    const navStart = TEMPLATE.indexOf('v-for="(ri, idx) in userRoundIndices"');
    const navText = TEMPLATE.indexOf('round-nav-list-text', navStart >= 0 ? navStart : 0);
    const navEnd = navText < 0 ? -1 : TEMPLATE.indexOf('</div>', navText);
    const scannable = navStart < 0 || navEnd < 0
      ? TEMPLATE
      : TEMPLATE.slice(0, navStart) + TEMPLATE.slice(navEnd + '</div>'.length);
    const exprValues = [...scannable.matchAll(/(?::[\w.-]+|@[\w.-]+)="([^"]*)"/g)].map((m) => m[1]);
    const joined = exprValues.join('\n');
    // 裸 ri 作为独立标识符（非 vr.ri、非字符串、非别的标识符的一部分）
    const bareRi = joined.match(/(^|[^.\w'"])\bri\b/g) || [];
    expect(bareRi, '★ 表达式里还有裸 ri（未被替换成 vr.ri）').toEqual([]);
  });
});

/**
 * ③ 折叠状态 key「写端 = 读端」守门（2026-10-14 实报：智能体思考过程点不动）。
 *
 * 背景（真踩，与 ① 同源）：那次机械替换还改坏了**字符串字面量里的 key 前缀** ——
 *   模板写端 `toggleAgentProcess('round-' + ri)` 里 `'round-'` 的 `round` 也被当成
 *   标识符替成了 `vr.round` ⇒ 点一下写进 `expandedAgentProcess['vr.round-3']`；
 *   而脚本里的判定函数 `isProcessOpen()` 写的是 `expandedAgentProcess['round-' + ri]`
 *   （该函数内没有裸 `round` 标识符，替换没碰到它）⇒ 两边**永远不同键**。
 *   表现：「智能体思考过程」折叠块点击无反应（流式期强制展开还盖住了这个 bug，
 *   只有任务结束后去点历史轮才暴露）；编译期、类型检查、原有守门测试全绿。
 *
 * ★ 本测试钉两件事：
 *   ③-1 同一份折叠状态的**写端 key 前缀**（模板 `toggleX('前缀' + ...)`）与
 *        **读端 key 前缀**（模板/脚本 `map['前缀' + ...]`）必须逐字相同；
 *   ③-2 模板表达式里不得再出现 `'vr.xxx'` 这种被替换污染的字面量（通用特征）。
 */
describe('③ 折叠状态 key 读写前缀必须逐字一致（字符串字面量同样会被机械替换改坏）', () => {
  /** 收集 `名字['前缀' +` 形式的前缀 */
  function readPrefixes(src: string, mapName: string): string[] {
    return [...src.matchAll(new RegExp(`${mapName}\\['([^']*)'\\s*\\+`, 'g'))].map((m) => m[1]);
  }
  /** 收集 `名字('前缀' +` 形式的前缀（模板里的 toggle* 调用即写端） */
  function writePrefixes(src: string, fnName: string): string[] {
    return [...src.matchAll(new RegExp(`\\b${fnName}\\('([^']*)'\\s*\\+`, 'g'))].map((m) => m[1]);
  }

  it('★★★ 智能体思考过程：模板写端前缀 === 脚本 isProcessOpen 读端前缀', () => {
    const write = writePrefixes(TEMPLATE, 'toggleAgentProcess');
    const read = readPrefixes(SCRIPT, 'expandedAgentProcess');
    expect(write.length, '★ 锚点缺失：模板里没有 toggleAgentProcess(...) 调用').toBeGreaterThan(0);
    expect(read.length, '★ 锚点缺失：脚本里没有 expandedAgentProcess[...] 读取').toBeGreaterThan(0);
    expect(
      [...new Set(write)].sort(),
      '★ 写端/读端前缀不一致 ⇒ 点击后判定函数查不到该 key，折叠块点不动\n' +
      `  写端 ${[...new Set(write)].join('、')} / 读端 ${[...new Set(read)].join('、')}\n` +
      "  （两边都必须是 `round-`：模板 `toggleAgentProcess('round-' + vr.ri)`，" +
      "脚本 `expandedAgentProcess['round-' + ri]`）",
    ).toEqual([...new Set(read)].sort());
  });

  it('★★ 其余折叠状态：模板内写端与读端的前缀集合相同', () => {
    // expandedReasoning 天然有两个前缀（步骤推理 agent-step- / 主智能体思考 agent-fa-），
    // 所以断言的是**集合相等**而非「只有一个前缀」。
    const pairs: Array<[string, string]> = [
      ['expandedReasoning', 'toggleReasoning'],
    ];
    for (const [mapName, fnName] of pairs) {
      const read = readPrefixes(TEMPLATE, mapName);
      const write = writePrefixes(TEMPLATE, fnName);
      expect(read.length, `★ 锚点缺失：模板里没有 ${mapName}[...] 读取`).toBeGreaterThan(0);
      expect(write.length, `★ 锚点缺失：模板里没有 ${fnName}(...) 调用`).toBeGreaterThan(0);
      expect(
        [...new Set(write)].sort(),
        `★ ${mapName} 写端前缀与读端前缀不匹配 ⇒ 点不动\n` +
        `  写端 ${[...new Set(write)].join('、')} / 读端 ${[...new Set(read)].join('、')}`,
      ).toEqual([...new Set(read)].sort());
    }
  });

  it('★★ 模板表达式里不得出现 `vr.` 污染的字面量', () => {
    // `'vr.round-' + vr.ri` 这种：字符串里被塞进了 `vr.` 前缀。任何合法 key 前缀
    // 都不会以 `vr.` 开头，所以这是「机械替换改坏字面量」的零误报特征。
    const exprValues = [...TEMPLATE.matchAll(/(?::[\w.-]+|@[\w.-]+)="([^"]*)"/g)].map((m) => m[1]);
    const polluted = exprValues.filter((v) => /['"]vr\./.test(v));
    expect(
      polluted,
      '★ 表达式里的字符串字面量被机械替换污染（`\'vr.xxx\'` 不是合法 key 前缀）:\n  ' +
      polluted.join('\n  '),
    ).toEqual([]);
  });
});

/**
 * ④ 长任务步骤窗口（2026-10-19）：浏览器自动化任务一轮可产生近 200 步 / 124KB 工具结果，
 *   全部挂进 DOM 会让流式期间每帧重渲整棵树（用户实报「任务一跑界面就卡死」）。
 *   本组测试钉住三条渲染契约，防止后续改模板时静默退回全量渲染。
 */
describe('④ 长任务步骤窗口（防"一轮几百步全量挂 DOM"）', () => {
  it('★★★ 步骤必须经 isStepRendered 窗口过滤（不是裸 v-for 全量渲染）', () => {
    expect(TEMPLATE, '★ 步骤 v-for 外层缺少 isStepRendered 窗口判断 —— 长任务会全量挂 DOM')
      .toMatch(/v-if="isStepRendered\(vr\.round, vr\.ri, si\)"/);
    expect(TEMPLATE, '★ 缺少"展开更早步骤"入口').toMatch(/@click="toggleEarlierSteps\(vr\.ri\)"/);
    expect(TEMPLATE, '★ 折叠按钮缺少显隐条件').toMatch(/v-if="hasHiddenSteps\(vr\.round\)"/);
    expect(TEMPLATE, '★ 步骤 v-for 必须是 template 包裹 key（v-for + v-if 同元素在 Vue 3 里 v-if 拿不到 si）')
      .toMatch(/<template v-for="\(step, si\) in vr\.round\.steps"/);
  });

  it('★★ 折叠体必须用 v-if（v-show 会把参数/结果/推理全文留在 DOM 里）', () => {
    expect(TEMPLATE, '★ 工具详情体还在用 v-show —— 折叠状态仍占满文本节点')
      .not.toMatch(/v-show="isToolItemOpen\(/);
    expect(TEMPLATE, '★ 推理正文还在用 v-show').not.toMatch(/v-show="expandedReasoning\[/);
    expect(TEMPLATE, '★ 步骤工具组还在用 v-show').not.toMatch(/v-show="expandedStepTools\[/);
    // 正面钉住：至少保留 v-if 形态（防止"删掉整段"也算通过）
    expect(TEMPLATE).toMatch(/v-if="isToolItemOpen\(/);
    expect(TEMPLATE).toMatch(/v-if="expandedReasoning\[/);
  });

  it('★★ 子智能体组件同样按窗口渲染（子智能体是长任务的主要步数来源）', () => {
    const SUB = readFileSync(resolve(REPO, 'packages/ui/src/components/chat/SubAgentRoundView.vue'), 'utf8');
    expect(SUB, '★ 子智能体步骤未走窗口过滤').toMatch(/v-if="isStepRendered\(si\)"/);
    expect(SUB, '★ 子智能体缺少展开更早步骤入口').toMatch(/@click="toggleEarlierSteps"/);
    expect(SUB, '★ 子智能体工具详情体还在用 v-show').not.toMatch(/v-show="toolOpen\[/);
  });
});

/**
 * ④ 「深度思考」徽标（2026-10-21 用户：「就跟 workbuddy 一样啊，有个深度思考标志然后跑马灯啊」）
 *
 * 钉三件会**静默坏掉**的事：
 *   ④-1 组件必须被 import —— 本仓踩过 AiDiffView 未 import（模板写了、运行时静默不渲染）；
 *   ④-2 流式态不得再无条件平铺 reasoning 正文（必须受 expandedReasoning['stream-…'] 控制）；
 *   ④-3 新增的折叠 key 前缀写端 === 读端（同 ③，机械替换/手写都会漂）。
 */
describe('④ 深度思考徽标（WorkBuddy 式）', () => {
  it('组件已 import 且模板真的用了它', () => {
    expect(SCRIPT).toMatch(/import\s+DeepThinkBadge\s+from\s+'\.\/DeepThinkBadge\.vue'/);
    expect(TEMPLATE).toContain('<DeepThinkBadge');
    expect(TEMPLATE).toMatch(/state="thinking"/);
    expect(TEMPLATE).toMatch(/state="done"/);
  });

  it('★ 流式思考正文受展开状态控制（不再整段平铺）', () => {
    expect(TEMPLATE).toMatch(/v-if="expandedReasoning\['stream-'\s*\+\s*vr\.ri\]"\s+class="reasoning-body"/);
    expect(TEMPLATE).toContain('reasoningPeek');
  });

  it('★ 流式态折叠 key：写端前缀集合 === 读端前缀集合（含新增的 stream-）', () => {
    const write = [...TEMPLATE.matchAll(/toggleReasoning\('([^']*)'\s*\+/g)].map((m) => m[1]);
    const read = [...TEMPLATE.matchAll(/expandedReasoning\['([^']*)'\s*\+/g)].map((m) => m[1]);
    expect(write).toContain('stream-');
    expect([...new Set(write)].sort()).toEqual([...new Set(read)].sort());
  });
});

/**
 * ⑤ 深度思考徽标接入业务条件（2026-10-21 用户确认「可以」后补）
 *
 * ★ 上一轮的坑：徽标做出来了，但**渲染条件**里还留着 `!round.hasAgentProcess` ——
 *   开发模式几乎总在调工具，于是徽标永远不出现（"做了但用户看不到"）。
 *   这里把两处条件都钉死，并防住"图省事用拼串算字数"的性能退化。
 */
describe('⑤ 深度思考徽标的接入条件', () => {
  it('★ 不再按 hasAgentProcess 排除思考展示', () => {
    expect(TEMPLATE).not.toContain('!vr.round.hasAgentProcess');
    expect(SCRIPT).not.toContain('!round.hasAgentProcess');
  });

  it('★ 主结果卡片的渲染条件用轻量字数判定（agent 模式也要能出卡片）', () => {
    const fn = SCRIPT.slice(SCRIPT.indexOf('function hasMainResult'), SCRIPT.indexOf('function getStreamingText'));
    expect(fn).toContain('roundReasoningChars(round) > 0');
    expect(fn).not.toContain('hasAgentProcess');
  });

  it('★ 字数判定不许走全文拼接（roundReasoningText(...).length 是性能陷阱）', () => {
    expect(TEMPLATE).toContain('roundReasoningChars(vr.round)');
    expect(TEMPLATE).not.toMatch(/roundReasoningText\([^)]*\)\s*\.length/);
    expect(SCRIPT).not.toMatch(/roundReasoningText\([^)]*\)\s*\.length/);
  });

  // ★ 2026-10-23 用户实报「为啥有两个深度思考」：流式进行中，汇总徽标与流式徽标
  //   条件同时成立 → 同一段 reasoning 被渲染两遍（字数也一样，看着像重复）。
  it('★ 流式「思考中」徽标在场时，汇总徽标必须让位', () => {
    expect(TEMPLATE).toContain('!isStreamingReasoningShown(vr.round, vr.ri)');
    expect(SCRIPT).toContain('function isStreamingReasoningShown');
  });
});

/**
 * ⑥ 流式期过程区自动跟随必须尊重用户滚动意图（2026-10-23 用户实报：
 *   「我展开工具调用详情又会重新跳转到最下面，导致我又要滚动半天」）。
 *
 * 背景：`.agent-process-steps` 限高 60vh 内滚（长任务一轮近 200 步）。任务运行中每条
 *   SSE 增量都会重算 messageRounds，原实现无条件 `last.scrollTop = last.scrollHeight`
 *   —— 用户上翻读某次工具调用（展开详情还会触发按需拉取结果，再挖一次 messageRounds）
 *   就被立刻顶回底部，长任务里过程区根本读不了。
 *
 * 钉：① 容器绑定 scroll 记录意图；② 跟随前必须查 stepsStick；③ 不得退回无条件贴底。
 */
describe('⑥ 过程区自动跟随尊重用户滚动意图', () => {
  it('★★★ 过程区容器必须绑定 scroll（否则无法判断用户是否已上翻）', () => {
    expect(TEMPLATE, '★ .agent-process-steps 没挂 @scroll —— 用户上翻意图无人记录')
      .toMatch(/class="agent-process-steps"[^>]*@scroll[^=]*="onStepsScroll"/);
    expect(SCRIPT, '★ 缺少 onStepsScroll（scroll 绑定了但没人写意图表）')
      .toMatch(/function onStepsScroll\(/);
  });

  it('★★★ 自动跟随前必须查「用户是否贴底」，不得无条件贴底', () => {
    expect(
      SCRIPT,
      '★ 跟随前没查 stepsStick —— 用户上翻看工具详情会被流式增量顶回底部',
    ).toMatch(/if \(stepsStick\.get\(last\) === false\) return;[\s\S]{0,120}last\.scrollTop = last\.scrollHeight;/);
  });

  it('★ 意图表写入的是「是否贴底」（容差内算贴底，避免 1px 误判成上翻）', () => {
    const start = SCRIPT.indexOf('function onStepsScroll');
    expect(start, '★ 锚点缺失：function onStepsScroll').toBeGreaterThan(-1);
    const fn = SCRIPT.slice(start, SCRIPT.indexOf('\n}', start));
    expect(fn, '★ onStepsScroll 没写意图表').toMatch(/stepsStick\.set\(el,/);
    expect(fn, '★ 贴底判定没有容差（scrollHeight - scrollTop - clientHeight 直接与 0 比会误判）')
      .toMatch(/scrollHeight\s*-\s*el\.scrollTop\s*-\s*el\.clientHeight\s*<\s*\d+/);
  });
});
