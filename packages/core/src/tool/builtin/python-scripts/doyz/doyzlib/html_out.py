"""doyz -> 自包含 HTML（Word 版式预览 + 图表编辑器），可选本地服务。"""

from __future__ import annotations

import html
import json
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import docx_out, model, pptx_out, xlsx_out

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "assets")

MIME = {"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


def _read(name: str) -> str:
    with open(os.path.join(ASSETS, name), "r", encoding="utf-8") as f:
        return f.read()


def build_html(doc_data: dict, serve: bool = False) -> str:
    css = _read("editor.css")
    js = _read("editor.js")
    title = str((doc_data.get("meta") or {}).get("title") or "doyz 文档")
    payload = json.dumps(doc_data, ensure_ascii=False).replace("</", "<\\/")
    kind = doc_data.get("kind", "document")

    btn = []
    if kind == "document":
        btn.append('<button class="primary serve-only" id="exp-docx-native">导出 Word（原生图表）</button>')
        btn.append('<button class="serve-only" id="exp-docx-image">导出 Word（图表为图片）</button>')
        btn.append('<button class="serve-only" id="exp-xlsx">导出 Excel</button>')
    elif kind == "presentation":
        btn.append('<button class="primary serve-only" id="exp-pptx-native">导出 PPT（原生图表）</button>')
        btn.append('<button class="serve-only" id="exp-pptx-image">导出 PPT（图表为图片）</button>')
    else:
        btn.append('<button class="primary serve-only" id="exp-xlsx">导出 Excel</button>')

    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<style>%s</style>
</head>
<body>
<div class="toolbar">
  <span class="brand">DOYZ</span>
  <button id="toggle-edit">编辑内容</button>
  <button id="save">保存 .doyz</button>
  %s
  <span class="hint">图表：双击或「编辑数据」可改数据与类型 · 类型：%s</span>
</div>
<div id="doc"></div>
<div id="modal" class="modal"></div>
<div id="toast" class="toast"></div>
<script>window.__DOYZ__ = JSON.parse(%s);window.__DOYZ_SERVE__ = %s;</script>
<script>%s</script>
</body>
</html>
""" % (html.escape(title), css, "\n  ".join(btn), kind,
       json.dumps(payload), "true" if serve else "false", js)


def render(doc_data: dict, out_path: str, serve: bool = False) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(build_html(doc_data, serve))
    return out_path


# ------------------------------------------------------------------ 本地服务

class _State:
    doc = None
    src_path = None
    out_dir = None


def _do_export(doc_data, target, chart_mode, name, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ext = target
    safe = "".join(c for c in (name or "export") if c not in '\\/:*?"<>|').strip() or "export"
    suffix = "" if chart_mode == "native" else "_图片图表"
    out = os.path.join(out_dir, "%s%s.%s" % (safe, suffix, ext))
    mod = {"docx": docx_out, "pptx": pptx_out, "xlsx": xlsx_out}[target]
    mod.export(doc_data, out, chart_mode)
    return out


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/quit"):
            self._json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        body = build_html(_State.doc, True).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n).decode("utf-8")
        try:
            payload = json.loads(raw)
        except Exception:
            return self._json({"ok": False, "error": "bad json"}, 400)

        if self.path == "/api/save":
            try:
                doc = payload["doc"]
                model.validate(doc)
                _State.doc = doc
                if _State.src_path:
                    model.save(doc, _State.src_path)
                return self._json({"ok": True, "path": _State.src_path})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)

        if self.path == "/api/export":
            try:
                doc = payload["doc"]
                model.validate(doc)
                _State.doc = doc
                target = payload.get("target", "docx")
                mode = payload.get("chartMode", "native")
                name = payload.get("name") or ((doc.get("meta") or {}).get("title") or "export")
                out = _do_export(doc, target, mode, name,
                                 _State.out_dir or os.path.dirname(_State.src_path or ".") or ".")
                with open(out, "rb") as f:
                    data = f.read()
                fname = os.path.basename(out)
                self.send_response(200)
                self.send_header("Content-Type", MIME.get(target, "application/octet-stream"))
                self.send_header("Content-Disposition",
                                 "attachment; filename*=UTF-8''%s" %
                                 _urlquote(fname))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        return self._json({"ok": False, "error": "not found"}, 404)


def _urlquote(s):
    from urllib.parse import quote
    return quote(s)


def serve(doc_data: dict, src_path: str, port: int = 8777, out_dir: str = None,
          open_browser: bool = True) -> str:
    _State.doc = doc_data
    _State.src_path = src_path
    _State.out_dir = out_dir
    srv = ThreadingHTTPServer(("127.0.0.1", port), _Handler)
    url = "http://127.0.0.1:%d/" % port
    if open_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    print("doyz 编辑器已启动: %s  (Ctrl+C 结束)" % url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return url
