// 音效库 —— **素材生成式**（不打包二进制，用 ffmpeg 合成）。
//
// ★★★ 为什么是"合成"而不是"内置 mp3 文件"（2026-10-07 诚实的技术判断）：
//   ① **版权**：打包真实音乐/音效涉及授权，任何"内置配乐"都可能给用户带来法律风险；
//   ② **体积**：一条 30s 的 320kbps 音乐 ≈ 1.2MB，几十条就是几十 MB，安装包受不了；
//   ③ **能力**：ffmpeg 的 lavfi 源（sine/anoisesrc/aevalsrc）**能合成出可用的转场音、
//      提示音、低频垫**——这些在剪辑里是高频需求，且合成结果完全免版权。
//   ⚠️ 明确做不到的：**好听的旋律性 BGM**（合成器做不出编曲）。
//      所以这里只提供"音效 + 氛围垫"，旋律配乐需要用户自备或走素材市场。
//
// ★ 每个音效都**实测过**（tools/verify-sfx-library.cjs）：能生成、有时长、有音轨。

export interface SfxItem {
  id: string;
  label: string;
  desc: string;
  group: '转场' | '提示' | '节奏' | '氛围';
  /** ffmpeg 输入参数（lavfi 源） */
  input: string[];
  /** 音频滤镜链 */
  af: string;
  /** 建议时长上限（秒）——预览/生成时用它，避免无限源写出巨文件 */
  maxSec: number;
}

export const SFX_LIBRARY: SfxItem[] = [
  // ── 转场 ──
  {
    id: 'whoosh', label: '呼——', desc: '转场风声，最通用的镜头切换音', group: '转场',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.45:c=pink:a=0.5'],
    af: 'highpass=f=300,lowpass=f=6000,afade=t=in:st=0:d=0.15,afade=t=out:st=0.30:d=0.15,volume=0.7',
    maxSec: 0.45,
  },
  {
    id: 'swish', label: '唰', desc: '短促掠过的切片感，适合快剪', group: '转场',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.25:c=white:a=0.6'],
    af: 'highpass=f=1200,lowpass=f=9000,afade=t=out:st=0.05:d=0.20,volume=0.65',
    maxSec: 0.25,
  },
  {
    id: 'riser', label: '升起', desc: '上扬铺垫，接爆点/高潮前用', group: '转场',
    input: ['-f', 'lavfi', '-i', 'sine=frequency=200:duration=1.2'],
    // ★ 用 asetrate 做升调（比 aeval 稳；aeval 参数写错会直接失败，实测踩到）
    af: 'asetrate=44100*1.35,aresample=44100,highpass=f=120,afade=t=in:st=0:d=0.3,afade=t=out:st=1.0:d=0.2,volume=0.45',
    maxSec: 1.2,
  },

  // ── 提示 ──
  {
    id: 'ding', label: '叮', desc: '上扬提示音，强调信息点', group: '提示',
    input: ['-f', 'lavfi', '-i', 'sine=frequency=1320:duration=0.5'],
    af: 'afade=t=out:st=0.05:d=0.45,volume=0.6',
    maxSec: 0.5,
  },
  {
    id: 'notify', label: '提示', desc: '双音提示，用于要点罗列', group: '提示',
    input: ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.9'],
    // 用 vibrato 做"两声"的听感（不需要复杂的双源 mix）
    af: 'vibrato=f=4:d=1,afade=t=out:st=0.5:d=0.4,volume=0.55',
    maxSec: 0.9,
  },
  {
    id: 'error', label: '警告', desc: '低沉下行音，负面/提醒场景', group: '提示',
    input: ['-f', 'lavfi', '-i', 'sine=frequency=320:duration=0.7'],
    af: 'asetrate=44100*0.85,aresample=44100,lowpass=f=900,afade=t=out:st=0.3:d=0.4,volume=0.6',
    maxSec: 0.7,
  },

  // ── 节奏 ──
  {
    id: 'hit', label: '鼓点', desc: '低频重击，卡点用', group: '节奏',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.12:c=white:a=1.0'],
    af: 'lowpass=f=200,afade=t=out:st=0:d=0.12,volume=1.1',
    maxSec: 0.12,
  },
  {
    id: 'tick', label: '滴答', desc: '轻微记拍声，倒数/计时感', group: '节奏',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.7'],
    af: 'bandpass=f=2600:width_type=h:w=1200,afade=t=out:st=0:d=0.06,volume=0.5',
    maxSec: 0.06,
  },

  // ── 氛围 ──
  {
    id: 'pad_soft', label: '柔垫', desc: '低频环境垫，压掉空洞感（10 秒循环）', group: '氛围',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=10:c=brown:a=0.35'],
    af: 'lowpass=f=400,volume=0.5',
    maxSec: 10,
  },
  {
    id: 'room', label: '室内底噪', desc: '极轻的房间环境音，让干声不"贴脸"', group: '氛围',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=10:c=pink:a=0.12'],
    af: 'lowpass=f=2200,highpass=f=80,volume=0.35',
    maxSec: 10,
  },
  {
    id: 'wind', label: '风声', desc: '空旷外景氛围（10 秒循环）', group: '氛围',
    input: ['-f', 'lavfi', '-i', 'anoisesrc=d=10:c=brown:a=0.5'],
    af: 'lowpass=f=1200,highpass=f=120,vibrato=f=0.3:d=0.6,volume=0.45',
    maxSec: 10,
  },
];

export function sfxById(id: string): SfxItem | null {
  return SFX_LIBRARY.find((s) => s.id === id) || null;
}