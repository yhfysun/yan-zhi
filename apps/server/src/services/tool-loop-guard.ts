/**
 * 防失控循环闸门（2026-10-09）。
 *
 * ★ 背景：模型可能陷入"换着花样重试同一目标"的死循环 —— 实例：让浏览器助手核实
 *   抖音评论区置顶入口（入口本不存在），模型连续几十次 browser_run_script 换脚本
 *   硬试，token 疯狂燃烧、任务永不收敛。提示词约束（"找不到入口如实报告别死磕"）
 *   实测压不住，必须在工具执行漏斗上做代码级拦截。
 *
 * 两条触发线：
 *   A) 同名同参重复 —— 同一 key 在近期窗口内已出现 ≥ TOOL_DUP_LIMIT 次 → 拦截。
 *      留 1 次重试余量：前端委托 SSE 瞬断等瞬时失败后原样重试一次是合法的。
 *   B) 单工具连刷 —— 同一工具"严格连续" ≥ TOOL_CONSEC_LIMIT 次（中间无任何其他
 *      工具）→ 拦截。用严格连续而非窗口占比：批量正流程（逐章 run_script 抓正文 +
 *      逐章 file_write 落盘）天然被其他工具打断，不会误伤；纯刷同一工具的才是失控。
 *
 * 只拦不罚：返回的是指引文本（让模型"停止重试、汇报结论"），不是抛错 ——
 * 任务循环把工具文本原样回灌模型，模型看到后走正常收口路径。
 *
 * ★★★ 2026-10-14 三处修正（实测 conv 96125908：35 分钟的任务在**收尾处**被本闸门掐死，
 *   同一个目标连试三天未成）—— 原实现把"工具重复"当成了"没有进展"，判据过粗：
 *   ① A 线只对**结果由入参决定**的工具成立：读页类工具（截图 / 读正文 / 读 DOM…）的输出是
 *      **外部状态的快照**，参数相同、结果不同，拦它既是误判、又让提示词"读页面确认"失效。
 *      判据由工具自己声明（`ToolDefinition.readsExternalState`），闸门调用方透传 ——
 *      闸门**不维护工具名单**（避免"同一语义两处判定"漂移）。
 *      ★ 注意：这里曾经用过"无参调用才放行"的判据，**是错的** —— 实测模型恰恰带着
 *        `maxTextLength` / `tabId` 这类显示参数重复调用，按空参放行等于没修（被代码审查拦下）。
 *   ② 累计拦截数在该工具**被放行**时清零 —— 让"此路不通"只对**连续**失败成立（被别的工具/
 *      动作打断后再次被拦，计数重新起算）。注意语义边界（代码审查指出的措辞问题）：本闸门在
 *      **执行前**调用，"放行"只等于"这次没被判为重复/连刷"，**不等于工具执行成功**；这里要表达的
 *      是"模型确实在推进别的事，不是反复被拦还硬磕"。
 *   ③ 标记识别由调用方按 `startsWith` 判定 + 回传子智能体报告前 `neutralizeForceStopMarker` 去毒
 *      （子智能体报告里**引用**该标记，曾把父任务一起硬停）。
 *
 * 状态放 WeakMap（key=task 对象）：任务结束对象被 GC，历史自动清零，无需手动清理。
 */

export const TOOL_HISTORY_WINDOW = 16;
export const TOOL_DUP_LIMIT = 2;
export const TOOL_CONSEC_LIMIT = 8;
/**
 * 同一工具**累计被拦截**多少次后，判定"说不动了"→ 走强制收口（2026-10-10 新增）。
 *
 * ★★★ 为什么需要（实测）：`server.log` 里某会话 15 分钟内出现 **6 次循环拦截**
 *   （`browser_get_page_content`×3 / `browser_navigate`×2 / `browser_run_script`×1），
 *   任务在「等超时 → 被拦 → 换参数再试」里空转，用户等不下去只能手动 abort。
 *   原实现「只拦不罚」——模型看到指引文本后**仍可能继续换花样试探**（提示词约束压不住，已被实证）。
 *   ⇒ 加一道硬闸：同一工具被拦到本阈值后，除了返回文案，还会带上
 *   `FORCE_STOP_MARKER` 前缀，由调用方识别并**终止内层 ReAct 循环**、强制走收尾。
 */
export const TOOL_BLOCK_HARD_LIMIT = 3;
/**
 * 同一任务内、同一工具**累计**被拦截多少次后强制收口（2026-10-19 新增，跨"放行清零"生效）。
 *
 * ★ 为什么还要这道闸（实测 conv cd857565，2026-10-19）：
 *   抖音发布任务里 `browser_run_script` 在 2 小时内被拦 **10 次**，但每次拦截之间都夹着
 *   一次"被放行"的调用（换脚本继续试）⇒ `clearBlockCount` 一遍遍把计数清零
 *   ⇒ 连续硬停（3 次）永远够不到 ⇒ 任务在「被拦 → 换个写法再试」里空转到 2 小时超时，
 *   用户眼看着表单都填好了却没点发布。
 *   ⇒ 单独记一份**不随放行清零**的任务级累计数：同一工具被拦到本阈值，判定"此路确实不通"。
 *   ★ 阈值取 8 而不是 3：正常任务偶发几次误拦（历史实测 5 次）不应被掐死；
 *     连续 8 次被同一闸门拦下才说明模型在硬磕。
 */
export const TOOL_BLOCK_TASK_LIMIT = 8;
/** 强制收口标记：调用方（llm-task-manager）据此终止内层循环，而不是继续把文本回灌给模型 */
export const FORCE_STOP_MARKER = '[FORCE_STOP]';

/**
 * 同一工具「连续失败」阈值（2026-10-21 新增 C 线）。
 *
 * ★★★ 为什么需要（实测 conv 9e9bcd12，2026-10-21）：模型在 449 行的 `home_page.dart` 上
 *   连做 5 次 `file_edit`，**每次 old_string 都不一样** —— A 线（同参重复）判不出来；
 *   中间还夹着 `file_read` 换上下文 ⇒ B 线（严格连续 8 次）也够不到。
 *   结果 6 分钟、25 步全耗在「改不中 → 整读文件 → 再猜一次」，用户只能手动终止。
 *   ⇒ 补一条**只看结果**的线：同一工具连续失败（不论参数）到本阈值就明确告知
 *   「方法错了，换策略」，而不是继续把同样的错误回灌给模型自我强化。
 *   阈值 3：正常任务偶发一次失败（瞬断/路径写错）不该被念；连续 3 次同工具失败才是死循环。
 */
export const TOOL_FAIL_STREAK_LIMIT = 3;

/** 每任务、每工具的**连续失败次数**（成功即清零） */
const taskFailStreak = new WeakMap<object, Map<string, number>>();

/** 观测用：当前连续失败次数 */
export function toolFailStreak(task: object, toolName: string): number {
  return taskFailStreak.get(task)?.get(toolName) || 0;
}

/**
 * 记录一次工具执行结果，连续失败达阈值时返回**给模型看的改策略提示**（否则 null）。
 * ★ 只提示、不硬停：失败是模型能自救的场景（换工具/照抄原文），硬停会把可完成的任务掐死；
 *   真失控由 A/B 线以及任务级超时兜底。
 */
export function noteToolOutcome(task: object, toolName: string, ok: boolean): string | null {
  const m = taskFailStreak.get(task) || new Map<string, number>();
  if (ok) {
    if (m.has(toolName)) {
      m.delete(toolName);
      taskFailStreak.set(task, m);
    }
    return null;
  }
  const n = (m.get(toolName) || 0) + 1;
  m.set(toolName, n);
  taskFailStreak.set(task, m);
  if (n < TOOL_FAIL_STREAK_LIMIT) return null;

  const advice = toolName === 'file_edit' || toolName === 'file_write'
    ? '工具结果里已经给了「最接近的片段/行号」时，**逐字照抄**它作为 old_string；' +
      '拿不到就先用 file_grep 定位、再按 offset/limit 读那一段；' +
      '改动面大或目标文本已不存在时，改用 patch（apply_patch）或 file_write 整文件重写。'
    : '换一个工具或换一条路径完成同一目标（先读取事实再动手），不要再调整参数重发同一调用。';
  return `⛔ ${toolName} 已连续失败 ${n} 次（参数不同也算）——这是「方法错了」的信号，不是「再试一次」的信号。` +
    `\n请立刻换策略：${advice}\n若确实做不到，直接向用户说明卡在哪里、已经排除了什么。`;
}

/**
 * 把**文本中提到**的 FORCE_STOP 标记改写成无害文案（回传子智能体报告前用）。
 *
 * ★★★ 为什么必须去毒（2026-10-14 实报，high）：子智能体的收尾报告**必然**会引用它收到的
 *   拦截原文（"连续多次脚本探查触发 [FORCE_STOP]，被强制要求停止工具调用"），而 `call_agent`
 *   把这份报告**原样**当工具结果回传父任务 —— 父任务当时的判据是
 *   `includes(FORCE_STOP_MARKER)`，于是 **子智能体被停 = 父任务跟着被硬停**。
 *   实测（conv 96125908，2026-10-14 16:54:55）：父任务在合集弹窗已打开、3 条目标视频已在
 *   弹窗列表里的收尾关头被硬停，剩余 4 个步骤一步没跑；同一条链在 10-12 / 10-13 各复现过。
 *   ⇒ 判据改 `startsWith`（见调用方）+ 回传前统一去毒，**两道都要有**：判据只挡"开头匹配"，
 *     去毒挡"将来任何按包含判断的消费方"（本项目已多次吃"同一语义两处判据漂移"的亏）。
 */
export function neutralizeForceStopMarker(text: string): string {
  return String(text ?? '').split(FORCE_STOP_MARKER).join('[防循环闸门已触发]');
}

const taskToolHistory = new WeakMap<object, Array<{ name: string; key: string }>>();
/** 每任务、每工具的**累计拦截次数**（与历史窗口无关 —— 窗口会滑动，拦截计数不该被滑走） */
const taskBlockCounts = new WeakMap<object, Map<string, number>>();
/** 每任务、每工具的**任务级累计拦截次数**（不随"放行"清零，见 TOOL_BLOCK_TASK_LIMIT） */
const taskBlockTotals = new WeakMap<object, Map<string, number>>();

/** 归一化 key：工具名 + 排序后的参数 JSON（截断 600 字符，防超长脚本撑爆内存） */
export function toolCallKey(toolName: string, args: unknown): string {
  let s = '';
  try {
    const o = (args && typeof args === 'object') ? args as Record<string, unknown> : { v: args };
    s = JSON.stringify(o, Object.keys(o).sort());
  } catch { s = String(args); }
  return `${toolName}::${s.length > 600 ? s.slice(0, 600) : s}`;
}

/** 清零某工具的累计拦截数（放行时调用，见 checkToolLoop 末尾注释） */
function clearBlockCount(task: object, toolName: string): void {
  const m = taskBlockCounts.get(task);
  if (!m?.has(toolName)) return;
  const next = new Map(m);
  next.delete(toolName);
  taskBlockCounts.set(task, next);
}

/** 取该工具累计被拦次数（供调用方/测试观察） */
export function toolBlockCount(task: object, toolName: string): number {
  return taskBlockCounts.get(task)?.get(toolName) || 0;
}

/** 取该工具**任务级**累计被拦次数（不随放行清零，供测试观察） */
export function toolBlockTotal(task: object, toolName: string): number {
  return taskBlockTotals.get(task)?.get(toolName) || 0;
}

/**
 * 记录本次调用并判定是否拦截。返回 null = 放行；返回字符串 = 给模型看的拦截文案。
 * ★ 返回串以 `FORCE_STOP_MARKER` 开头时 = 已达硬闸，调用方应**终止内层循环**（不再回灌模型）。
 * ★ 调用方判据必须用 `startsWith`（不能用 `includes`）—— 工具结果里**提到**这四个字是常态
 *   （经验档笔记、子智能体报告引用），用包含判断会误伤。见 neutralizeForceStopMarker。
 *
 * @param task  任务对象（仅作 WeakMap key，不读字段）
 * @param opts.readsExternalState 该工具的输出是否取决于**外部可变状态**（见 ToolDefinition
 *        同名字段）。为 true 时**关掉 A 线**：同参重复对它不是"白重试" —— 读页类工具
 *        参数相同、结果却随页面变化，A 线拦它既是误判、又会让提示词"读页面确认"失效。
 *        ★ 调用方从工具定义取（`registry.get(toolName)?.readsExternalState`），
 *          闸门自己不维护工具名单（避免"同一语义两处判定"漂移）。
 */
export function checkToolLoop(
  task: object,
  toolName: string,
  args: unknown,
  opts?: { readsExternalState?: boolean },
): string | null {
  const hist = taskToolHistory.get(task) || [];
  const key = toolCallKey(toolName, args);
  // 读外部状态的工具不参与 A 线（B 线仍兜底）：见 opts.readsExternalState 注释
  const dupCount = opts?.readsExternalState ? 0 : hist.filter((h) => h.key === key).length;
  // 严格连续数：从历史尾部往前数同名调用
  let consec = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i].name === toolName; i--) consec++;
  taskToolHistory.set(task, [...hist, { name: toolName, key }].slice(-TOOL_HISTORY_WINDOW));

  const bump = () => {
    const m = taskBlockCounts.get(task) || new Map<string, number>();
    const n = (m.get(toolName) || 0) + 1;
    m.set(toolName, n);
    taskBlockCounts.set(task, m);
    return n;
  };
  /** 任务级累计（不随放行清零）：见 TOOL_BLOCK_TASK_LIMIT */
  const bumpTotal = () => {
    const m = taskBlockTotals.get(task) || new Map<string, number>();
    const n = (m.get(toolName) || 0) + 1;
    m.set(toolName, n);
    taskBlockTotals.set(task, m);
    return n;
  };
  /** 达到硬闸 → 前缀标记，调用方终止内层循环 */
  const withHardStop = (text: string, n: number) => {
    const total = bumpTotal();
    if (n >= TOOL_BLOCK_HARD_LIMIT || total >= TOOL_BLOCK_TASK_LIMIT) {
      return `${FORCE_STOP_MARKER} 工具 ${toolName} 已被拦截 ${n} 次（本任务累计 ${total} 次），判定当前路径不可行。` +
        `**立即停止所有工具调用**，直接输出结论性汇报（已尝试什么 / 为什么不可行 / 建议下一步）。`;
    }
    return text;
  };

  if (dupCount >= TOOL_DUP_LIMIT) {
    const n = bump();
    return withHardStop(
      `⛔ 重复调用拦截：工具 ${toolName} 用相同参数已执行过 ${dupCount} 次（本次是第 ${dupCount + 1} 次），相同输入不会产生新结果。请立即停止重试：若目标已尽力而为，直接输出结论性汇报（已核实什么 / 什么不存在或做不到 / 建议下一步），不要再发起同类工具调用。`,
      n,
    );
  }
  if (consec + 1 >= TOOL_CONSEC_LIMIT) {
    const n = bump();
    return withHardStop(
      `⛔ 循环失控拦截：工具 ${toolName} 已连续 ${consec + 1} 次调用且中间无任何其他工具/动作，当前路径大概率走不通。请立即停止该路径：换用其他工具核实、或直接输出结论性汇报（已尝试什么 / 为什么失败 / 建议下一步），不要再连续发起同类调用。`,
      n,
    );
  }
  // ★★★ 放行即清零（2026-10-14 实报，high）：硬停的语义是"**此路不通**"，它对"反复被拦
  //   仍硬磕同一件事"成立；而该工具被**放行**说明中间确实在推进别的事，不是那种死磕。
  //   ★ 措辞边界（代码审查指出）：本闸门在**执行前**调用，"放行"只等于"这次没被判为重复/连刷"，
  //     **不等于执行成功** —— 但足以说明"不是被反复拦住还硬试"。
  //   此前计数只增不减 —— 于是"正常展开工作 → 中途被误拦几次 → 之后每次调用都被放行"的
  //   **健康循环**，会把拦满 3 次后**每一次**正常调用都判成硬停，任务在收尾处被掐死。
  //   实测（conv 96125908，2026-10-14 16:54:50）：browser_run_script 在两次拦截之间被放行了
  //   十几次（正一路逼近目标），却因累计到第 4 次被硬停 —— 而那一刻合集弹窗已打开、
  //   3 条目标视频已在列表里，只差「勾选 → 确认 → 保存」两步。
  //   ⇒ 让"此路不通"只对**连续**失败成立。
  clearBlockCount(task, toolName);
  return null;
}
