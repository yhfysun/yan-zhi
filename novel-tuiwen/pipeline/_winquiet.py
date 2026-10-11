# -*- coding: utf-8 -*-
"""Windows 子进程静默运行 —— 防止 ffmpeg / ffprobe / python 子进程弹黑框。

背景（2026-10-09 用户实报「C:\\APP\\EVCapture\\ffmpeg.exe 黑框一直闪」）：
本脚本链由 yan-zhi 的 python_exec 启动，父进程由 Node 以 windowsHide 创建、**本身没有控制台**。
但 Windows 的 CreateProcess 在「无控制台的父进程」下创建**控制台型 exe** 时，
默认会**新分配一个控制台窗口** → 每次 subprocess 调用都闪一下黑框；
ffprobe 逐段探测 + ffmpeg 多趟合成（本项目 10+ 处）就表现为「一直闪」。

修法：对所有子进程统一带上
  · CREATE_NO_WINDOW      —— 不分配控制台
  · STARTF_USESHOWWINDOW + SW_HIDE —— 双保险
★ 放在**公共模块**里一次性生效，而不是逐个 subprocess.run 手写参数：
  本项目 subprocess 调用点有 10+ 处，手写必然漏（漏一处就闪一处，且**不报错**，只能靠肉眼发现）。

用法（在被执行的脚本顶部，紧跟 import 之后）：
    import _winquiet          # noqa: F401
    _winquiet.apply_popen_defaults()
非 Windows 平台本模块是空操作，可安全全局引入。
"""
import subprocess
import sys

IS_WIN = sys.platform == 'win32'

# CREATE_NO_WINDOW：不为子进程创建控制台窗口
CREATE_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
_CREATIONFLAGS = CREATE_NO_WINDOW if IS_WIN else 0


def _hidden_startupinfo():
    """STARTUPINFO 把窗口显示方式设为 SW_HIDE（仅 Windows 有该结构与常量）。"""
    if not IS_WIN:
        return None
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = subprocess.SW_HIDE
    return si


#: 可直接展开进 subprocess.run / Popen 的调用参数（非 Windows 为空 dict）
CALL_KW = ({'creationflags': _CREATIONFLAGS, 'startupinfo': _hidden_startupinfo()}
           if IS_WIN else {})


def apply_popen_defaults():
    """给 subprocess.Popen 打上默认静默参数 —— subprocess.run/check_call/check_output 全都走它。

    比逐个调用点传 CALL_KW 更可靠：**调用点以后新增也不会漏**（新增一处 subprocess.run
    不会有人记得补参数，这正是"静默失效"的典型形态）。
    幂等：重复调用只打一次补丁。
    """
    if not IS_WIN:
        return
    if getattr(subprocess.Popen, '_yz_quiet_patched', False):
        return
    _orig_init = subprocess.Popen.__init__

    def _patched(self, *args, **kwargs):  # noqa: ANN001
        kwargs.setdefault('creationflags', _CREATIONFLAGS)
        if kwargs.get('startupinfo') is None:
            kwargs['startupinfo'] = _hidden_startupinfo()
        return _orig_init(self, *args, **kwargs)

    subprocess.Popen.__init__ = _patched
    subprocess.Popen._yz_quiet_patched = True


def run_quiet(cmd, **kwargs):
    """subprocess.run 的静默版（想显式表达"这是静默调用"时用）。"""
    for k, v in CALL_KW.items():
        kwargs.setdefault(k, v)
    return subprocess.run(cmd, **kwargs)