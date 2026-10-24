/**
 * 表单回填（fill_form）契约对齐（B3，2026-10-10）守门测试。
 *
 * 背景：工具 schema 明确声明 `type is "text"|"select"|"checkbox"|"radio"`
 *   且 "For select use **label or value**"。而**桌面端实现违背了三条**（服务端都支持）：
 *   ① **不支持 radio** —— 只判 select/checkbox ⇒ radio 走 else 分支当文本框填
 *      （对 `<input type=radio>` 设 `.value` 不改 `.checked` ⇒ 单选**根本没选中**，
 *       且返回值里仍算作"已填" ⇒ 模型以为填好了）；
 *   ② **不支持 label** —— 下拉只能按 value 选 ⇒ 模型给显示文本就选不中；
 *   ③ **静默跳过** —— `if(!el)continue`：元素没找到既不报错也不出现在返回值里
 *      ⇒ "只填上 1 个、其余全没找到" 与 "全部填好" 在模型看来**完全一样**。
 *
 * 修法：桌面侧按服务端语义补齐 ①②③；两条链路返回值统一带 `failed[]`；
 *   工具层把 `failed` **透传**给模型（否则修了实现但模型仍看不见）。
 *
 * ★ 排除已证伪的猜测（避免后人重复"修"）：`typeIn`（main.cjs:2173）**已经**做了
 *   清空现有内容 + nativeValueSetter + IME 组合序列 + input/change + **回读核验** —— 
 *   "追加而非替换""事件不传播"这两条**不成立**，无需改。
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

/** 取 `case 'fill_form': {` 到下一个 `case '` 的片段 */
function fillFormBody(src: string, indent = "      case '"): string {
  const i = src.indexOf("case 'fill_form': {");
  expect(i, '★ 锚点缺失：case fill_form').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const next = rest.indexOf('\n' + indent, 1);
  return next > 0 ? rest.slice(0, next) : rest.slice(0, 6000);
}

/**
 * ★★★ 剥掉注释行 —— 断言"代码里有没有 X"时必须先剥注释：
 *   本文件里我自己写的说明注释就复述了旧代码（含 `if(!el)continue`），
 *   不剥则断言被**注释**满足/触发（第一版就因此假红）。本项目已多次踩这个坑。
 */
function code(body: string): string {
  return body.replace(/^\s*\/\/.*$/gm, '');
}

describe('① 契约：必须支持 radio（此前漏）', () => {
  it('★★★ 桌面 fill_form 必须有 radio 分支', () => {
    const body = code(fillFormBody(MAIN));
    expect(body, "★ 桌面端仍不支持 radio（radio 会被当文本框填 → 单选没选中却报『已填』）")
      .toMatch(/ftype\s*===\s*'radio'/);
  });

  it('★★ 服务端也必须支持 radio（对照基准，防反向漂移）', () => {
    const body = code(fillFormBody(BROWSER));
    expect(body, '★ 服务端丢了 radio 支持').toMatch(/ftype === 'radio'/);
  });

  it('★★ radio 必须用 click 触发（改 checked 不触发事件，组件收不到）', () => {
    const body = fillFormBody(MAIN);
    const i = body.indexOf("ftype==='radio'");
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const seg = body.slice(i, i + 700);
    expect(seg, '★ radio 仅改 checked 未 click → Vue/React 的 v-model 收不到变化').toMatch(/\.click\(\)/);
  });
});

describe('② 契约：select 必须支持 label（此前只认 value）', () => {
  it('★★★ 桌面 fill_form 必须按 label 匹配 option', () => {
    const body = code(fillFormBody(MAIN));
    // ★★★ 断言必须**指向生效的判定条件** —— 只断言"代码里有 f.label"是**假绿**：
    //   把 `if(f.label!==undefined)` 改成 `if(false)` 时，字面量 `f.label` 仍在、断言照样通过
    //   （变异验证抓出）。⇒ 断言**条件本身**（`f.label !== undefined`）。
    expect(body, '★ 桌面端下拉不支持 label（模型给显示文本就选不中）')
      .toMatch(/if\s*\(\s*f\.label\s*!==\s*undefined\s*\)/);
    expect(body, '★ 未按 option 文本比对').toMatch(/textContent/);
  });

  it('★★ 服务端保持 label 支持（对照）', () => {
    expect(code(fillFormBody(BROWSER)), '★ 服务端丢了 label').toMatch(/f\.label !== undefined/);
  });
});

describe('③ 契约：不得静默跳过（必须报告逐字段失败）', () => {
  it('★★★ 桌面端元素未找到必须记入 failed（不得 continue 了事）', () => {
    // ★ 必须剥注释：说明注释里复述了旧代码的 `if(!el)continue`（第一版因此假红）
    const body = code(fillFormBody(MAIN));
    // ★★★ 断言必须**指向"元素未找到"那一处** —— 只断言"有 failed.push"是**假绿**：
    //   别处（select 的选项未找到）也有 failed.push，把它删了照样通过（变异验证抓出）。
    expect(body, '★ 元素未找到仍静默跳过 → 模型无法区分"填了"与"没填到"')
      .toMatch(/reason:\s*'元素未找到'/);
    expect(body, '★ 找不到元素时未 push 到 failed（近邻必须紧接 push）')
      .toMatch(/failed\.push\(\{selector:sel,reason:'元素未找到'\}\);\s*\n\s*continue;/);
    // 不得出现裸的 `if(!el)continue;`（无记录）
    expect(body, '★ 仍是裸 continue（无失败记录）').not.toMatch(/if\s*\(\s*!el\s*\)\s*continue/);
  });

  it('★★★ 返回值必须带 failed 数组（三条链路一致）', () => {
    expect(code(fillFormBody(MAIN)), '★ 桌面返回值缺 failed').toMatch(/failed\s*:\s*failed/);
    // 服务端：`result = { filled: ..., fields: ..., failed }`（failed 在后）
    expect(code(fillFormBody(BROWSER)), '★ 服务端返回值缺 failed').toMatch(/result\s*=\s*\{[^}]*failed/);
    expect(TOOL, '★ 工具层未透传 failed（修了实现但模型仍看不见）').toMatch(/data\?\.failed/);
  });

  it('★★★ 返回值必须带 failed 数组（三条链路一致）', () => {
    expect(code(fillFormBody(MAIN)), '★ 桌面返回值缺 failed').toMatch(/failed\s*:\s*failed/);
    // 服务端：`result = { filled: ..., fields: ..., failed }`（failed 在后）
    expect(code(fillFormBody(BROWSER)), '★ 服务端返回值缺 failed').toMatch(/result\s*=\s*\{[^}]*failed/);
    expect(TOOL, '★ 工具层未透传 failed（修了实现但模型仍看不见）').toMatch(/data\?\.failed/);
  });

  it('★★★ 工具层有失败时必须以 err 返回（而非 ok）并列明原因', () => {
    expect(TOOL, '★ 工具层仍无条件 ok → 部分失败被当成成功').toMatch(/if \(failed\.length\)/);
    const i = TOOL.indexOf('if (failed.length)');
    const body = TOOL.slice(i, i + 700);
    expect(body, '★ 未列明失败项').toMatch(/selector/);
    expect(body, '★ 未返回 err').toMatch(/return err\(/);
  });

  it('★★ 服务端单个字段失败不得中断整批（此前 locator 抛错会整批失败）', () => {
    const body = fillFormBody(BROWSER);
    expect(body, '★ 服务端未按字段 try/catch → 一个失败全批失败（前面的也白填）')
      .toMatch(/try \{[\s\S]{0,1200}catch \(e: any\) \{[\s\S]{0,200}failed\.push/);
  });
});

describe('④ 不得引入回归（已证伪的猜测不要重复"修"）', () => {
  it('★★ typeIn 必须保持"清空现有内容"逻辑（防有人以为它是追加而改坏）', () => {
    expect(MAIN, '★ typeIn 的"先清空"逻辑丢失（会变成追加）').toMatch(/nativeValueSetter/);
    const i = MAIN.indexOf('function typeIn(');
    const body = MAIN.slice(i, i + 900);
    expect(body, '★ typeIn 未清空现有内容').toMatch(/set\.call\(el,''\)/);
  });

  it('★★ typeIn 必须保持回读核验（applied 信号 —— 桌面端据此判断"值未生效"）', () => {
    // ★ 2026-10-12：判据由严格相等改为宽松等价（`applied:_applied`，规范化后相等/互相包含）。
    expect(MAIN, '★ typeIn 丢了回读核验（受控组件未接受时无法识别）').toMatch(/applied:_applied/);
  });

  it('★★ 桌面端必须使用 typeIn 的回读结果判失败（而不是发了事件就算成功）', () => {
    const body = code(fillFormBody(MAIN));
    expect(body, '★ 未用 typeIn 的 applied 结果判定失败').toMatch(/applied===false/);
  });
});

describe('⑤ 失败分档（2026-10-24）：deferred / skipped 不得混进 failed', () => {
  it('★★★ 桌面端 select 选项未找到 → deferred（上游未就绪），不是 failed', () => {
    const body = code(fillFormBody(MAIN));
    expect(body, '★ 选项未找到仍记进 failed → 模型会原样重试同一批参数（反复填表）')
      .toMatch(/deferred\.push\(\{selector:sel,reason:'选项未找到/);
    expect(body, '★ 选项未找到不得再进 failed').not.toMatch(/failed\.push\(\{selector:sel,reason:'选项未找到/);
  });

  it('★★ 桌面端 select 目标不是原生下拉 → skipped（改用单步点击）', () => {
    const body = code(fillFormBody(MAIN));
    expect(body, '★ 自定义下拉被当成"选项未找到"，模型会一直重试')
      .toMatch(/skipped\.push\(\{selector:sel,reason:'不是原生下拉/);
  });

  it('★★ 两条链路返回值都带 deferred / skipped', () => {
    expect(code(fillFormBody(MAIN)), '★ 桌面返回值缺 deferred').toMatch(/deferred\s*:\s*deferred/);
    expect(code(fillFormBody(MAIN)), '★ 桌面返回值缺 skipped').toMatch(/skipped\s*:\s*skipped/);
    expect(code(fillFormBody(BROWSER)), '★ 服务端返回值缺 deferred').toMatch(/deferred/);
    expect(code(fillFormBody(BROWSER)), '★ 服务端返回值缺 skipped').toMatch(/skipped/);
  });

  it('★★ 服务端按控件类型分档（不是 select 的失败不当成选项问题）', () => {
    expect(BROWSER, '★ 缺少 classifyFillFailure 分档函数').toMatch(/function classifyFillFailure\(/);
    expect(code(fillFormBody(BROWSER)), '★ 服务端未使用分档结果').toMatch(/classifyFillFailure\(ftype, msg\)/);
  });

  it('★★★ 工具层：只有 failed 才算 err，deferred/skipped 必须作为可读信息返回', () => {
    expect(TOOL, '★ 工具层未读取 deferred').toMatch(/data\?\.deferred/);
    expect(TOOL, '★ 工具层未读取 skipped').toMatch(/data\?\.skipped/);
    const i = TOOL.indexOf('if (failed.length)');
    const okLine = TOOL.slice(TOOL.indexOf('return ok(', i), TOOL.indexOf('return ok(', i) + 400);
    expect(okLine, '★ deferred 未出现在成功回执里（模型看不到"等上游"的指令）').toMatch(/deferredNote/);
  });
});

describe('⑥ 熔断（2026-10-24）：同页连续 2 次真失败 → 回执降级，不硬试批量', () => {
  it('★★★ 桌面端按"有字段真失败"计数，换页清零，达 2 次标 degraded', () => {
    const body = code(fillFormBody(MAIN));
    expect(body, '★ 桌面端未维护熔断计数').toMatch(/__yzFillDegrade/);
    expect(body, '★ 计数未按 failed 判定（deferred/skipped 不该计入）').toMatch(/dg\.strikes=failed\.length/);
    expect(body, '★ 未在换页时清零').toMatch(/dg\.url!==location\.href/);
    expect(body, '★ 阈值不是 2').toMatch(/strikes>=2/);
    expect(body, '★ 返回值缺 degraded').toMatch(/degraded:degraded/);
  });

  it('★★ 服务端同样维护熔断计数并回传给工具层', () => {
    expect(BROWSER, '★ 服务端未维护熔断计数').toMatch(/__yzFillDegrade/);
    const body = code(fillFormBody(BROWSER));
    expect(body, '★ 服务端返回值缺 degraded').toMatch(/degraded/);
    expect(body, '★ 服务端口径不一致（应按 failed 判定）').toMatch(/failed\.length > 0/);
  });

  it('★★★ 工具层必须把降级提示透传给模型（否则熔断等于没做）', () => {
    expect(TOOL, '★ 工具层未读取 degraded').toMatch(/data\?\.degraded/);
    // ★ 必须锚定 fill_form 的那处 ok：文件里第一个 return ok( 属于别的工具，直接 indexOf 会假绿/假红
    const from = TOOL.indexOf('const degradeNote');
    const okIdx = TOOL.indexOf('return ok(', from);
    expect(okIdx, '★ 锚点缺失：fill_form 的成功回执').toBeGreaterThan(from);
    expect(TOOL.slice(okIdx, okIdx + 400), '★ 成功回执里没有降级提示').toMatch(/degradeNote/);
  });
});