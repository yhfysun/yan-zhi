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
const TEMPLATE = RAW.slice(RAW.indexOf('<template>'), RAW.indexOf('</template>') + 11);

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
    const exprValues = [...TEMPLATE.matchAll(/(?::[\w.-]+|@[\w.-]+)="([^"]*)"/g)].map((m) => m[1]);
    const joined = exprValues.join('\n');
    // 裸 ri 作为独立标识符（非 vr.ri、非字符串、非别的标识符的一部分）
    const bareRi = joined.match(/(^|[^.\w'"])\bri\b/g) || [];
    expect(bareRi, '★ 表达式里还有裸 ri（未被替换成 vr.ri）').toEqual([]);
  });
});
