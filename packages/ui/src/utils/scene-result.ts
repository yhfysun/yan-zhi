// 场景练习结算卡解析（学习模式 §2.2 场景任务卡）。
//
// 教学宪法约定：陪练达到场景目标后输出单独一行 [SCENE_END]，紧接一个 ```scene_result 围栏 JSON。
// 与 document/ydash 围栏同款管线：抽出渲染成卡、正文剥离，避免用户看到裸 JSON。
// 解析失败时返回 { ok:false }，卡片显示错误但**不吞原文**（降级行为由提示词保证）。

export interface SceneCorrection { wrong: string; right: string; why?: string; grammarPoint?: string }
export interface SceneResult {
  score: number;
  stars: number;
  keyPhrases: string[];
  corrections: SceneCorrection[];
}
export type SceneResultBlock =
  | { ok: true; result: SceneResult }
  | { ok: false; error: string; raw: string };

const FENCE_RE = /```scene_result[ \t]*\r?\n([\s\S]*?)```/g;
/** [SCENE_END] 标记行（有无 JSON 都要从正文剥掉；结算以卡片为准） */
const MARK_RE = /^\s*\[SCENE_END\]\s*$/gm;

function normalize(raw: string): SceneResultBlock {
  const text = String(raw ?? '').trim();
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== 'object') throw new Error('不是对象');
    const score = Number(o.score);
    const stars = Number(o.stars);
    if (!Number.isFinite(score) || !Number.isFinite(stars)) throw new Error('缺少 score / stars');
    const keyPhrases = Array.isArray(o.keyPhrases) ? o.keyPhrases.map((x) => String(x)).filter(Boolean) : [];
    const corrections = Array.isArray(o.corrections)
      ? o.corrections.map((c) => {
        const r = (c || {}) as Record<string, unknown>;
        return {
          wrong: String(r.wrong || '').trim(),
          right: String(r.right || '').trim(),
          why: String(r.why || '').trim() || undefined,
          grammarPoint: String(r.grammarPoint || r.grammar_point || '').trim() || undefined,
        };
      }).filter((c) => c.wrong || c.right)
      : [];
    return {
      ok: true,
      result: {
        score: Math.max(0, Math.min(100, Math.round(score))),
        stars: Math.max(0, Math.min(3, Math.round(stars))),
        keyPhrases,
        corrections,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), raw: text };
  }
}

export function extractSceneResultBlocks(markdown: string): SceneResultBlock[] {
  const out: SceneResultBlock[] = [];
  for (const m of String(markdown || '').matchAll(FENCE_RE)) {
    const raw = (m[1] || '').trim();
    if (raw) out.push(normalize(raw));
  }
  return out;
}

export function stripSceneResultBlocks(markdown: string): string {
  return String(markdown || '')
    .replace(FENCE_RE, '\n')
    .replace(MARK_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
