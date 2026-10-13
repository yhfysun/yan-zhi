/**
 * 读页「表单状态 + 变化差异」契约（2026-10-13）守门测试。
 *
 * 背景（会话 253bd3f4 实测，全天 180 次 run_script / 9 次 browser_type 逐条分析）：
 *   模型填完一个字段后**拿不到"表单整体现在是什么状态"** —— `browser_type` 的 `applied`
 *   只回答"本次调用写进去了没有"，回答不了"标题改了、描述还剩旧值、哪个字段仍为空"。
 *   于是它只能再读一轮页面，从几十上百条**平铺的可交互元素清单**里自己比对当前值
 *   （值常被截断、顺序随 SPA 重渲染漂移），判错就**再填一遍**：
 *   · 同一段文字填了 2~3 遍（第2集标题、描述各两次）；
 *   · 写测试前缀 "XXTESTXX" 试填后忘了清，残留到任务收尾；
 *   · 大量 run_script 实际用途是"手写脚本回读表单值"。
 *   Claude（computer use）每步拿到的是**状态差异**，这正是它不反复填的关键。
 *
 * 修法：读页回执新增两段（两条执行链同口径）——
 *   【表单状态】每个输入框/文本域/富文本/下拉的 字段名 + 类型 + 必填 + **当前值**；
 *   【自上次读取的变化】字段级 diff（谁从什么变成了什么；"无"= 上一步动作没生效）。
 *
 * ★ 本测试钉（防回归 / 防只修一条链路）：
 *   ① 桌面 main.cjs 的 get_page_content 采集 formFields 并调 diffFormSnapshot；
 *   ② 服务端 browser.ts 同口径（否则 web/移动端拿不到这段）；
 *   ③ 工具层把 formFields / formChanges **渲染成文本**给模型（修了实现但模型看不见 = 白修，
 *      本项目"能力在、入口断"的经典失效形态）；
 *   ④ 变化语义：只报"上次见过且值变了"的字段（新出现字段不算，否则 SPA 重渲染刷假变化）；
 *      快照绑定 URL（跨页导航后不与上一页比较）；
 *   ⑤ 快照有界（Map 上限兜底，防长时间运行累积）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const MAIN = read('apps/desktop/main.cjs');
const BROWSER = read('apps/server/src/routes/browser.ts');
const TOOL = read('packages/core/src/tool/builtin/browser/index.ts');
const PROMPT_SRC = read('apps/server/src/db.ts');

/** 剥注释行：断言"代码里有没有 X"时注释不能算数（本项目已多次因此假绿/假红） */
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, '');

/** 取 `case 'get_page_content': {` 到下一个同级 case 的片段 */
function pageContentBody(src: string): string {
  const i = src.indexOf("case 'get_page_content'");
  expect(i, '★ 锚点缺失：get_page_content 分支').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const next = rest.indexOf("\n      case '", 1);
  return next > 0 ? rest.slice(0, next) : rest.slice(0, 12000);
}

describe('① 桌面链路：读页必须采集表单状态并算差异', () => {
  const body = code(pageContentBody(MAIN));

  it('★★★ get_page_content 返回带 formFields', () => {
    expect(body, '★ 读页不再返回 formFields —— 模型又只能从平铺清单里猜表单状态（反复填会回归）')
      .toMatch(/formFields\s*:\s*formFields/);
  });

  it('★★★ 主进程侧补算 formChanges（跨次调用快照在进程内，注入脚本算不了）', () => {
    expect(body, '★ 未调用 diffFormSnapshot 计算字段变化').toMatch(/diffFormSnapshot\(/);
    expect(body, '★ 变化结果未挂到回执上（模型看不见）').toMatch(/formChanges\s*=/);
  });

  it('★★ 富文本（contenteditable）必须纳入字段采集', () => {
    // 抖音这类站点的"作品描述"是 Slate 富文本；漏了它等于漏掉最关键的那个字段
    expect(body, '★ 未把 contenteditable 纳入表单字段选择器').toMatch(/contenteditable/);
    expect(body, '★ 未标记 richtext 类型（模型无法判断该用 browser_type 还是 fill_form）').toMatch(/richtext/);
  });

  it('★★ 字段值必须回读并带上长度/上限（判断"填全了没被截断"的判据）', () => {
    expect(body, '★ 未回读字段当前值').toMatch(/fieldValue\(/);
    expect(body, '★ 未给 valueLen（无法判断 maxlength 截断）').toMatch(/valueLen\s*:/);
    expect(body, '★ 未给 maxLength（30 字上限这类硬约束模型看不到）').toMatch(/maxLength/);
  });
});

describe('② 服务端链路：同口径（防只修桌面端）', () => {
  const body = code(pageContentBody(BROWSER));

  it('★★★ 服务端 get_page_content 也返回 formFields', () => {
    expect(body, '★ 服务端链路缺 formFields —— web/移动端拿不到表单状态（两链路口径漂移）')
      .toMatch(/formFields/);
  });

  it('★★★ 服务端也算 formChanges', () => {
    expect(body, '★ 服务端未算 formChanges').toMatch(/diffFormSnapshot\(/);
  });

  it('★★ 字段身份键规则两链一致（标签优先 → selector 兜底）', () => {
    // 键规则不一致会让"同一次填写"在两条链路上被算成不同字段 → 差异对不上
    for (const [name, src] of [['桌面', MAIN], ['服务端', BROWSER]] as const) {
      expect(src, `★ ${name}缺 formFieldKey`).toMatch(/function formFieldKey\(/);
      expect(src, `★ ${name}的 formFieldKey 未做 selector 兜底`).toMatch(/label[\s\S]{0,80}selector/);
    }
  });
});

describe('③ 工具层：必须渲染成文本（否则修了模型也看不见）', () => {
  const tool = code(TOOL);

  it('★★★ 回执含【表单状态】段，且带"已是目标值不要重复填"的判据', () => {
    expect(tool, '★ 工具层未渲染表单状态段 —— 模型仍然看不到表单当前值').toMatch(/【表单状态】/);
  });

  it('★★★ 回执含【自上次读取的变化】段，且"无变化"给出行动指引', () => {
    expect(tool, '★ 工具层未渲染变化差异段').toMatch(/【自上次读取的变化】/);
    // 空变化必须解释含义（否则模型把"无变化"当成"没问题"继续原样重试）
    expect(tool, '★ "无变化"未给出"换定位方式而不是重复同一动作"的指引')
      .toMatch(/没有改变任何字段|未改变任何字段/);
  });

  it('★★ 工具描述告知模型用表单状态判断生效', () => {
    const desc = TOOL.slice(TOOL.indexOf('name = \'browser_get_page_content\''), TOOL.indexOf('inputSchema = {', TOOL.indexOf('name = \'browser_get_page_content\'')));
    expect(desc, '★ 工具描述未提【表单状态】（模型不会主动去看这段）').toMatch(/表单状态/);
  });

  it('★★ pageAgent 系统提示词同步（提示词不提 = 模型不知道有这段）', () => {
    expect(PROMPT_SRC, '★ pageAgent 提示词未提【表单状态】').toMatch(/【表单状态】/);
  });
});

describe('④ 变化语义与有界性（防假差异 / 防累积）', () => {
  const mainFn = code(MAIN.slice(MAIN.indexOf('function diffFormSnapshot'), MAIN.indexOf('function diffFormSnapshot') + 2000));

  it('★★★ 只报"上次见过且值变了"的字段（新出现字段不算变化）', () => {
    expect(mainFn, '★ 未判断 before !== undefined —— SPA 重渲染/懒加载会刷出一堆假变化')
      .toMatch(/before\s*!==\s*undefined/);
    expect(mainFn, '★ 未做值比较').toMatch(/before\s*!==\s*after/);
  });

  it('★★★ 快照必须绑定 URL（跨页导航后不与上一页比较）', () => {
    expect(mainFn, '★ 未比对 url —— 导航到新页面后整页字段都算"变了"，噪声淹没信号')
      .toMatch(/prev\.url\s*===\s*url/);
  });

  it('★★ 快照 Map 有上限兜底（长时间运行不累积）', () => {
    for (const [name, src] of [['桌面', MAIN], ['服务端', BROWSER]] as const) {
      const i = src.indexOf('function diffFormSnapshot');
      const body = code(src.slice(i, i + 2200));
      expect(body, `★ ${name}快照 Map 无上限兜底（长任务里按 URL 无限累积）`)
        .toMatch(/lastFormSnapshots\.size\s*>\s*\d+/);
    }
  });

  it('★★ tab 生命周期结束要清快照（关闭/逐出/空闲回收）', () => {
    expect(MAIN, '★ 关闭/逐出 tab 未清表单快照').toMatch(/clearFormSnapshot\(/);
    // 至少三处调用点（LRU 逐出 / 空闲回收 / closeTabById）+ 1 处定义
    const calls = (MAIN.match(/clearFormSnapshot\(/g) || []).length;
    expect(calls, `★ clearFormSnapshot 调用点只有 ${calls} 处（应 ≥3 处调用 + 1 定义）`).toBeGreaterThanOrEqual(4);
  });
});

describe('⑤ 模板串安全（本项目真踩过的坑）', () => {
  it('★★★ main.cjs 的 get_page_content 注入脚本内不得出现反引号', () => {
    const body = pageContentBody(MAIN);
    // ★ 精确取窗：与 multi-chain-consistency 同款锚点（`executeJavaScript(\`` → `})()\`);`）。
    //   两处踩过的坑都记在这：① 用"下一个 try {"当止锚点会越过模板结束处、把后面的
    //   `console.log(\`...\`)` 圈进来（假红）；② 起锚点用 `executeJavaScript(` 会把
    //   **起始反引号自己**算进窗口（同样假红）⇒ 必须跳过起始标记长度。
    const open = 'executeJavaScript(`';
    const start = body.indexOf(open);
    const end = body.indexOf('})()`);', start);
    expect(start, '★ 锚点缺失：executeJavaScript 模板串起').toBeGreaterThan(-1);
    expect(end, '★ 锚点缺失：模板串止').toBeGreaterThan(start);
    const injected = body.slice(start + open.length, end);
    expect(injected.includes('`'), '★ 注入脚本里出现反引号会提前闭合模板串（报错行还指向无关位置）').toBe(false);
    // 表单采集确实落在该模板内（否则上面这条等于没验到新代码）
    expect(injected, '★ 表单采集不在该模板串内 → 上面这条反引号断言没覆盖到新增代码').toMatch(/formFields/);
  });
});
