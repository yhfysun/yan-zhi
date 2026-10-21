"""DiffSinger 声库（OpenUTAU 格式）推理桥 —— 配置驱动，可换声库。

结构对齐基准（逐条来自 OpenUtau 源码）：
  OpenUtau.Core/DiffSinger/DiffSingerUtils.cs      PaddedSegments / DurationsMsToFrames / PaddedLanguageIds
  OpenUtau.Core/DiffSinger/DiffSingerRenderer.cs   输入张量顺序与默认值
  OpenUtau.Core/DiffSinger/DiffSingerBasePhonemizer.cs

关键规则：
  1. 音素序列 = 头 SP(8 帧) + [音符间真空档的 SP] + 各音符音素 + 尾 SP(8 帧)。
     音符内部（声母/韵母之间）**不加** SP。
  2. 拼音→音素查声库自带的 dsdict-zh.yaml，不用自写切分规则。
  3. 语言 id：真实音素取 languages.json 的 zh，SP/AP 取 0；use_lang_id=false 的声库不喂。
  4. duration 由毫秒**累加后**取整再作差。
  5. velocity=1.0；depth=min(1.0,max_depth)；steps=20/20/10（OpenUtau 默认）。

所有模型输入都按 session 的 input 名过滤后喂入，所以同一个桥可以跑不同声库
（有无 languages / spk_embed / tension 自动适配）。
"""

import json
import math
import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(Path(os.environ['APPDATA'], 'yan-zhi', 'server-data', 'singing', 'pylibs')))

import numpy as np
import onnxruntime as rt

SR = 44100
HOP = 512
FRAME_MS = 1000.0 * HOP / SR

HEAD_FRAMES = 8
TAIL_FRAMES = 8
PADDING_MS = 500.0

ACOUSTIC_STEPS = 20
VARIANCE_STEPS = 20
PITCH_STEPS = 10

INITIAL_RATIO = 0.28

VOICE_DIR_NAME = 'Qixuan_v2.7.0_DiffSinger_OpenUtau'


def _voice_dir():
    return ROOT / 'qixuan' / VOICE_DIR_NAME


def _read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_config(path):
    """读 dsconfig.yaml（只处理 key: value 与 "- item" 列表，够用且不引第三方依赖）。"""
    cfg, key = {}, None
    with open(path, encoding='utf-8') as f:
        for line in f:
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            if line.startswith('- ') and key:
                cfg.setdefault(key, [])
                if isinstance(cfg[key], list):
                    cfg[key].append(line[2:].strip())
                continue
            if ':' in line and not line.startswith(' '):
                k, _, v = line.partition(':')
                key = k.strip()
                v = v.strip()
                cfg[key] = v if v else []
    return cfg


def as_bool(v):
    return str(v).strip().lower() in ('true', '1', 'yes')


def run_onnx(sess, outputs, feed):
    names = {i.name for i in sess.get_inputs()}
    return sess.run(outputs, {k: v for k, v in feed.items() if k in names})


def load_phoneme_table(vb_dir):
    """解析 dsdict-zh.yaml 的 entries，得到 拼音→音素列表。首次运行缓存为 JSON。"""
    cache = vb_dir / 'dsdur' / '.pinyin-phonemes.json'
    if cache.exists():
        try:
            return _read_json(cache)
        except Exception:
            pass
    table, current, in_entries = {}, None, False
    with open(vb_dir / 'dsdur' / 'dsdict-zh.yaml', encoding='utf-8') as f:
        for line in f:
            if not in_entries:
                if line.startswith('entries:'):
                    in_entries = True
                continue
            if line.startswith('- grapheme: '):
                current = line[len('- grapheme: '):].strip()
                table.setdefault(current, [])
                continue
            stripped = line.strip()
            if current and stripped.startswith('- '):
                symbol = stripped[2:].strip()
                if symbol.startswith('zh/') or symbol in ('SP', 'AP'):
                    table[current].append(symbol)
    table = {k: v for k, v in table.items() if v}
    try:
        with open(cache, 'w', encoding='utf-8') as f:
            json.dump(table, f, ensure_ascii=False)
    except Exception:
        pass
    return table


def pinyin_of(note):
    py = (note.get('py') or '').strip().lower()
    if py:
        return py
    text = (note.get('text') or '').strip()
    if not text:
        return ''
    from pypinyin import lazy_pinyin, Style
    parts = lazy_pinyin(text, style=Style.NORMAL, strict=False)
    return parts[0] if parts else ''


def freq_to_midi(freq):
    return int(round(69 + 12 * math.log2(max(1e-6, float(freq)) / 440.0)))


def load_speaker_embed(vb_dir, cfg, name=None):
    """多音色声库的 spk_embed 是 <name>.emb（float32 裸数组）；单音色返回 None。"""
    speakers = cfg.get('speakers') or []
    if not isinstance(speakers, list) or not speakers:
        return None
    want = name if name in speakers else speakers[0]
    path = vb_dir / f'{want}.emb'
    if not path.exists():
        return None
    arr = np.fromfile(path, dtype=np.float32)
    return arr if arr.size else None


class DurationModel:
    """OpenUtau dsdur：linguistic + duration predictor，按音符网格缩放。"""

    def __init__(self, vb_dir):
        d = vb_dir / 'dsdur'
        self.cfg = load_config(d / 'dsconfig.yaml')
        self.ids = _read_json(d / self.cfg['phonemes'])
        self.langs = _read_json(d / self.cfg['languages']) if self.cfg.get('languages') else {}
        self.use_lang = as_bool(self.cfg.get('use_lang_id', 'false'))
        self.ling = rt.InferenceSession(str(d / self.cfg['linguistic']), providers=['CPUExecutionProvider'])
        self.dur = rt.InferenceSession(str(d / self.cfg['dur']), providers=['CPUExecutionProvider'])

    def predict(self, phone_lists, note_ms, midis, spk=None):
        lang_zh = self.langs.get('zh', 3)
        tokens, langs, midi_seq = [self.ids['SP']], [0], [midis[0]]
        word_div = [1]
        word_dur = [max(1, int(round(PADDING_MS / FRAME_MS)))]
        for phones, ms, midi in zip(phone_lists, note_ms, midis):
            for p in phones:
                tokens.append(self.ids[p])
                langs.append(lang_zh)
                midi_seq.append(midi)
            word_div.append(max(1, len(phones)))
            word_dur.append(max(1, int(round(ms / FRAME_MS))))

        enc, mask = run_onnx(self.ling, ['encoder_out', 'x_masks'], {
            'tokens': np.asarray([tokens], np.int64),
            'languages': np.asarray([langs], np.int64),
            'word_div': np.asarray([word_div], np.int64),
            'word_dur': np.asarray([word_dur], np.int64),
        })
        feed = {
            'encoder_out': enc,
            'x_masks': mask,
            'ph_midi': np.asarray([midi_seq], np.int64),
        }
        if spk is not None:
            feed['spk_embed'] = np.tile(spk, (1, len(tokens), 1))
        ph_dur = run_onnx(self.dur, ['ph_dur_pred'], feed)[0][0]

        result, idx = [], 1  # 跳过句首 SP
        for phones, ms in zip(phone_lists, note_ms):
            frames = [max(1e-3, float(x)) for x in ph_dur[idx:idx + len(phones)]]
            idx += len(phones)
            ratio = ms / (sum(frames) or 1.0)
            offsets, acc = [], 0.0
            for x in frames:
                acc += x * ratio
                offsets.append(acc)
            durs, prev = [], 0.0
            for off in offsets:
                durs.append(max(FRAME_MS, off - prev))
                prev = off
            if durs:
                durs[-1] = max(FRAME_MS, ms - (offsets[-2] if len(offsets) > 1 else 0.0))
            result.append(durs)
        return result

    @staticmethod
    def heuristic(phone_lists, note_ms):
        out = []
        for phones, ms in zip(phone_lists, note_ms):
            if not phones:
                out.append([])
            elif len(phones) == 1:
                out.append([ms])
            else:
                head = max(FRAME_MS, ms * INITIAL_RATIO)
                out.append([head] + [0.0] * (len(phones) - 2) + [max(FRAME_MS, ms - head)])
        return out


class PitchModel:
    """OpenUtau dspitch：逐帧音高（半音），带滑音/颤音。"""

    def __init__(self, vb_dir):
        d = vb_dir / 'dspitch'
        self.cfg = load_config(d / 'dsconfig.yaml')
        self.ids = _read_json(d / self.cfg['phonemes'])
        self.langs = _read_json(d / self.cfg['languages']) if self.cfg.get('languages') else {}
        self.ling = rt.InferenceSession(str(d / self.cfg['linguistic']), providers=['CPUExecutionProvider'])
        self.pitch = rt.InferenceSession(str(d / self.cfg['pitch']), providers=['CPUExecutionProvider'])

    def predict(self, symbols, durations, spans, spk=None):
        total = sum(durations)
        lang_zh = self.langs.get('zh', 3)
        tokens = [self.ids[s] for s in symbols]
        langs = [0 if s in ('SP', 'AP') else lang_zh for s in symbols]
        word_div = [len(tokens)]
        enc, _ = run_onnx(self.ling, ['encoder_out', 'x_masks'], {
            'tokens': np.asarray([tokens], np.int64),
            'languages': np.asarray([langs], np.int64),
            'word_div': np.asarray([word_div], np.int64),
            'word_dur': np.asarray([[total]], np.int64),
        })

        note_dur = durations_to_frames([s[0] for s in spans])
        note_dur[-1] += total - sum(note_dur)
        feed = {
            'encoder_out': enc,
            'ph_dur': np.asarray([durations], np.int64),
            'note_midi': np.asarray([[float(s[1]) for s in spans]], np.float32),
            'note_dur': np.asarray([note_dur], np.int64),
            'note_rest': np.asarray([[bool(s[2]) for s in spans]], np.bool_),
            'pitch': np.full((1, total), 60.0, np.float32),
            'expr': np.ones((1, total), np.float32),
            'retake': np.ones((1, total), np.bool_),
            'steps': np.asarray([PITCH_STEPS], np.int64),
        }
        if spk is not None:
            feed['spk_embed'] = np.tile(spk, (1, total, 1))
        return run_onnx(self.pitch, ['pitch_pred'], feed)[0][0].astype(np.float32)


class VarianceModel:
    """OpenUtau dsvariance：预测 breathiness / voicing /（可选）tension。

    ★ 量纲（实测）：variance 输出是 dB 区间 [-96,0]，acoustic 吃 0~1 → 用 (x+96)/96 映射；
      voicing 再保留 OpenUtau 的 -12dB 偏移。tension 用原值（OpenUtau 的 TENC 单位）。
    """

    def __init__(self, vb_dir):
        d = vb_dir / 'dsvariance'
        self.cfg = load_config(d / 'dsconfig.yaml')
        self.ids = _read_json(d / self.cfg['phonemes'])
        self.langs = _read_json(d / self.cfg['languages']) if self.cfg.get('languages') else {}
        self.ling = rt.InferenceSession(str(d / self.cfg['linguistic']), providers=['CPUExecutionProvider'])
        self.var = rt.InferenceSession(str(d / self.cfg['variance']), providers=['CPUExecutionProvider'])
        self.out_names = [o.name for o in self.var.get_outputs()]

    def predict(self, symbols, durations, tones, spk=None):
        total = sum(durations)
        lang_zh = self.langs.get('zh', 3)
        tokens = [self.ids[s] for s in symbols]
        langs = [0 if s in ('SP', 'AP') else lang_zh for s in symbols]
        enc, _ = run_onnx(self.ling, ['encoder_out', 'x_masks'], {
            'tokens': np.asarray([tokens], np.int64),
            'languages': np.asarray([langs], np.int64),
            'word_div': np.asarray([[len(tokens)]], np.int64),
            'word_dur': np.asarray([[total]], np.int64),
            'ph_dur': np.asarray([durations], np.int64),
        })
        feed = {
            'encoder_out': enc,
            'ph_dur': np.asarray([durations], np.int64),
            'pitch': np.asarray([tones], np.float32),
            'breathiness': np.zeros((1, total), np.float32),
            'voicing': np.zeros((1, total), np.float32),
            'tension': np.zeros((1, total), np.float32),
            'retake': np.ones((1, total, len(self.out_names)), np.bool_),
            'steps': np.asarray([VARIANCE_STEPS], np.int64),
        }
        if spk is not None:
            feed['spk_embed'] = np.tile(spk, (1, total, 1))
        outs = run_onnx(self.var, self.out_names, feed)
        got = dict(zip(self.out_names, outs))
        F = total
        breath = got.get('breathiness_pred')
        voicing = got.get('voicing_pred')
        tension = got.get('tension_pred')
        breath = np.clip((breath[0] + 96.0) / 96.0, 0.0, 1.0) if breath is not None else np.full(F, 0.5, np.float32)
        voicing = np.clip((voicing[0] - 12.0 + 96.0) / 96.0, 0.0, 1.0) if voicing is not None else np.full(F, 0.5, np.float32)
        tension = np.clip(tension[0], -10.0, 10.0) if tension is not None else np.zeros(F, np.float32)
        return breath.astype(np.float32), voicing.astype(np.float32), tension.astype(np.float32)


def build_segments(notes, phone_lists, note_durs):
    """返回 [(symbol, dur_ms, kind, freq)]，kind ∈ {head,tail,gap,initial,other,final}。"""
    segments = [('SP', HEAD_FRAMES * FRAME_MS, 'head', 0.0)]
    for i, note in enumerate(notes):
        if i > 0:
            gap_ms = float(note.get('gapMs') or 0)
            if gap_ms > 0:
                segments.append(('SP', gap_ms, 'gap', 0.0))
        freq = float(note['freq'])
        phones = phone_lists[i]
        if not phones:
            segments.append(('SP', float(note['dur']) * 1000.0, 'gap', 0.0))
            continue
        for j, (symbol, dur_ms) in enumerate(zip(phones, note_durs[i])):
            if len(phones) == 1:
                kind = 'final'
            elif j == 0:
                kind = 'initial'
            elif j == len(phones) - 1:
                kind = 'final'
            else:
                kind = 'other'
            segments.append((symbol, max(FRAME_MS, dur_ms), kind, freq))
    segments.append(('SP', TAIL_FRAMES * FRAME_MS, 'tail', 0.0))
    return segments


def durations_to_frames(durations_ms):
    """OpenUtau DurationsMsToFrames：累加后取整再作差。"""
    frames, accumulated, previous = [], 0.0, 0
    for ms in durations_ms:
        accumulated += ms
        current = int(round(accumulated / FRAME_MS))
        frames.append(current - previous)
        previous = current
    return frames


def build(payload, vb_dir):
    cfg = load_config(vb_dir / 'dsconfig.yaml')
    table = load_phoneme_table(vb_dir)
    notes = payload['notes']
    phone_lists = [table.get(pinyin_of(n)) or [] for n in notes]
    note_ms = [float(n['dur']) * 1000.0 for n in notes]
    midis = [freq_to_midi(n['freq']) for n in notes]
    spk = load_speaker_embed(vb_dir, cfg, payload.get('speaker'))
    spk_t = spk[None, :] if spk is not None else None

    warnings = []
    try:
        note_durs = DurationModel(vb_dir).predict(phone_lists, note_ms, midis, spk_t)
        dur_source = 'dsdur'
    except Exception as e:
        note_durs = DurationModel.heuristic(phone_lists, note_ms)
        dur_source = 'heuristic'
        warnings.append(f'dsdur 不可用，声母时长按 {int(INITIAL_RATIO * 100)}% 经验切分：{e}')

    segments = build_segments(notes, phone_lists, note_durs)
    durations = durations_to_frames([s[1] for s in segments])
    if sum(durations) <= 0:
        raise ValueError('empty phoneme sequence')

    phoneme_ids = _read_json(vb_dir / cfg['phonemes'])
    languages = _read_json(vb_dir / cfg['languages']) if cfg.get('languages') else {}
    lang_zh = languages.get('zh', 3)

    tokens, langs = [], []
    for symbol, _ms, _kind, _freq in segments:
        token = phoneme_ids.get(symbol)
        if token is None:
            raise ValueError(f'音素 {symbol} 不在声库 phonemes.json 里')
        tokens.append(token)
        langs.append(0 if symbol in ('SP', 'AP') else lang_zh)

    spans = []
    for symbol, ms, kind, freq in segments:
        midi = (69 + 12 * math.log2(float(freq) / 440.0)) if freq > 0 else (midis[0] if midis else 60.0)
        spans.append((ms, midi, kind in ('head', 'gap', 'tail')))

    symbols = [s[0] for s in segments]
    try:
        tones = PitchModel(vb_dir).predict(symbols, durations, spans, spk_t)
        pitch_source = 'dspitch'
    except Exception as e:
        tones = np.concatenate([np.full(d, sp[1], np.float32) for sp, d in zip(spans, durations)]) \
            if segments else np.zeros(0, np.float32)
        pitch_source = 'flat'
        warnings.append(f'dspitch 不可用，使用音符恒定音高：{e}')

    voiced_per_frame = [not s[2] for s, d in zip(spans, durations) for _ in range(d)]
    f0 = [440.0 * (2.0 ** ((float(t) - 69.0) / 12.0)) if v else 0.0
          for t, v in zip(tones, voiced_per_frame)]

    try:
        breathiness, voicing, tension = VarianceModel(vb_dir).predict(symbols, durations, tones, spk_t)
        var_source = 'variance'
    except Exception as e:
        F = len(f0)
        breathiness = np.full(F, 0.5, np.float32)
        voicing = np.full(F, 0.5, np.float32)
        tension = np.zeros(F, np.float32)
        var_source = 'fallback'
        warnings.append(f'variance 模型不可用，使用保守占位值：{e}')

    return {
        'cfg': cfg,
        'segments': segments,
        'durations': durations,
        'tokens': tokens,
        'languages': langs,
        'f0': f0,
        'breathiness': breathiness,
        'voicing': voicing,
        'tension': tension,
        'spk': spk,
        'durSource': dur_source,
        'varSource': var_source,
        'pitchSource': pitch_source,
        'warnings': warnings,
    }


def vocoder_path(vb_dir, cfg):
    local = vb_dir / 'dsvocoder' / f'{cfg.get("vocoder", "")}.onnx'
    if local.exists():
        return local
    return ROOT / 'vocoder_onnx' / 'pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx'


def main():
    payload = json.load(sys.stdin)
    vb_dir = Path(payload.get('voiceDir') or _voice_dir())
    built = build(payload, vb_dir)

    if payload.get('dump'):
        print(json.dumps({
            'ok': True,
            'segments': [
                {'symbol': s[0], 'kind': s[2], 'frames': d, 'token': t, 'lang': l}
                for s, d, t, l in zip(built['segments'], built['durations'],
                                      built['tokens'], built['languages'])
            ],
            'totalFrames': sum(built['durations']),
            'durSource': built['durSource'],
            'varSource': built['varSource'],
            'pitchSource': built['pitchSource'],
            'warnings': built['warnings'],
        }, ensure_ascii=False))
        return

    cfg = built['cfg']
    n_frames = len(built['f0'])
    feed = {
        'tokens': np.asarray([built['tokens']], np.int64),
        'languages': np.asarray([built['languages']], np.int64),
        'durations': np.asarray([built['durations']], np.int64),
        'f0': np.asarray([built['f0']], np.float32),
        'breathiness': built['breathiness'][None, :],
        'voicing': built['voicing'][None, :],
        'tension': built['tension'][None, :],
        'gender': np.zeros((1, n_frames), np.float32),
        'velocity': np.ones((1, n_frames), np.float32),
        'depth': np.asarray(float(payload.get('depth', 0.6)), np.float32),
        'steps': np.asarray(int(payload.get('steps', ACOUSTIC_STEPS)), np.int64),
    }
    if built['spk'] is not None:
        feed['spk_embed'] = np.tile(built['spk'][None, :], (1, n_frames, 1))

    sess = rt.InferenceSession(str(vb_dir / cfg['acoustic']), providers=['CPUExecutionProvider'])
    mel = run_onnx(sess, ['mel'], feed)[0].astype(np.float32)

    voc = rt.InferenceSession(str(vocoder_path(vb_dir, cfg)), providers=['CPUExecutionProvider'])
    wav = voc.run(['waveform'], {'mel': mel, 'f0': feed['f0']})[0].reshape(-1)
    peak = float(np.abs(wav).max())
    if peak > 0.95:
        wav = (wav * (0.95 / peak)).astype(np.float32)

    import soundfile as sf
    sf.write(payload['out'], wav, SR)
    print(json.dumps({'ok': True, 'sr': SR, 'frames': n_frames,
                      'seconds': round(len(wav) / SR, 3),
                      'durSource': built['durSource'],
                      'varSource': built['varSource'],
                      'pitchSource': built['pitchSource'],
                      'warnings': built['warnings']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()[-1500:]}))
