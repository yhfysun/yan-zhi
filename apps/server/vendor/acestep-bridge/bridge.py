#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ACE-Step 本地写歌桥（yan-zhi ↔ ACE-Step）

★ 为什么要有这一层（而不是让 Node 每次 spawn 一个进程）：
  模型加载约 40 秒。若每次生成都冷启动，用户每首歌都要多等 40 秒。
  本脚本**常驻**，用 stdin/stdout 的 JSON 行协议收发请求；第二首起就是纯推理时间。

★ 协议（一行一个 JSON）：
  请求  {"id":"1","cmd":"status"}
        {"id":"2","cmd":"generate","lyrics":"...","style":"...","duration":60,"seed":1,"vocal_forward":true}
        {"id":"3","cmd":"unload"}
        {"id":"4","cmd":"shutdown"}
  响应  {"id":"1","ok":true,"data":{...}}
        {"id":"2","ok":false,"error":"..."}
  进度  {"event":"progress","id":"2","stage":"diffuse","progress":0.4,"message":"..."}

★★★ 两个必须在 bridge 里固化的坑（实测踩过，不写死就换台机器复现）：
  1. **VAE 显存塌陷**：6GB 卡上 DiT 吃满 5.6GB → 只剩 0.02GB → ACE-Step 自动把 VAE
     挪到 CPU → **CPU 上 VAE 卷积 20 分钟跑不完**（不是死锁，CPU 时间一直在涨）。
     修法：YZ_FORCE_VAE_GPU=1 绕过判定 + ACESTEP_VAE_DECODE_CHUNK_SIZE=256 分小块。
     改完 VAE 解码 16 秒。这里通过环境变量 + 运行时 monkeypatch 双保险。
  2. **audio_format 默认 mp3 静默丢文件**：`release_task_request_builder.py` 里
     `audio_format` 默认写死 mp3，而本机无 ffmpeg → 保存抛异常，但**任务 status 仍返回 1、
     file 字段为空**（看起来成功，实际零产物）。本脚本直接调 Python API、不走 HTTP，
     并用 flac 落盘，从源头绕开。

★ 模型目录适配：ACE-Step 期望 `<root>/checkpoints/acestep-v15-turbo/`，
  而 yan-zhi 部署的是扁平结构 `<root>/acestep/{turbo,lm,qwen,vae}`。
  启动时按需建软链（Windows 用 junction/复制兜底），不搬动 8.9GB 文件。
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

# ── 环境变量必须在 import torch / acestep **之前**设好 ──────────────
os.environ.setdefault("PYTHONUNBUFFERED", "1")
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_OFFLINE", "1")          # 模型已在盘上，禁止联网探测
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
# ★ 坑 1：强制 VAE 留在 GPU（本脚本会 monkeypatch 兜底，这里是第一道）
os.environ.setdefault("YZ_FORCE_VAE_GPU", "1")
os.environ.setdefault("ACESTEP_VAE_DECODE_CHUNK_SIZE", "256")
# 6GB 卡：不开思考模式、batch=1
os.environ.setdefault("ACESTEP_NO_INIT", "1")


def log(msg: str) -> None:
    """诊断信息走 stderr —— stdout 只放协议 JSON，绝不能污染。"""
    print(f"[bridge] {msg}", file=sys.stderr, flush=True)


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def emit_progress(req_id: str, stage: str, progress: float, message: str = "") -> None:
    emit({"event": "progress", "id": req_id, "stage": stage,
          "progress": round(max(0.0, min(1.0, progress)), 3), "message": message})


# ─────────────────────────────────────────────────────────────
# 目录定位：接受 YZ_ACESTEP_ROOT（扁平结构），适配成 ACE-Step 期望的 checkpoints
# ─────────────────────────────────────────────────────────────
def resolve_paths() -> tuple[Path, Path]:
    """返回 (repo_dir, checkpoints_dir)。"""
    root = os.environ.get("YZ_ACESTEP_ROOT")
    if not root:
        raise RuntimeError("缺少环境变量 YZ_ACESTEP_ROOT")
    rootp = Path(root).resolve()
    repo = rootp / "ACE-Step-1.5"
    if not repo.is_dir():
        # 也允许直接把 repo 指过来
        if (rootp / "acestep").is_dir() and (rootp / "cli.py").is_file():
            repo = rootp
        else:
            raise RuntimeError(f"ACE-Step 源码目录不存在：{repo}")
    return repo, rootp


# 扁平名 → ACE-Step 规范名
FLAT_TO_CANON = {
    "turbo": "acestep-v15-turbo",
    "lm": "acestep-5Hz-lm-1.7B",
    "qwen": "Qwen3-Embedding-0.6B",
    "vae": "vae",
}


def ensure_checkpoints_layout(root: Path) -> Path:
    """把扁平的 {turbo,lm,qwen,vae} 映射成 checkpoints/<规范名>。

    ★ 不复制 8.9GB：优先建目录联接（Windows junction / POSIX symlink），
      失败才退化为复制（并打印警告，让用户知道占了双份空间）。
    """
    ckpt = root / "checkpoints"
    ckpt.mkdir(parents=True, exist_ok=True)
    for flat, canon in FLAT_TO_CANON.items():
        src = root / flat
        dst = ckpt / canon
        if not src.is_dir():
            continue
        if dst.exists():
            continue
        try:
            # Windows 上 os.symlink 需要管理员或开发者模式；junction 更稳
            if os.name == "nt":
                import _winapi
                _winapi.CreateJunction(str(src), str(dst))
            else:
                os.symlink(src, dst, target_is_directory=True)
            log(f"已建立映射 {flat} -> checkpoints/{canon}")
        except Exception as e:  # noqa: BLE001
            log(f"建立映射失败（{e}），改为复制 {flat} -> {canon}（会占双份空间）")
            import shutil
            shutil.copytree(src, dst)

    # ★ VAE 文件名适配（实测踩过）：
    #   diffusers 的 from_pretrained 默认找 `diffusion_pytorch_model.bin/.safetensors`，
    #   而 ACE-Step 官方权重文件名是 `model.safetensors` → 报
    #   `OSError: Error no file named diffusion_pytorch_model.bin found in directory .../vae`，
    #   表现为 `Model not fully initialized`（模型"加载成功"但一生成就失败）。
    #   用硬链接补一个兼容名：不占空间（同一 inode）。
    vae_dir = ckpt / "vae"
    for want in ("diffusion_pytorch_model.safetensors", "diffusion_pytorch_model.bin"):
        alias = vae_dir / want
        src_file = vae_dir / "model.safetensors"
        if alias.exists() or not src_file.is_file():
            continue
        try:
            os.link(src_file, alias)   # 硬链接
            log(f"VAE 兼容名已建：{want}（硬链接）")
            break
        except OSError:
            try:
                import shutil
                shutil.copyfile(src_file, alias)
                log(f"VAE 兼容名已建：{want}（复制，占双份空间）")
                break
            except OSError as e:
                log(f"VAE 兼容名建立失败：{e}")
    return ckpt


# ─────────────────────────────────────────────────────────────
# 引擎：懒加载 + 单例
# ─────────────────────────────────────────────────────────────
class Engine:
    def __init__(self) -> None:
        self.repo, self.root = resolve_paths()
        self.ckpt = ensure_checkpoints_layout(self.root)
        # 让 ACE-Step 的 get_project_root() 指向这里
        os.environ["ACESTEP_PROJECT_ROOT"] = str(self.root)
        sys.path.insert(0, str(self.repo))
        self._patcher = None
        self._service = None
        self.loaded = False
        self.dit_model = os.environ.get("YZ_ACESTEP_DIT", "acestep-v15-turbo")
        self.lm_model = os.environ.get("YZ_ACESTEP_LM", "acestep-5Hz-lm-1.7B")

    # ---- 坑 1 的运行时兜底：不依赖上游是否认 YZ_FORCE_VAE_GPU ----
    def _patch_vae_cpu_decision(self) -> None:
        try:
            from acestep.core.generation.handler import generate_music_decode as mod

            src = Path(mod.__file__).read_text(encoding="utf-8")
            if "YZ_FORCE_VAE_GPU" in src:
                log("上游已含 YZ_FORCE_VAE_GPU 开关，跳过补丁")
                return

            # 上游没有该开关 → 运行时替换判定：坚决不把 VAE 挪到 CPU
            orig = mod._decode_generate_music_pred_latents

            def wrapped(self, *a, **kw):  # noqa: ANN001
                import torch
                # 记录原始方法内联逻辑无法局部改写，改为：强制让"剩余显存"看起来充足
                # 这比改上游源码更安全（不落盘、不破坏包完整性）
                return orig(self, *a, **kw)

            # 更直接：临时把判定函数替换成「永远返回充足」
            try:
                from acestep.gpu_config import get_effective_free_vram_gb
                mod.get_effective_free_vram_gb = lambda *a, **kw: 8.0
                log("已替换 get_effective_free_vram_gb → 8.0（阻止 VAE 降级到 CPU）")
            except Exception as e:  # noqa: BLE001
                log(f"替换显存判定失败：{e}")
            self._patcher = True
        except Exception as e:  # noqa: BLE001
            log(f"VAE 补丁注入失败（不致命，可能走 CPU 慢路径）：{e}")

    def load(self, progress=None) -> None:
        if self.loaded:
            return
        if progress:
            progress("init", 0.05, "加载 ACE-Step 运行时…")

        self._patch_vae_cpu_decision()

        import torch  # noqa: F401  确认可用
        from acestep.handler import AceStepHandler  # type: ignore

        if progress:
            progress("init", 0.2, f"加载 DiT（{self.dit_model}）…")
        h = AceStepHandler()
        # ★ 真实签名（核对自 init_service_orchestrator.py:48）：
        #   initialize_service(project_root, config_path, device, use_flash_attention,
        #                      compile_model, offload_to_cpu, offload_dit_to_cpu,
        #                      quantization, prefer_source, use_mlx_dit, vae_checkpoint)
        #   没有 dit_model / lm_model / init_llm —— 模型选择靠 config_path（目录名）
        h.initialize_service(
            project_root=str(self.root),
            config_path=self.dit_model,      # 'acestep-v15-turbo'
            device="cuda",
            offload_to_cpu=False,            # 6GB 够用（DiT 4.5GB + VAE 0.3GB）
            use_flash_attention=False,       # 未装 flash-attn，别开
            compile_model=False,
        )
        self._service = h
        self.loaded = True
        if progress:
            progress("init", 1.0, "模型就绪")

    def status(self) -> dict:
        import torch
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        total = 0.0
        if dev == "cuda":
            total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        # 检查权重齐全（★ vae 的真实文件名是 model.safetensors，
        #   不是 diffusers 惯例的 diffusion_pytorch_model.safetensors —— 实测踩过）
        need = {
            "turbo": self.ckpt / "acestep-v15-turbo" / "model.safetensors",
            "vae": self.ckpt / "vae" / "model.safetensors",
            "qwen": self.ckpt / "Qwen3-Embedding-0.6B" / "model.safetensors",
        }
        weights = {k: v.is_file() for k, v in need.items()}
        return {
            "device": dev,
            "vramGB": round(total, 1),
            "loaded": self.loaded,
            "weights": weights,
            "weightsComplete": all(weights.values()),
            "root": str(self.root),
        }

    def generate(self, req: dict, req_id: str) -> dict:
        self.load(lambda stage, p, m: emit_progress(req_id, stage, p, m))

        lyrics = (req.get("lyrics") or "").strip()
        style = (req.get("style") or "").strip()
        duration = float(req.get("duration") or 60)
        duration = max(10.0, min(240.0, duration))
        seed = req.get("seed")
        vocal_forward = bool(req.get("vocal_forward", True))

        if not lyrics:
            raise ValueError("lyrics 必填")

        # ★ 提示词模板固化在这里，不让模型自由发挥 —— 实测提示词含糊时
        #   1-3kHz 人声频段只占 1.2%（几乎听不出唱），明确 vocal-forward 后升到 6%+。
        if vocal_forward:
            prompt = (
                "Clear lead vocal forward, mandarin pop. The vocal is close-mic, dry, loud and dominant, "
                "sitting well above a sparse accompaniment. Minimal instruments, no heavy bass, "
                "nothing competing with the voice. Karaoke-style vocal prominence."
            )
            if style:
                prompt = f"{style.strip()}. " + prompt
        else:
            prompt = style or "mandarin pop, balanced mix"

        emit_progress(req_id, "encoding", 0.1, "编码歌词与风格…")

        import soundfile as sf

        out_dir = Path(os.environ.get("YZ_ACESTEP_OUT", self.root / "out"))
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"ace_{req_id}_{int(time.time())}.flac"

        t0 = time.time()
        emit_progress(req_id, "diffuse", 0.25, f"生成 {int(duration)} 秒音频（DiT）…")

        # ★ 真实参数名是 captions（不是 prompt）—— 核对自 generate_music.py:195
        params = {
            "captions": prompt,
            "lyrics": lyrics,
            "vocal_language": req.get("vocal_language") or "zh",
            "audio_duration": duration,
            "batch_size": 1,          # ★ 6GB 必须 1
            "inference_steps": int(req.get("inference_steps") or 8),
            "guidance_scale": float(req.get("guidance_scale") or 8.0),
            "use_random_seed": seed is None,
            "seed": int(seed) if seed is not None else -1,
            "task_type": "text2music",
            "use_tiled_decode": True,
        }
        result = self._service.generate_music(**params)

        if not result.get("success", False):
            raise RuntimeError(result.get("status_message") or result.get("error") or "生成失败")

        emit_progress(req_id, "decode", 0.75, "VAE 解码…")
        audios = result.get("audios") or []
        if not audios:
            raise RuntimeError("生成结果为空")
        # ★ 真实结构：[{"tensor": torch.Tensor, "sample_rate": int}]（generate_music_payload.py:66）
        first = audios[0]
        if isinstance(first, dict):
            sr = int(first.get("sample_rate") or 48000)
            data = first.get("tensor")
            if hasattr(data, "detach"):
                data = data.detach().float().cpu().numpy()
            # [C, N] → [N, C]（soundfile 要 frames×channels）
            if hasattr(data, "ndim") and data.ndim == 2 and data.shape[0] <= 2 and data.shape[0] < data.shape[1]:
                data = data.T
        elif isinstance(first, tuple) and len(first) == 2:
            sr, data = first
        else:
            sr, data = 48000, first

        sf.write(str(out_file), data, sr, format="FLAC")
        emit_progress(req_id, "done", 1.0, "完成")

        n = len(data) if hasattr(data, "__len__") else 0
        return {
            "file": str(out_file),
            "duration": round(n / sr, 2) if n else duration,
            "sampleRate": int(sr),
            "seed": params["seed"],
            "elapsedSec": round(time.time() - t0, 1),
            "prompt": prompt,
        }

    def unload(self) -> dict:
        if not self.loaded:
            return {"unloaded": False, "reason": "未加载"}
        try:
            import torch
            self._service = None
            self.loaded = False
            torch.cuda.empty_cache()
        except Exception as e:  # noqa: BLE001
            return {"unloaded": False, "error": str(e)}
        return {"unloaded": True}


def main() -> None:
    eng: Engine | None = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:  # noqa: BLE001
            emit({"ok": False, "error": f"JSON 解析失败：{e}"})
            continue

        req_id = str(req.get("id") or "")
        cmd = req.get("cmd") or "status"

        try:
            if cmd == "shutdown":
                emit({"id": req_id, "ok": True, "data": {"bye": True}})
                return
            if cmd == "ping":
                emit({"id": req_id, "ok": True, "data": {"pong": True}})
                continue
            if eng is None:
                eng = Engine()
            if cmd == "status":
                emit({"id": req_id, "ok": True, "data": eng.status()})
            elif cmd == "generate":
                data = eng.generate(req, req_id)
                emit({"id": req_id, "ok": True, "data": data})
            elif cmd == "unload":
                emit({"id": req_id, "ok": True, "data": eng.unload()})
            else:
                emit({"id": req_id, "ok": False, "error": f"未知 cmd：{cmd}"})
        except Exception as e:  # noqa: BLE001
            log(traceback.format_exc())
            emit({"id": req_id, "ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
