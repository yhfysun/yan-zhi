/**
 * 防失控循环闸门单测（2026-10-09）。
 * 背景：浏览器助手陷入"换脚本硬试不存在入口"的死循环（browser_run_script 几十连发），
 * 提示词压不住，须在 executeTool 漏斗代码级拦截 —— 本测试锁两条触发线与不误伤线。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkToolLoop, toolCallKey, TOOL_CONSEC_LIMIT, TOOL_DUP_LIMIT,
  FORCE_STOP_MARKER, neutralizeForceStopMarker,
} from '../src/services/tool-loop-guard.js';

describe('tool-loop-guard 防失控循环闸门', () => {
  it('key 归一化：字段顺序不同 → 同 key；字段名不同 → 不同 key', () => {
    expect(toolCallKey('t', { a: 1, b: 2 })).toBe(toolCallKey('t', { b: 2, a: 1 }));
    expect(toolCallKey('t', { a: 1 })).not.toBe(toolCallKey('t', { c: 1 }));
    expect(toolCallKey('t1', { a: 1 })).not.toBe(toolCallKey('t2', { a: 1 }));
  });

  it('A线：同名同参第 3 次拦截（前 2 次放行，留瞬时重试余量）', () => {
    const task = {};
    const args = { script: 'return 1' };
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
    const blocked = checkToolLoop(task, 'browser_run_script', args);
    expect(blocked).toBeTruthy();
    expect(blocked).toContain('重复调用拦截');
  });

  it('A线：参数哪怕换一个字符也算新调用，不拦', () => {
    const task = {};
    for (let i = 0; i < TOOL_DUP_LIMIT + 1; i++) {
      expect(checkToolLoop(task, 'browser_run_script', { script: `return ${i}` })).toBeNull();
    }
  });

  it('B线：同一工具严格连续达上限即拦（脚本每次都不同也拦）', () => {
    const task = {};
    let last: string | null = null;
    for (let i = 0; i < TOOL_CONSEC_LIMIT; i++) {
      last = checkToolLoop(task, 'browser_run_script', { script: `document.querySelector('#x${i}')` });
    }
    expect(last).toBeTruthy();
    expect(last).toContain('循环失控拦截');
  });

  it('B线不误伤：批量正流程（run_script 与 file_write 交替）永不触发', () => {
    const task = {};
    for (let i = 0; i < 30; i++) {
      expect(checkToolLoop(task, 'browser_run_script', { script: `抓第${i}章` })).toBeNull();
      expect(checkToolLoop(task, 'file_write', { path: `novel/ch${i}.txt` })).toBeNull();
    }
  });

  it('B线：插入一次其他工具即重置连续计数', () => {
    const task = {};
    for (let i = 0; i < TOOL_CONSEC_LIMIT - 1; i++) {
      checkToolLoop(task, 'browser_run_script', { script: `s${i}` });
    }
    checkToolLoop(task, 'browser_screenshot', {});
    expect(checkToolLoop(task, 'browser_run_script', { script: 's-after' })).toBeNull();
  });

  it('历史窗口滑动：超窗口后的旧重复不再计入', () => {
    const task = {};
    const args = { script: 'return 1' };
    checkToolLoop(task, 'browser_run_script', args);
    checkToolLoop(task, 'browser_run_script', args);
    // 灌满窗口挤掉旧记录
    for (let i = 0; i < 20; i++) checkToolLoop(task, 'browser_screenshot', { i });
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
  });

  it('不同任务（对象）历史互相隔离', () => {
    const t1 = {}; const t2 = {};
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    expect(checkToolLoop(t2, 'browser_run_script', { script: 'x' })).toBeNull();
  });
});
/**
 * 循环闸门**硬停**（2026-10-10 新增）：拦到阈值后带 FORCE_STOP_MARKER，调用方据此终止内层循环。
 *
 * 背景（实测）：server.log 里某会话 15 分钟内 6 次「循环拦截」
 * （browser_get_page_content×3 / browser_navigate×2 / browser_run_script×1），
 * 任务在「等超时 → 被拦 → 换参数再试」里空转，用户等不下去只能手动 abort。
 * 原实现「只拦不罚」压不住 —— 模型看到指引文本仍继续换花样试探。
 */
describe('循环闸门硬停（FORCE_STOP）', () => {
  it('★ 同一工具被拦到 TOOL_BLOCK_HARD_LIMIT 次后，返回串带 FORCE_STOP_MARKER', async () => {
    const { checkToolLoop: check, TOOL_BLOCK_HARD_LIMIT: LIMIT, FORCE_STOP_MARKER: MARK } =
      await import('../src/services/tool-loop-guard.js');
    const task = {};
    const seen: Array<string | null> = [];
    // 每次换参数（避开 A 线"同参"判定），但都让同名工具连续触发 → 走 B 线累计
    for (let i = 0; i < 40; i++) {
      seen.push(check(task, 'browser_run_script', { script: `return ${i}` }));
    }
    const blocked = seen.filter((s) => s)!;
    expect(blocked.length, '★ 应至少被拦一次').toBeGreaterThan(0);
    // 前 (LIMIT-1) 次拦截不带硬停标记
    const withoutMark = blocked.filter((s) => !String(s).startsWith(MARK));
    const withMark = blocked.filter((s) => String(s).startsWith(MARK));
    expect(withMark.length, `★ 拦到第 ${LIMIT} 次仍未硬停`).toBeGreaterThan(0);
    expect(withoutMark.length, '★ 硬停前应仍有"只拦不罚"的普通拦截').toBeGreaterThan(0);
    expect(String(withMark[0])).toContain('立即停止所有工具调用');
  });

  it('★ toolBlockCount 记录累计拦截次数（与滑动的历史窗口无关）', async () => {
    const { checkToolLoop: check, toolBlockCount } = await import('../src/services/tool-loop-guard.js');
    const task = {};
    expect(toolBlockCount(task, 'browser_x')).toBe(0);
    // 同参三次 → 第三次起被拦
    for (let i = 0; i < 3; i++) check(task, 'browser_x', { a: 1 });
    expect(toolBlockCount(task, 'browser_x')).toBe(1);
    // 继续同参 → 每次都拦，计数递增
    check(task, 'browser_x', { a: 1 });
    check(task, 'browser_x', { a: 1 });
    expect(toolBlockCount(task, 'browser_x')).toBe(3);
  });

  it('★ 硬停阈值常量与标记名稳定（调用方按标记名识别，改名会静默失效）', async () => {
    const m = await import('../src/services/tool-loop-guard.js');
    expect(m.TOOL_BLOCK_HARD_LIMIT).toBe(3);
    expect(m.FORCE_STOP_MARKER).toBe('[FORCE_STOP]');
  });
});

/**
 * 2026-10-14 误伤修复（conv 96125908 实测：35 分钟的任务在**收尾处**被本闸门掐死，
 * 同一个"三集归入合集"目标连试三天未成）。三处修正各锁一条回归线：
 *   ① A 线不该管**无参**的状态型工具（截图/读页读的是当前页面，"相同输入"是伪命题）；
 *   ② 累计拦截数在工具**放行**时清零（放行=此路当下是通的）；
 *   ③ 硬停判据由 includes 改 startsWith，并在子智能体报告回传前去毒。
 */
describe('循环闸门误伤修复（2026-10-14）', () => {
  /** 读外部可变状态的工具（工具定义里 readsExternalState=true） */
  const STATEFUL = { readsExternalState: true };
  /** 普通工具（结果由入参决定） */
  const PURE = { readsExternalState: false };

  it('★ A线不误伤：读外部状态的工具**带着相同参数**反复调用不被拦', () => {
    const task = {};
    // ★ 真实形态（实测 conv 96125908）：模型带 maxTextLength 连调 4 次 —— 参数一模一样，
    //   读的却是页面四个不同时刻的状态。按"空参才放行"的旧判据这里照样会被拦，等于没修。
    for (let i = 0; i < 4; i++) {
      expect(
        checkToolLoop(task, 'browser_get_page_content', { maxTextLength: 4000 }, STATEFUL),
        `第 ${i + 1} 次读页被拦`,
      ).toBeNull();
    }
    // 截图同理：annotate/fullPage 只是显示开关，不是"读哪份数据"
    for (let i = 0; i < 4; i++) {
      expect(checkToolLoop(task, 'browser_screenshot', { fullPage: true }, STATEFUL)).toBeNull();
    }
    // 带 tabId 的形态（系统提示词明确让模型传 tabId 读指定标签页）
    for (let i = 0; i < 4; i++) {
      expect(checkToolLoop(task, 'browser_get_page_info', { tabId: 5 }, STATEFUL)).toBeNull();
    }
  });

  it('★ 未声明 readsExternalState 的工具仍走 A 线（开关是显式 opt-in，不是默认放行）', () => {
    const task = {};
    const args = { script: 'return 1' };
    expect(checkToolLoop(task, 'browser_run_script', args, PURE)).toBeNull();
    expect(checkToolLoop(task, 'browser_run_script', args, PURE)).toBeNull();
    expect(checkToolLoop(task, 'browser_run_script', args, PURE)).toContain('重复调用拦截');
    // 完全不传 opts（旧调用方形态）必须与 PURE 等价 —— 行为不能因新增可选参数而改变
    expect(checkToolLoop(task, 'browser_run_script', args)).toContain('重复调用拦截');
  });

  it('★ 读外部状态的工具仍受 B 线兜底：连续 8 次连刷照样拦', () => {
    const task = {};
    let last: string | null = null;
    for (let i = 0; i < TOOL_CONSEC_LIMIT; i++) {
      last = checkToolLoop(task, 'browser_screenshot', {}, STATEFUL);
    }
    expect(last).toBeTruthy();
    expect(last).toContain('循环失控拦截');
  });

  it('★ 契约：读外部状态的工具在**工具定义处**声明了该位（漏声明=静默退回误拦）', async () => {
    // 闸门自己不维护名单，完全依赖工具定义上的这一位
    const { BrowserToolClasses } = await import('../../../packages/core/src/tool/builtin/browser/index.js');
    const declared = new Map<string, boolean | undefined>(
      (BrowserToolClasses as any[]).map((C) => [new C().name, new C().readsExternalState]),
    );
    // 正向：输出是"外部状态快照"或"等条件成立"的工具必须声明
    for (const n of [
      'browser_screenshot', 'browser_get_page_content', 'browser_get_visible_text',
      'browser_get_page_info', 'browser_get_dom', 'browser_get_text',
      'browser_get_tabs', 'browser_get_network_log', 'browser_extract_list',
      'browser_visual_locate', 'browser_is_visible',
      // 等待类：结果取决于"条件在未来某刻是否成立"，同参重放是天然轮询
      // （2026-10-14 代码审查指出这两条最初漏标）
      'browser_wait_for', 'browser_wait_for_request',
    ]) {
      expect(declared.get(n), `★ ${n} 必须在类里声明 readsExternalState = true`).toBe(true);
    }
    // 反向：不该被豁免的两类 —— 动作类（同参重试无意义，最需要 A 线拦），
    // 以及"固定 sleep"的 browser_wait（入参决定结果，重复调用确实没有新结果）
    for (const n of ['browser_click', 'browser_type', 'browser_run_script', 'browser_navigate', 'browser_wait']) {
      expect(declared.get(n), `${n} 不该声明 readsExternalState`).not.toBe(true);
    }
  });

  it('★ 契约：闸门调用点必须把该位**透传**给 checkToolLoop（只钉类声明防不住"接线被删"）', () => {
    // ★ 这条是代码审查 2026-10-14 指出的覆盖缺口：上面那条只证明"类里声明了"，
    //   若有人把调用点的第 4 个参数删掉，闸门收到的就是 undefined ⇒ A 线照旧生效 ⇒
    //   整个修复静默失效，而类声明仍在、上面那条测试照样绿。
    //   故此处按源码切片钉住**接线**（与 browser-tab-cleanup-scope.test.ts 同款手法）。
    const src = fs.readFileSync(path.resolve(__dirname, '../src/llm-task-manager.ts'), 'utf8');
    const at = src.indexOf('checkToolLoop(task, toolName, args');
    expect(at, '★ 闸门调用点锚点缺失（调用形态被改写时要同步本测试）').toBeGreaterThan(-1);
    expect(
      src.slice(at, at + 240),
      '★ 调用点必须传 registry.get(toolName)?.readsExternalState（删掉=静默退回误拦）',
    ).toMatch(/readsExternalState\s*:\s*registry\.get\(toolName\)\?\.readsExternalState/);
  });

  it('★ 放行即清零：拦截被成功调用隔开时，不再累计到硬停', () => {
    const task = {};
    const blocked: string[] = [];
    for (let round = 0; round < 5; round++) {
      // 每轮：同参连打 3 次（第 3 次必被 A 线拦），
      // 再插一个别的工具打断 B 线连续计数（真实轨迹就是这么交替的），
      // 最后用**换参成功**一次 → ★ 这一步清掉该工具的累计拦截数
      for (let i = 0; i < 3; i++) {
        const r = checkToolLoop(task, 'browser_run_script', { script: `命中第 ${round} 轮` });
        if (r) blocked.push(r);
      }
      expect(checkToolLoop(task, 'file_read', { path: `第 ${round} 章.md` })).toBeNull();
      expect(checkToolLoop(task, 'browser_run_script', { script: `新一轮 ${round}` })).toBeNull();
    }
    expect(blocked.length, '本测试的前提是"确实发生过拦截"').toBeGreaterThan(0);
    expect(
      blocked.filter((s) => s.startsWith(FORCE_STOP_MARKER)),
      '★ 被"成功调用"隔开的拦截不该升级成硬停（那条路当下明明是通的）',
    ).toHaveLength(0);
  });

  it('★ 连续失败仍会硬停（放行清零不削弱硬闸本身）', () => {
    const task = {};
    let hardStop = '';
    for (let i = 0; i < 60 && !hardStop; i++) {
      const r = checkToolLoop(task, 'browser_run_script', { script: `第 ${i} 次` });
      if (r && r.startsWith(FORCE_STOP_MARKER)) hardStop = r;
    }
    expect(hardStop, '连续被拦到阈值仍未硬停').toBeTruthy();
    expect(hardStop).toContain('立即停止所有工具调用');
  });

  it('★ 判据契约：闸门自产的硬停串以标记**开头**，"引用了标记的工具结果"不以它开头', () => {
    // 真实误伤样本 ①：file_grep 搜到经验档里那句历史笔记（conv 96125908 16:02:10 因此被硬停）
    const grepLike =
      'C:/ws/.yan-zhi/experience/workflow/浏览器工具集.md:6: 本任务在抖音发布页反复用 ' +
      'browser_run_script 检查下拉/弹层元素，连续 3 次被防失控闸门拦截并下发 [FORCE_STOP]，要求停止一切工具调用。';
    // 真实误伤样本 ②：子智能体收尾报告引用它收到的拦截原文（16:54:55 因此把父任务连坐停掉）
    const reportLike = `## 执行汇报（未完成，中途被拦截）\n连续多次脚本探查触发系统拦截（${FORCE_STOP_MARKER}），因此尚未完成最后两步。`;
    for (const sample of [grepLike, reportLike]) {
      expect(sample.includes(FORCE_STOP_MARKER), '样本本身要包含标记，否则测不到点子上').toBe(true);
      expect(sample.startsWith(FORCE_STOP_MARKER), '★ 旧判据 includes 会误伤，新判据 startsWith 不会').toBe(false);
    }
  });

  it('★ neutralizeForceStopMarker：回传父任务前去毒，连坐链断在回传处', () => {
    const report = `## 执行汇报\n连续多次脚本探查触发系统拦截（${FORCE_STOP_MARKER}），尚未完成勾选。`;
    const out = neutralizeForceStopMarker(report);
    expect(out).not.toContain(FORCE_STOP_MARKER);
    expect(out).toContain('防循环闸门已触发');
    expect(out).toContain('尚未完成勾选'); // 报告正文必须保留，只换掉标记本身
  });

  it('neutralizeForceStopMarker 对空值/无标记文本是恒等变换', () => {
    expect(neutralizeForceStopMarker('')).toBe('');
    expect(neutralizeForceStopMarker('普通汇报，无标记')).toBe('普通汇报，无标记');
    expect(neutralizeForceStopMarker(null as unknown as string)).toBe('');
  });
});
