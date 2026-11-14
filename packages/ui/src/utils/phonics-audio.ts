/**
 * 音标（IPA）本音音频 —— 零基础教学必备：/æ/ /ɛ/ 这类符号系统 TTS 念不了
 * （后端 /learning/tts 明确拒绝 IPA 文本，前端也只读例词），必须用真实音标音频。
 *
 * 音频来源：GitHub 01luyicheng/gimson-phonetics 的 44 个英语音标发音
 * （ipa-pronounce-website/public/ipa-audio/，源自 ipachart），随包分发在
 * apps/web/public/phonics-audio/（vite publicDir → dist → 打包版 file:// 页面可直接取）。
 *
 * ★★ 文件名与音标的对应关系**与直觉相反**，已按上游《音频文件映射分析.md》逐条核对：
 *   - sound_i.mp3     是 /iː/（不是 /ɪ/！）
 *   - sound_long_e.mp3 是 /ɜː/（不是 /iː/！）
 *   - ʃ/ʒ 的文件名是大写 sound_S.mp3 / sound_Z.mp3
 *   - 上游包里 s、z 两个辅音**缺文件**（文档声称有、实际无）→ 查不到返回 null，UI 回退例词朗读
 * 美式 r 色元音（ɑr/ɔr/ɚ/ɝ）上游无对应音频，用最近的单元音近似（标注 APPROX）。
 */

/** 归一化 IPA：去斜杠与空白；tʃ/ʧ、dʒ/ʤ 两套写法统一（课程数据与 IPA chart 用字不同）。 */
export function normalizeIpa(ipa: string): string {
  return String(ipa || '')
    .replace(/[/\s]/g, '')
    .replace(/tʃ/g, 'ʧ')
    .replace(/dʒ/g, 'ʤ');
}

const FILES: Record<string, string> = {
  // ── 短元音 ──
  'ɪ': 'sound_short_i.mp3',
  'e': 'sound_e.mp3',
  'ɛ': 'sound_e.mp3',
  'æ': 'sound_æ.mp3',
  'ʌ': 'sound_ʌ.mp3',
  'ɒ': 'sound_ɒ.mp3',
  'ʊ': 'sound_u.mp3',
  'ə': 'sound_ə.mp3',
  // ── 长元音 ──
  'iː': 'sound_i.mp3',
  'ɑː': 'sound_long_ɑ.mp3',
  'ɔː': 'sound_long_ɔ.mp3',
  'ɜː': 'sound_long_e.mp3',
  'uː': 'sound_long_u.mp3',
  // ── 双元音 ──
  'eɪ': 'sound_eɪ.mp3',
  'aɪ': 'sound_aɪ.mp3',
  'ɔɪ': 'sound_ɔɪ.mp3',
  'əʊ': 'sound_əʊ.mp3',
  'aʊ': 'sound_aʊ.mp3',
  'ɪə': 'sound_ɪə.mp3',
  'eə': 'sound_long_ə.mp3',
  'ʊə': 'sound_ʊə.mp3',
  // ── 辅音（24 个，s/z 上游缺文件不列）──
  'p': 'sound_p.mp3',
  'b': 'sound_b.mp3',
  't': 'sound_t.mp3',
  'd': 'sound_d.mp3',
  'k': 'sound_k.mp3',
  'g': 'sound_g.mp3',
  'f': 'sound_f.mp3',
  'v': 'sound_v.mp3',
  'θ': 'sound_θ.mp3',
  'ð': 'sound_ð.mp3',
  'ʃ': 'sound_S.mp3',
  'ʒ': 'sound_Z.mp3',
  'ʧ': 'sound_ʧ.mp3',
  'ʤ': 'sound_ʤ.mp3',
  'h': 'sound_h.mp3',
  'm': 'sound_m.mp3',
  'n': 'sound_n.mp3',
  'ŋ': 'sound_ŋ.mp3',
  'l': 'sound_l.mp3',
  'r': 'sound_r.mp3',
  'w': 'sound_w.mp3',
  'j': 'sound_j.mp3',
};

/** 美式特有写法 → 最近的可用音频（APPROX：上游无 r 色元音音频，近似值由人工核对选定）。 */
const APPROX: Record<string, string> = {
  'ɑ': 'sound_long_ɑ.mp3',   // 美式 ɑ = 英式 ɑː
  'ɑr': 'sound_long_ɑ.mp3',  // APPROX：ɑ + r，无独立音频
  'ɔ': 'sound_long_ɔ.mp3',
  'ɔr': 'sound_long_ɔ.mp3',  // APPROX
  'ɚ': 'sound_ə.mp3',        // APPROX：弱化 r 化 schwa
  'ɝ': 'sound_long_e.mp3',   // APPROX：重读 r 化 ≈ ɜː
  'oʊ': 'sound_əʊ.mp3',      // 美式 oʊ ≈ 英式 əʊ
  'u': 'sound_u.mp3',
};

/**
 * 音标 → 可播放音频地址（绝对 URL，遵循"媒体地址必须绝对化"的全仓规矩；
 * file:// 打包页与 http 页面都按 document.baseURI 解析）。查不到返回 null。
 */
export function phonicsAudioSrc(ipa: string): string | null {
  const key = normalizeIpa(ipa);
  const file = FILES[key] || APPROX[key];
  if (!file) return null;
  // 非 DOM 环境（SSR/纯 node 测试）退回相对路径；浏览器/打包页按 document.baseURI 绝对化
  if (typeof document === 'undefined') return `phonics-audio/${file}`;
  return new URL(`phonics-audio/${file}`, document.baseURI).href;
}

/** 供测试核对：全部映射条目（键为归一化 IPA）。 */
export function phonicsAudioTable(): Record<string, string> {
  return { ...FILES, ...APPROX };
}
