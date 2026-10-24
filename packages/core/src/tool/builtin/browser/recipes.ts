/**
 * 站点配方（recipe）执行器（2026-10-19，P1）
 *
 * 为什么需要（用户实报，conv cd857565）：
 *   抖音发布任务里，模型用十几个微步骤"现场编排"发布流程，描述框反复清空重填 2 小时，
 *   表单填好却始终没点发布。根因不是模型不会，而是**每一步的成败判据不够硬**，
 *   任何一次回读不确定都会触发重试。只靠提示词压不住（仓库里已反复验证）。
 *
 * 方案：把高频站点流程写成**数据**（recipe），由本执行器确定性执行：
 *   · 模型只传参数（视频路径 / 标题 / 描述 / 合集名 / 是否提交）；
 *   · 上传、等待转码、填表、回读核验、点发布、验证成功全部在代码里闭环；
 *   · 每步失败即停并返回现场，**不让模型进入"填→读→再填"的循环**。
 *
 * 设计边界：
 *   · 配方只调用已有 browser action（navigate / upload / fill_form / click / get_page_content），
 *     不改主进程动作层；站点改版只改 recipe 数据。
 *   · `submit` 默认 false：发布是不可逆外部动作，必须由调用方（模型）在用户明确要求发布时传 true。
 */
export interface RecipeApi {
  navigate(url: string): Promise<any>;
  action(name: string, args: Record<string, unknown>): Promise<any>;
}

export interface RecipeParamDef {
  type: 'string' | 'boolean';
  required?: boolean;
  description: string;
}

export interface FillFieldDef {
  selector: string;
  /** 备用选择器：selector 未命中时按序回退（类名 hash 漂移的站点用它，避免模型现场换选择器） */
  selectors?: string[];
  value: string;
  label?: string;
  /** 控件类型：text（默认）/ select / checkbox / radio —— 必须透传给 fill_form，否则复选框会被当成文本框填 */
  type?: 'text' | 'select' | 'checkbox' | 'radio';
}

export type RecipeWhen = 'submit' | 'collectionName';

export type RecipeStep =
  | { kind: 'navigate'; url: string }
  | { kind: 'upload'; filePath: string; clickSelectors: string[]; successTexts: string[]; failureTexts?: string[]; timeoutMs?: number }
  | { kind: 'fill'; fields: FillFieldDef[] }
  /** 字段清单来自参数里的 JSON（通用填表配方用）：支持备用选择器 + 回读核验 */
  | { kind: 'fillFromJson'; param: string }
  | { kind: 'clickText'; texts: string[]; optional?: boolean; when?: RecipeWhen; failHint?: string }
  | { kind: 'waitText'; texts: string[]; timeoutMs?: number; optional?: boolean; when?: RecipeWhen; failHint?: string };

export interface PublishRecipe {
  id: string;
  description: string;
  params: Record<string, RecipeParamDef>;
  steps: RecipeStep[];
}

export interface RecipeStepResult {
  step: string;
  ok: boolean;
  detail: string;
}

export interface RecipeRunResult {
  recipe: string;
  ok: boolean;
  steps: RecipeStepResult[];
  url: string;
  title: string;
  /** 前置步骤全部完成、只差用户确认发布 */
  readyToSubmit: boolean;
  /** 本次是否点击了发布 */
  submitted: boolean;
  /** 点发布后是否在页面看到成功判据 */
  verified: boolean;
  /** 被验证码/滑块拦住（不是普通失败） */
  blockedByVerification?: boolean;
  /** 拦住的页面文案（如「请完成安全验证」） */
  verificationText?: string;
  /** 被拦住的步骤下标（0 基） */
  blockedAtStep?: number;
  /**
   * 续跑起点（0 基）：用户完成验证后，带 `resumeStep` 再调用本工具，
   * 只执行该步骤及之后，**不重新上传/填表**。
   */
  resumeStep?: number;
  error?: string;
  pageSnippet?: string;
}

interface PageSnapshot {
  text: string;
  url: string;
  title: string;
  formFields: any[];
}

const norm = (s: unknown): string =>
  String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const interp = (s: string, params: Record<string, unknown>): string =>
  s.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => (params[key] == null ? '' : String(params[key])));
const isTruthy = (v: unknown): boolean =>
  v === true || (typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'false');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const BLOCK_TEXTS = ['验证码', '安全验证', '拖动滑块', '请完成验证'];

/** 被安全验证拦住：保留验证文案，供上层转成「请用户完成验证后续跑」的回执 */
class VerificationBlockedError extends Error {
  constructor(public blockedText: string) {
    super(`页面出现安全验证（${blockedText}）`);
    this.name = 'VerificationBlockedError';
  }
}

/** 读一次页面，判断是否被验证码/滑块拦住（读页失败返回空串，不掩盖原始错误） */
async function detectVerification(api: RecipeApi): Promise<string> {
  try {
    const text = await pollText(api);
    return BLOCK_TEXTS.find((t) => norm(text).includes(t)) || '';
  } catch {
    return '';
  }
}

async function readPage(api: RecipeApi, maxTextLength = 3000): Promise<PageSnapshot> {
  const d = await api.action('get_page_content', { maxTextLength, maxInteractive: 0 });
  return {
    text: String(d?.text || ''),
    url: String(d?.url || ''),
    title: String(d?.title || ''),
    formFields: Array.isArray(d?.formFields) ? d.formFields : [],
  };
}

/**
 * 轮询用的廉价读页：只要可见文本，不要可交互元素清单和表单语义段。
 * 上传/转码等待动辄几十次读取，get_page_content 在抖音这类重页面上每次都要遍历
 * DOM + 计算样式，整段等待会被放大成分钟级；get_visible_text 只递归取文本。
 * 读不到再退回整页读取（老浏览器动作不可用时保持兼容）。
 */
async function pollText(api: RecipeApi): Promise<string> {
  try {
    const d = await api.action('get_visible_text', {});
    if (d && typeof d.text === 'string' && d.text.trim()) return String(d.text);
  } catch { /* 回落整页读取 */ }
  const page = await readPage(api);
  return page.text;
}

async function waitForAny(
  api: RecipeApi,
  texts: string[],
  timeoutMs: number,
): Promise<{ matched: string; page: PageSnapshot; blocked: string }> {
  const deadline = Date.now() + timeoutMs;
  const snapshot = (text: string): PageSnapshot => ({ text, url: '', title: '', formFields: [] });
  let text = await pollText(api);
  for (;;) {
    const body = norm(text);
    // 安全验证/验证码必须**立即**判定，不能等满超时 —— 用户不在场时等下去没有意义
    const blocked = BLOCK_TEXTS.find((t) => body.includes(t)) || '';
    if (blocked) return { matched: '', page: snapshot(text), blocked };
    const matched = texts.map(norm).find((t) => t && body.includes(t)) || '';
    if (matched) return { matched, page: snapshot(text), blocked: '' };
    if (Date.now() >= deadline) return { matched: '', page: snapshot(text), blocked: '' };
    await sleep(1500);
    try { text = await pollText(api); } catch { /* 页面忙：继续等，不重试写操作 */ }
  }
}

/** 回读值是否可判定为"已填入期望值"（state 只回传前 60 字符） */
function looksFilled(got: string, want: string): boolean {
  const a = norm(got);
  const b = norm(want);
  if (!b) return true;
  if (a === b || a.includes(b)) return true;
  // state 截断：当前值 ≥20 字符且是期望值的前缀
  return a.length >= 20 && b.startsWith(a);
}

const selAt = (f: FillFieldDef, i: number): string =>
  i === 0 ? f.selector : ((f.selectors && f.selectors[i - 1]) || f.selector);
const selCount = (f: FillFieldDef): number => 1 + (f.selectors ? f.selectors.length : 0);

async function runFill(api: RecipeApi, fields: FillFieldDef[]): Promise<string> {
  const attempt = fields.map(() => 0);
  const missing: string[] = [];
  for (let round = 0; round < 4; round++) {
    // ★ 必须透传 label / type：此前只发 selector+value —— 复选框会被当文本框填、
    //   按显示文本选下拉会变成按 value 选（2026-10-24 真实表单冒烟抓到）。
    const prepared = fields.map((f, i) => ({
      selector: selAt(f, attempt[i]),
      value: f.value,
      ...(f.label !== undefined ? { label: f.label } : {}),
      ...(f.type ? { type: f.type } : {}),
    }));
    const res = await api.action('fill_form', { fields: prepared });
    const failed: any[] = Array.isArray(res?.failed) ? res.failed : [];
    // 元素未找到 → 换该字段的下一个备用选择器（同轮其它字段已填好的值是幂等的，typeIn 会跳过）
    let advanced = false;
    for (const f of failed) {
      const idx = prepared.findIndex((p) => p.selector === f?.selector);
      if (idx < 0) continue;
      if (!/未找到|not found/i.test(String(f?.reason || ''))) continue;
      if (attempt[idx] + 1 < selCount(fields[idx])) { attempt[idx]++; advanced = true; }
    }
    if (failed.length) {
      const detail = failed.map((f) => `${f?.selector || '(无选择器)'} ${f?.reason || ''}`).join('；');
      if (!advanced) {
        throw new Error(`填写失败：${detail}${missing.length ? `（此前 ${missing.join('；')}）` : ''}`);
      }
      missing.push(detail);
      continue;
    }
    // ★ P1-2：deferred / skipped 不是"填失败"，但都会让后续回读核验报出一堆干扰信息。
    //   配方是确定性流程，遇到这两种情况就直接说清原因，不进入无意义的自动重试。
    const deferred = Array.isArray(res?.deferred) ? res.deferred : [];
    if (deferred.length) {
      throw new Error(
        `依赖未就绪（先填上游字段再执行本步）：` +
        deferred.map((d: any) => `${d?.selector || ''} ${d?.reason || ''}`).join('；'),
      );
    }
    const skipped = Array.isArray(res?.skipped) ? res.skipped : [];
    if (skipped.length) {
      throw new Error(
        `控件不支持批量填写（改用 browser_click 展开后选）：` +
        skipped.map((d: any) => `${d?.selector || ''} ${d?.reason || ''}`).join('；'),
      );
    }
    const state: any[] = Array.isArray(res?.state) ? res.state : [];
    const problems: string[] = [];
    for (let i = 0; i < fields.length; i++) {
      const st = state.find((s) => s?.selector === prepared[i].selector);
      if (st && !looksFilled(String(st.value ?? ''), fields[i].value)) {
        problems.push(`${fields[i].label || prepared[i].selector} 回读="${String(st.value ?? '').slice(0, 40)}"`);
      }
    }
    if (problems.length) throw new Error(`回读核验未通过：${problems.join('；')}`);
    return `已填 ${prepared.length} 个字段（回读通过，未重复清空）`;
  }
  throw new Error(`填写失败：备用选择器已用尽（${missing.join('；') || '元素未找到'}）`);
}

async function clickText(api: RecipeApi, text: string, optional: boolean, failHint?: string): Promise<string> {
  const bases = ['button', 'div[role=button],a', 'span'];
  let lastErr = '';
  for (const base of bases) {
    const selector = `${base}:contains(${JSON.stringify(text)})`;
    try {
      let r = await api.action('click', { selector });
      if (r?.ambiguous && Array.isArray(r.candidates) && r.candidates.length) {
        const exact = r.candidates.filter((c: any) => norm(c.text) === norm(text));
        const pick = exact.length ? exact[exact.length - 1] : r.candidates[r.candidates.length - 1];
        r = await api.action('click', { index: pick.index });
      }
      if (r && !r.error) return `已点击「${text}」`;
      lastErr = String(r?.error || '点击未生效');
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }
  if (optional) return `未找到「${text}」（可选步骤，跳过）`;
  throw new Error(`未找到可点击的「${text}」：${lastErr}${failHint ? `。${failHint}` : ''}`);
}

async function runUpload(api: RecipeApi, step: Extract<RecipeStep, { kind: 'upload' }>, params: Record<string, unknown>): Promise<string> {
  const filePath = interp(step.filePath, params);
  if (!filePath) throw new Error('缺少 filePath 参数');
  const timeoutMs = step.timeoutMs || 240000;
  let lastErr = '';
  let started = false;
  for (const raw of step.clickSelectors) {
    try {
      await api.action('upload', { filePath, clickSelector: interp(raw, params) });
      started = true;
      break;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }
  if (!started) throw new Error(`文件上传失败：${lastErr}`);

  const { matched, page, blocked } = await waitForAny(api, step.successTexts, timeoutMs);
  if (blocked) throw new VerificationBlockedError(blocked);
  const body = norm(page.text);
  const fail = (step.failureTexts || []).find((t) => body.includes(norm(t)));
  if (fail) throw new Error(`上传失败：页面出现「${fail}」`);
  if (!matched) {
    const seen = norm(page.text).slice(0, 160) || '(页面文本为空)';
    throw new Error(
      `上传后 ${Math.round(timeoutMs / 1000)}s 内未出现成功标志（${step.successTexts.join(' / ')}）。`
      + `页面当前文案：${seen}。若仍在「上传中/转码中」，等它传完再续跑，**不要重复上传**。`,
    );
  }
  return `已上传 ${filePath}（页面出现「${matched}」）`;
}

export interface RecipeRunOptions {
  /** 用户完成安全验证后，从该步骤（0 基）继续；只执行该步骤及之后 */
  resumeStep?: number;
}

export async function runRecipe(
  recipe: PublishRecipe,
  rawParams: Record<string, unknown>,
  api: RecipeApi,
  opts?: RecipeRunOptions,
): Promise<RecipeRunResult> {
  const params = { ...rawParams };
  const steps: RecipeStepResult[] = [];
  const startIndex = Number.isInteger(opts?.resumeStep)
    ? Math.max(0, Math.min(Number(opts!.resumeStep), recipe.steps.length - 1))
    : 0;
  const submitClickIndex = recipe.steps.findIndex((s) => s.kind === 'clickText' && s.when === 'submit');
  let url = '';
  let title = '';
  // 从"发布点击"之后的步骤续跑：说明上一次已经点过发布，submitted 视为 true（避免谎报未提交）
  let submitted = submitClickIndex >= 0 && startIndex > submitClickIndex;
  let verified = false;
  const push = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  if (startIndex > 0) push('resume', true, `从第 ${startIndex + 1} 步继续（用户已完成验证）`);

  const blockedResult = (blockedText: string, stepIndex: number): RecipeRunResult => ({
    recipe: recipe.id,
    ok: false,
    steps,
    url,
    title,
    readyToSubmit: false,
    submitted,
    verified,
    blockedByVerification: true,
    verificationText: blockedText,
    blockedAtStep: stepIndex,
    resumeStep: stepIndex,
    error: `页面出现安全验证（${blockedText}）`,
  });

  try {
    for (let i = startIndex; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      try {
        const when = 'when' in step ? step.when : undefined;
        if (when && !isTruthy(params[when])) {
          push(step.kind, true, `跳过（参数 ${when} 未提供）`);
          continue;
        }

        if (step.kind === 'navigate') {
          const target = interp(step.url, params);
          await api.navigate(target);
          const page = await readPage(api, 800);
          url = page.url;
          title = page.title;
          push('navigate', true, `已打开 ${target}`);
          continue;
        }

        if (step.kind === 'upload') {
          push('upload', true, await runUpload(api, step, params));
          continue;
        }

        if (step.kind === 'fill') {
          const fields = step.fields.map((f) => ({
            selector: interp(f.selector, params),
            selectors: f.selectors ? f.selectors.map((s) => interp(s, params)) : undefined,
            value: interp(f.value, params),
            label: f.label,
            type: f.type,
          }));
          push('fill', true, await runFill(api, fields));
          continue;
        }

        // ★ P2-2（2026-10-24）通用填表：字段清单由参数传入（JSON），复用 runFill 的
        //   备用选择器回退 + 回读核验，让任意站点也能一次调用闭环，不用模型现场逐字段试错。
        if (step.kind === 'fillFromJson') {
          const raw = params[step.param];
          let list: any = raw;
          if (typeof raw === 'string') {
            try { list = JSON.parse(raw); } catch { list = null; }
          }
          if (!Array.isArray(list) || !list.length) {
            throw new Error(`参数 ${step.param} 必须是字段 JSON 数组：[{selector, selectors?, value, label?}]`);
          }
          const fields = list
            .map((f: any) => ({
              selector: String(f?.selector ?? '').trim(),
              selectors: Array.isArray(f?.selectors) ? f.selectors.map((s: any) => String(s)) : undefined,
              value: String(f?.value ?? ''),
              label: f?.label == null ? undefined : String(f.label),
              type: ['text', 'select', 'checkbox', 'radio'].includes(String(f?.type))
                ? (String(f.type) as FillFieldDef['type'])
                : undefined,
            }))
            .filter((f: FillFieldDef) => f.selector);
          if (!fields.length) throw new Error(`参数 ${step.param} 里没有带 selector 的字段`);
          push('fill', true, await runFill(api, fields));
          continue;
        }

        if (step.kind === 'clickText') {
          const texts = step.texts.map((t) => interp(t, params)).filter(Boolean);
          if (!texts.length) {
            push('clickText', true, '跳过（目标文本为空）');
            continue;
          }
          let detail = '';
          let ok = false;
          let lastError: unknown = null;
          for (const text of texts) {
            try {
              detail = await clickText(api, text, !!step.optional, step.failHint);
              ok = true;
              break;
            } catch (e) {
              lastError = e;
            }
          }
          if (!ok && !step.optional) throw lastError instanceof Error ? lastError : new Error(String(lastError));
          if (!ok) detail = `未找到「${texts.join(' / ')}」（可选步骤，跳过）`;
          if (ok && step.when === 'submit') submitted = true;
          push(`clickText ${texts.join(' / ')}`, ok || !!step.optional, detail);
          continue;
        }

        if (step.kind === 'waitText') {
          const texts = step.texts.map((t) => interp(t, params)).filter(Boolean);
          const { matched, page, blocked } = await waitForAny(api, texts, step.timeoutMs || 30000);
          url = page.url || url;
          title = page.title || title;
          if (blocked) throw new VerificationBlockedError(blocked);
          if (!matched && !step.optional) throw new Error(`等待文本超时：${texts.join(' / ')}${step.failHint ? `。${step.failHint}` : ''}`);
          if (submitted && step.when === 'submit') verified = !!matched;
          push(`waitText ${texts.join(' / ')}`, !!matched, matched ? `出现「${matched}」` : '超时未出现（可选）');
          continue;
        }
      } catch (e: any) {
        // 安全验证不是普通失败：记住**当前步骤下标**作为续跑起点 —— 用户完成后只跑这里往后，
        // 不会重新上传/填表，也不会重复点发布。
        const blocked = e instanceof VerificationBlockedError ? e.blockedText : await detectVerification(api);
        if (blocked) {
          push(recipe.steps[i].kind, false, `被安全验证拦住：${blocked}`);
          return blockedResult(blocked, i);
        }
        throw e;
      }
    }

    const finalPage = await readPage(api, 1200).catch(() => null);
    if (finalPage) {
      url = finalPage.url || url;
      title = finalPage.title || title;
    }
    const hasSubmitStep = submitClickIndex >= 0;
    return {
      recipe: recipe.id,
      ok: true,
      steps,
      url,
      title,
      readyToSubmit: hasSubmitStep && !submitted && !isTruthy(params.submit),
      submitted,
      verified,
    };
  } catch (e: any) {
    const page = await readPage(api, 1200).catch(() => null);
    return {
      recipe: recipe.id,
      ok: false,
      steps,
      url: page?.url || url,
      title: page?.title || title,
      readyToSubmit: false,
      submitted,
      verified: false,
      error: e?.message || String(e),
      pageSnippet: page ? norm(page.text).slice(0, 300) : '',
    };
  }
}

/**
 * 抖音发布配方（2026-10-19，依据 10-14~10-19 多集实战）。
 * 参数：videoPath/title/description 必填；collectionName 可选；submit 默认 false。
 */
export const DOUYIN_PUBLISH_RECIPE: PublishRecipe = {
  id: 'douyin-publish-video',
  description: '抖音创作者中心发布一条视频：上传→填标题/描述→合集（系列任务首集必选）→（submit=true 时）点发布并验证',
  params: {
    videoPath: { type: 'string', required: true, description: '本地成片 mp4 的绝对路径' },
    title: { type: 'string', required: true, description: '作品标题（≤30 字，带别名关键词，禁书名）' },
    description: { type: 'string', required: true, description: '描述正文（≤1000 字，可含 #话题）' },
    collectionName: { type: 'string', description: '系列任务（≥2 集）首集必填：第一集发布前就要创建并选中合集；单集任务可空' },
    submit: { type: 'boolean', description: '是否点击「发布」。默认 false；仅当用户明确要求发布时传 true' },
  },
  steps: [
    { kind: 'navigate', url: 'https://creator.douyin.com/creator-micro/content/upload' },
    {
      kind: 'upload',
      filePath: '{{videoPath}}',
      clickSelectors: ['div:contains("点击上传")', 'button:contains("上传")', 'div:contains("拖拽文件")'],
      successTexts: ['上传成功', '重新上传'],
      failureTexts: ['上传失败', '上传出错'],
      // 上传+转码实测 1–6 分钟（大文件更久）。旧值 240s 会把正常慢传判成失败，
      // 模型接着手工重传 → 单步耗到 15 分钟。宁可多等，也不要误判后重复上传。
      timeoutMs: 600000,
    },
    {
      kind: 'fill',
      fields: [
        { selector: 'input[placeholder*="填写作品标题"]', value: '{{title}}', label: '标题' },
        { selector: '.zone-container.editor-kit-container', value: '{{description}}', label: '描述' },
      ],
    },
    {
      // 系列任务首集必建合集：入口/合集名找不到就**停在发布前**，绝不静默跳过（2026-10-23）
      kind: 'clickText',
      texts: ['选择合集', '添加到合集'],
      when: 'collectionName',
      failHint: '系列任务首集需先在发布页「添加到合集」→「创建新合集」建好合集（或先到合集管理创建）。'
        + '页面已完成上传+填表，**不要重跑配方**——在页面上手动建/选合集后直接点「发布」。'
        + '若确认账号无合集权限（实名/手机号/申请均不满足），先如实报告用户，经同意才可单条发布。',
    },
    {
      kind: 'clickText',
      texts: ['{{collectionName}}'],
      when: 'collectionName',
      failHint: '该合集不在列表 = 合集还没建：请先在发布页「创建新合集」建好并选中；没选中合集不得点发布。',
    },
    { kind: 'clickText', texts: ['确定', '保存', '完成'], when: 'collectionName', optional: true },
    { kind: 'waitText', texts: ['{{collectionName}}'], when: 'collectionName', optional: true, timeoutMs: 8000 },
    { kind: 'clickText', texts: ['发布'], when: 'submit' },
    { kind: 'waitText', texts: ['发布成功', '已提交', '等待审核', '审核中'], when: 'submit', optional: true, timeoutMs: 90000 },
  ],
};

/**
 * 抖音引导评论配方（2026-10-23，依据 2026-10-15 实抓）
 * 为什么要有：此前评论靠模型现场操作，提示词里的锚点还是 10-14 的失效版本
 * （`.comment-input-inner-container` / `span.wchsYBpK`），实测一条评论花 14 分钟。
 * 真实 DOM：输入框是 Draft.js `div.input-d24X73`，发送按钮是**文本「发送」**。
 */
export const DOUYIN_POST_COMMENT_RECIPE: PublishRecipe = {
  id: 'douyin-post-comment',
  description: '抖音创作者后台发一条引导评论：打开互动评论页→选中作品→真实键入→发送→回读核验',
  params: {
    videoTitle: { type: 'string', required: true, description: '目标作品标题（评论区左侧作品列表里可见的标题片段）' },
    comment: { type: 'string', required: true, description: '评论文案（必须点名「番茄小说」App 与别名，禁原书名）' },
  },
  steps: [
    // 服务端硬约束：/creator-micro/data/comment 会跳关注页，必须用 interactive/comment
    { kind: 'navigate', url: 'https://creator.douyin.com/creator-micro/interactive/comment' },
    {
      kind: 'clickText',
      texts: ['{{videoTitle}}'],
      failHint: '作品列表里没找到该标题：确认作品已发布并在列表中；仍找不到就用 browser_click 手动选中作品后重跑本配方，'
        + '**不要重复点发送**（可能已发过）。',
    },
    {
      kind: 'fill',
      fields: [{
        // 首选语义锚点（类名 hash 会漂）：placeholder 文案「有爱评论，说点好听的~」
        selector: 'div[contenteditable="true"][data-placeholder*="有爱评论"]',
        selectors: ['div.input-d24X73', 'div[contenteditable="true"]'],
        value: '{{comment}}',
        label: '评论输入框',
      }],
    },
    {
      kind: 'clickText',
      texts: ['发送'],
      failHint: '发送按钮不可见/不可点：评论没真正写进 Draft.js（必须真实键盘输入）。'
        + '回读输入框当前值后如实报告，不要换脚本反复重填。',
    },
    { kind: 'waitText', texts: ['{{comment}}'], optional: true, timeoutMs: 10000 },
  ],
};

/**
 * 抖音自定义封面配方（2026-10-23）
 * 为什么要有：封面是转化位，但此前只有"本地怎么生成封面"，没有"发布页怎么设"的配方，
 * 模型在 React 弹窗里现场摸索，实测一集封面花 7.5 分钟。
 * 设计边界：只在**视频已上传**的发布页调用（发布配方 submit=false 之后），
 * 失败即停并给出「放弃封面直接发布」的明确出路 —— 绝不重跑发布配方（会重新上传）。
 */
export const DOUYIN_SET_COVER_RECIPE: PublishRecipe = {
  id: 'douyin-set-cover',
  description: '抖音发布页设置自定义封面（视频已上传后调用）：打开封面弹窗→上传图片→确定',
  params: {
    coverPath: { type: 'string', required: true, description: '本地封面绝对路径（4:3 成片用 1080×1440，9:16 用 1080×1920；JPG/PNG）' },
  },
  steps: [
    {
      kind: 'clickText',
      texts: ['选择封面', '编辑封面', '选封面'],
      failHint: '发布页没找到封面入口：确认视频已上传完成、面板已展开。'
        + '页面已完成上传/填表，**不要重跑发布配方**（会重新上传）；封面可放弃，直接点「发布」。',
    },
    { kind: 'clickText', texts: ['上传封面', '本地上传', '上传图片'], optional: true },
    {
      kind: 'upload',
      filePath: '{{coverPath}}',
      clickSelectors: ['div:contains("上传封面")', 'div:contains("点击上传")', 'button:contains("上传")'],
      successTexts: ['上传成功', '重新上传', '裁剪'],
      failureTexts: ['上传失败', '格式不支持', '图片过大'],
      timeoutMs: 60000,
    },
    { kind: 'clickText', texts: ['确定', '完成', '保存'], optional: true },
    { kind: 'waitText', texts: ['封面'], optional: true, timeoutMs: 8000 },
  ],
};

/**
 * 通用填表配方（2026-10-24，P2-2）：任意站点一次调用闭环。
 *
 * 与 fill_form 的差别：fill_form 是一次动作，失败就把 failed 丢回模型去重试；
 * 本配方在**代码里**完成"备用选择器回退 → 回读核验 → 失败即停"，模型只出一轮。
 * 适合字段多、类名带 hash、或需要"填完点保存并确认"的表单。
 */
export const FORM_FILL_RECIPE: PublishRecipe = {
  id: 'form-fill',
  description: '任意页面批量填表：按字段清单一次填完并回读核验（选择器未命中自动用备用选择器重试），可选填完后点提交按钮。',
  params: {
    fields: {
      type: 'string',
      required: true,
      description: '字段 JSON 数组：[{selector, selectors?, value, label?}]。selector 用 get_page_content 编号元素自带的 selector；selectors 为备用选择器（按序回退）；下拉优先用 label。',
    },
    submit: { type: 'boolean', required: false, description: 'true = 填完后点击提交按钮（需同时传 submitText）' },
    submitText: { type: 'string', required: false, description: '提交按钮文本，如 保存 / 提交 / 确定。仅 submit=true 时生效。' },
  },
  steps: [
    { kind: 'fillFromJson', param: 'fields' },
    {
      kind: 'clickText',
      texts: ['{{submitText}}'],
      when: 'submit',
      failHint: 'submit=true 时必须传 submitText（提交按钮的可见文本），并确认页面上确实有这个按钮',
    },
  ],
};

export const RECIPES: Record<string, PublishRecipe> = {
  [DOUYIN_PUBLISH_RECIPE.id]: DOUYIN_PUBLISH_RECIPE,
  [DOUYIN_POST_COMMENT_RECIPE.id]: DOUYIN_POST_COMMENT_RECIPE,
  [DOUYIN_SET_COVER_RECIPE.id]: DOUYIN_SET_COVER_RECIPE,
  [FORM_FILL_RECIPE.id]: FORM_FILL_RECIPE,
};

export function getRecipe(id: string): PublishRecipe | undefined {
  return RECIPES[id];
}

export function listRecipes(): string[] {
  return Object.keys(RECIPES);
}
