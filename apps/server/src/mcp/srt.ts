// SRT 字幕生成 —— 纯函数层。
//
// 设计要点：分镜表每镜自带「时长(s)」，所以字幕时间轴是纯计算（累加），零 ASR 成本。
// LLM 从自己的分镜表里抽出 {text, duration} 数组传进来即可；给了 start/end 就按显式时间。
// 这里不做任何解析分镜 markdown 的事 —— 那是 LLM 擅长的，解析自由格式是易碎品。

export interface SrtCue {
  text: string;
  /** 显式起始秒；给了就必须与 end 成对，否则该条丢弃（不降级成累加） */
  start?: number;
  /** 显式结束秒；不给则按 duration 累加推算 */
  end?: number;
  /** 时长秒（与 start/end 二选一；缺省 3 秒） */
  duration?: number;
}

/** 秒 → SRT 时间戳 HH:MM:SS,mmm */
export function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export type SrtBuildResult =
  | { ok: true; srt: string; count: number }
  | { ok: false; error: string };

const DEFAULT_CUE_DURATION = 3;

/** 把台词列表编成 SRT。时间缺失时按时长累加推算；空台词跳过；无有效台词则报错。 */
export function buildSrt(cues: SrtCue[]): SrtBuildResult {
  const valid: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const c of cues || []) {
    const text = String(c?.text || '').trim();
    if (!text) continue;
    // 显式起止与累加是两种不同意图，不能互相降级：
    // 给了 start/end 但非法（end<=start 或只给一个）→ 丢弃该条。
    // 若降级成累加，会把用户明确给出的错坐标悄悄改成另一段时间 → 字幕整体错位，且无从察觉。
    const hasStart = typeof c.start === 'number';
    const hasEnd = typeof c.end === 'number';
    let start: number;
    let end: number;
    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd) continue;
      start = c.start as number;
      end = c.end as number;
      if (!(end > start)) continue;
    } else {
      const dur = typeof c.duration === 'number' && c.duration > 0 ? c.duration : DEFAULT_CUE_DURATION;
      start = cursor;
      end = cursor + dur;
    }
    valid.push({ start, end, text });
    cursor = end;
  }
  if (!valid.length) return { ok: false, error: '没有可用的字幕条目（需要非空 text，且带 start/end 或 duration）' };
  const srt = valid
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`)
    .join('\n\n') + '\n';
  return { ok: true, srt, count: valid.length };
}
