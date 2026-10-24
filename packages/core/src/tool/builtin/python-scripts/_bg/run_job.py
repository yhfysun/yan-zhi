# -*- coding: utf-8 -*-
"""后台作业启动器 / 看护进程（python_exec background=true 的底座）。

用法（由 python-runtime 调用，不直接面向模型）：
    python run_job.py --job-dir <dir> [--cwd <dir>] -- <python> <script.py> [args...]

为什么两段式（2026-10-24 用户实报「每次调用都被 30 秒超时截断，ffmpeg 中途被杀」）：
    工具层的 shell.exec 有超时，到点按进程树 taskkill —— 前台跑 81s 的渲染必死在半路，
    产出缺 moov 的坏 mp4。这里把「启动」和「干活」拆开：
      ① 前台段（不带 --detached）：只写 status.json(starting) → 以 DETACHED 方式重启自己 →
         立刻退出。shell.exec 秒级返回，杀不到真正的渲染进程。
      ② 后台段（--detached）：把目标命令跑起来，stdout/stderr 全部落 stdout.log，
         结束把 state=completed/failed + exitCode + 耗时写回 status.json。
    调用方（job_status 工具）只读 status.json + 日志尾部，不再依赖单次工具调用的存活。
"""
import json
import os
import subprocess
import sys
import time

# Windows：DETACHED_PROCESS(0x8) 脱离父进程控制台 → 父进程退出/被杀都不影响；
# CREATE_NEW_PROCESS_GROUP(0x200) 与 CREATE_NO_WINDOW(0x08000000) 保证不弹黑框。
_WIN_DETACHED = 0x00000008 | 0x00000200 | 0x08000000


def _write_status(path: str, data: dict) -> None:
    """status.json 原子写：先写临时文件再 replace，轮询方不会读到半截 JSON。"""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _spawn_detached(argv, cwd, out_path: str):
    """脱离父进程启动 argv，stdout/stderr 合并写入 out_path（追加）。"""
    out = open(out_path, "ab")
    kw = dict(
        cwd=cwd or None,
        env=os.environ.copy(),
        stdin=subprocess.DEVNULL,
        stdout=out,
        stderr=subprocess.STDOUT,
        close_fds=True,
    )
    if os.name == "nt":
        return subprocess.Popen(argv, creationflags=_WIN_DETACHED, **kw)
    return subprocess.Popen(argv, start_new_session=True, **kw)


def main() -> int:
    av = sys.argv[1:]
    if "--" not in av:
        print("run_job.py: 缺少 '--' 与目标命令", file=sys.stderr)
        return 2
    cut = av.index("--")
    head, cmd = av[:cut], av[cut + 1:]
    if not cmd:
        print("run_job.py: '--' 后没有目标命令", file=sys.stderr)
        return 2

    # 手工解析头部：目标命令自身可能带 --foo，不能交给 argparse 吞。
    job_dir = ""
    cwd = ""
    detached = False
    i = 0
    while i < len(head):
        k = head[i]
        if k == "--job-dir" and i + 1 < len(head):
            job_dir = head[i + 1]
            i += 2
        elif k == "--cwd" and i + 1 < len(head):
            cwd = head[i + 1]
            i += 2
        elif k == "--detached":
            detached = True
            i += 1
        else:
            print(f"run_job.py: 未知参数 {k}", file=sys.stderr)
            return 2
    if not job_dir:
        print("run_job.py: 缺少 --job-dir", file=sys.stderr)
        return 2

    os.makedirs(job_dir, exist_ok=True)
    status_path = os.path.join(job_dir, "status.json")
    log_path = os.path.join(job_dir, "stdout.log")
    now = time.time()

    if not detached:
        # ---- ① 前台段：登记 starting → 重启自己到后台 → 立即返回 ----
        _write_status(status_path, {
            "state": "starting",
            "jobDir": job_dir,
            "logPath": log_path,
            "launchedAt": now,
            "launchedAtText": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
            "cmd": cmd,
        })
        try:
            p = _spawn_detached(
                [sys.executable, os.path.abspath(__file__),
                 "--job-dir", job_dir, "--cwd", cwd, "--detached", "--"] + cmd,
                job_dir, log_path,
            )
        except Exception as e:  # noqa: BLE001 - 启动失败必须落在 status 上，别只丢 stderr
            _write_status(status_path, {
                "state": "failed",
                "jobDir": job_dir,
                "logPath": log_path,
                "launchedAt": now,
                "finishedAt": time.time(),
                "exitCode": 1,
                "error": f"后台启动失败: {e}",
            })
            print(f"后台启动失败: {e}", file=sys.stderr)
            return 1
        print(json.dumps({"jobDir": job_dir, "launcherPid": p.pid, "logPath": log_path},
                         ensure_ascii=False))
        return 0

    # ---- ② 后台段：真正跑目标命令，并把结束状态写回 ----
    _write_status(status_path, {
        "state": "running",
        "jobDir": job_dir,
        "logPath": log_path,
        "startedAt": now,
        "startedAtText": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "watchdogPid": os.getpid(),
        "cmd": cmd,
    })
    try:
        p = _spawn_detached(cmd, cwd, log_path)
    except Exception as e:  # noqa: BLE001
        _write_status(status_path, {
            "state": "failed",
            "jobDir": job_dir,
            "logPath": log_path,
            "startedAt": now,
            "finishedAt": time.time(),
            "exitCode": 1,
            "error": f"子进程启动失败: {e}",
        })
        return 1

    _write_status(status_path, {
        "state": "running",
        "jobDir": job_dir,
        "logPath": log_path,
        "startedAt": now,
        "startedAtText": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "watchdogPid": os.getpid(),
        "pid": p.pid,
        "cmd": cmd,
    })

    rc = p.wait()
    end = time.time()
    _write_status(status_path, {
        "state": "completed" if rc == 0 else "failed",
        "jobDir": job_dir,
        "logPath": log_path,
        "startedAt": now,
        "startedAtText": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "finishedAt": end,
        "finishedAtText": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(end)),
        "elapsedSec": round(end - now, 1),
        "exitCode": rc,
        "watchdogPid": os.getpid(),
        "pid": p.pid,
        "cmd": cmd,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
