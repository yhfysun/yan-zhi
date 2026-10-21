import os, sys, json, traceback

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'code'))
sys.path.insert(0, os.path.join(ROOT, 'pylibs'))
os.chdir(ROOT)


def main():
    payload = json.load(sys.stdin)
    out = payload.get('out') or os.path.join(ROOT, 'out.wav')
    from utils.hparams import set_hparams, hparams
    set_hparams(os.path.join(ROOT, 'model', 'config.yaml'))
    from infer import Infer
    infer = Infer(hparams)
    wav = infer.infer_once({
        'text': payload['text'],
        'notes': payload['notes'],
        'notes_duration': payload['durations'],
    })
    import soundfile as sf
    sr = int(hparams['audio_sample_rate'])
    sf.write(out, wav, sr)
    print(json.dumps({'ok': True, 'sr': sr, 'seconds': round(len(wav) / sr, 2), 'path': out}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # 把异常回传成 JSON，Node 侧才能给出可读错误
        print(json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()[-1200:]}))
