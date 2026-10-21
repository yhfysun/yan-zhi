# Third-party notice

`infer.py`, `inference/`, `utils/`, `configs/`, `usr/` and `settings.yaml` are vendored from
https://github.com/HighCWu/DiffSinger-ONNX-Infer (MIT License, see LICENSE).

`bridge.py` is part of this application (stdin JSON → DiffSinger ONNX inference → WAV).

The model weights are **not** vendored; they are downloaded on demand and are trained on the
Opencpop dataset. Confirm the dataset/model license before commercial use.
