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
  value: string;
  label?: string;
}

export type RecipeWhen = 'submit' | 'collectionName';

export type RecipeStep =
  | { kind: 'navigate'; url: string }
  | { kind: 'upload'; filePath: string; clickSelectors: string[]; successTexts: string[]; failureTexts?: string[]; timeoutMs?: number }
  | { kind: 'fill'; fields: FillFieldDef[] }
  | { kind: 'clickText'; texts: string[]; optional?: boolean; when?: RecipeWhen }
  | { kind: 'waitText'; texts: string[]; timeoutMs?: number; optional?: boolean; when?: RecipeWhen };

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
    const page = await readPage(api, 800);
    return BLOCK_TEXTS.find((t) => norm(page.text).includes(t)) || '';
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

async function waitForAny(
  api: RecipeApi,
  texts: string[],
  timeoutMs: number,
): Promise<{ matched: string; page: PageSnapshot; blocked: string }> {
  const deadline = Date.now() + timeoutMs;
  let page = await readPage(api);
  for (;;) {
    const body = norm(page.text);
    // 安全验证/验证码必须**立即**判定，不能等满超时 —— 用户不在场时等下去没有意义
    const blocked = BLOCK_TEXTS.find((t) => body.includes(t)) || '';
    if (blocked) return { matched: '', page, blocked };
    const matched = texts.map(norm).find((t) => t && body.includes(t)) || '';
    if (matched) return { matched, page, blocked: '' };
    if (Date.now() >= deadline) return { matched: '', page, blocked: '' };
    await sleep(1500);
    try { page = await readPage(api); } catch { /* 页面忙：继续等，不重试写操作 */ }
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

async function runFill(api: RecipeApi, fields: FillFieldDef[]): Promise<string> {
  const prepared = fields.map((f) => ({ selector: f.selector, value: f.value }));
  const res = await api.action('fill_form', { fields: prepared });
  const failed: any[] = Array.isArray(res?.failed) ? res.failed : [];
  if (failed.length) {
    const detail = failed.map((f) => `${f?.selector || '(无选择器)'} ${f?.reason || ''}`).join('；');
    throw new Error(`填写失败：${detail}`);
  }
  const state: any[] = Array.isArray(res?.state) ? res.state : [];
  const problems: string[] = [];
  for (const f of fields) {
    const st = state.find((s) => s?.selector === f.selector);
    if (st && !looksFilled(String(st.value ?? ''), f.value)) {
      problems.push(`${f.label || f.selector} 回读="${String(st.value ?? '').slice(0, 40)}"`);
    }
  }
  if (problems.length) throw new Error(`回读核验未通过：${problems.join('；')}`);
  return `已填 ${prepared.length} 个字段（回读通过，未重复清空）`;
}

async function clickText(api: RecipeApi, text: string, optional: boolean): Promise<string> {
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
  throw new Error(`未找到可点击的「${text}」：${lastErr}`);
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
    throw new Error(`上传后 ${Math.round(timeoutMs / 1000)}s 内未出现成功标志（${step.successTexts.join(' / ')}）`);
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
            value: interp(f.value, params),
            label: f.label,
          }));
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
              detail = await clickText(api, text, !!step.optional);
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
          if (!matched && !step.optional) throw new Error(`等待文本超时：${texts.join(' / ')}`);
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
  description: '抖音创作者中心发布一条视频：上传→填标题/描述→可选合集→（submit=true 时）点发布并验证',
  params: {
    videoPath: { type: 'string', required: true, description: '本地成片 mp4 的绝对路径' },
    title: { type: 'string', required: true, description: '作品标题（≤30 字，带别名关键词，禁书名）' },
    description: { type: 'string', required: true, description: '描述正文（≤1000 字，可含 #话题）' },
    collectionName: { type: 'string', description: '可选：要归入的已有合集名' },
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
      timeoutMs: 240000,
    },
    {
      kind: 'fill',
      fields: [
        { selector: 'input[placeholder*="填写作品标题"]', value: '{{title}}', label: '标题' },
        { selector: '.zone-container.editor-kit-container', value: '{{description}}', label: '描述' },
      ],
    },
    { kind: 'clickText', texts: ['选择合集', '添加到合集'], when: 'collectionName', optional: true },
    { kind: 'clickText', texts: ['{{collectionName}}'], when: 'collectionName', optional: true },
    { kind: 'clickText', texts: ['确定', '保存', '完成'], when: 'collectionName', optional: true },
    { kind: 'waitText', texts: ['{{collectionName}}'], when: 'collectionName', optional: true, timeoutMs: 8000 },
    { kind: 'clickText', texts: ['发布'], when: 'submit' },
    { kind: 'waitText', texts: ['发布成功', '已提交', '等待审核', '审核中'], when: 'submit', optional: true, timeoutMs: 90000 },
  ],
};

export const RECIPES: Record<string, PublishRecipe> = {
  [DOUYIN_PUBLISH_RECIPE.id]: DOUYIN_PUBLISH_RECIPE,
};

export function getRecipe(id: string): PublishRecipe | undefined {
  return RECIPES[id];
}

export function listRecipes(): string[] {
  return Object.keys(RECIPES);
}
