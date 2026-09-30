#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""空参污染源「增强」诊断 —— 精确判定 + 修复前后对比。

相比 diag_empty_args.py 的三点改进：
  ① **自动从源码抽取工具 required** → 只把"声明了必填参数却传空"算作真空参，
     排除 api_space_memory_read / list_sub_agents / browser_screenshot 这类**本就无参**的工具
     （它们会严重污染分母，让空参率虚高）。
  ② **按会话分组**：算每个会话的调用数、空参率、是否随序号单调递增（累积污染判据）。
  ③ **按时间分桶**：结合本地修复提交时间，对比修复前后（累计污染特征是否消失）。

用法:
  python tools/diag_empty_args2.py [--db <path>]
"""
import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILTIN = os.path.join(ROOT, "packages", "core", "src", "tool", "builtin")
API_TOOLS = os.path.join(BUILTIN, "api-tools")

# ── ① 从源码抽取 工具名 → required[] ──
name_re = re.compile(r"name\s*=\s*['\"]([a-zA-Z0-9_\-]+)['\"]")
req_re = re.compile(r"required\s*:\s*\[([^\]]*)\]")
tool_required = {}
if os.path.isdir(BUILTIN):
    for base, _dirs, files in os.walk(BUILTIN):
        for fn in files:
            if not fn.endswith(".ts") or fn.endswith(".test.ts"):
                continue
            try:
                txt = open(os.path.join(base, fn), encoding="utf-8").read()
            except Exception:
                continue
            # 类式：name = 'x' ... inputSchema = {... required:[...]}
            for m in name_re.finditer(txt):
                nm = m.group(1)
                tail = txt[m.start(): m.start() + 4000]
                rq = req_re.search(tail)
                reqs = []
                if rq:
                    reqs = [s.strip().strip("'\"") for s in rq.group(1).split(",") if s.strip()]
                if nm not in tool_required or (not tool_required[nm] and reqs):
                    tool_required[nm] = reqs
            # api 式：{ name: 'api_x', ... required: [...] } 同行
            for m in re.finditer(r"name:\s*['\"]([a-zA-Z0-9_\-]+)['\"][^\n]*?required:\s*\[([^\]]*)\]", txt):
                nm = m.group(1)
                reqs = [s.strip().strip("'\"") for s in m.group(2).split(",") if s.strip()]
                tool_required[nm] = reqs

print(f"[diag] 抽取到 {len(tool_required)} 个工具定义；其中有必填参数 {sum(1 for v in tool_required.values() if v)} 个")

ap = argparse.ArgumentParser()
ap.add_argument("--db", default=os.path.join(os.environ.get("APPDATA", ""), "yan-zhi", "server-data", "data.db"))
args = ap.parse_args()
DB = args.db
if not os.path.exists(DB):
    print("[diag] 库不存在"); sys.exit(1)

con = sqlite3.connect("file:" + DB.replace("\\", "/") + "?mode=ro", uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()


def parse_tc(js):
    if not js:
        return None
    try:
        v = json.loads(js)
        return v if isinstance(v, list) else None
    except Exception:
        return None


def args_of(tc):
    if not isinstance(tc, dict):
        return ""
    fn = tc.get("function")
    if isinstance(fn, dict):
        a = fn.get("arguments")
        if isinstance(a, str):
            return a
        if a is not None:
            return json.dumps(a, ensure_ascii=False)
    a = tc.get("arguments")
    if isinstance(a, str):
        return a
    if a is not None:
        return json.dumps(a, ensure_ascii=False)
    return ""


def is_empty(s):
    return (s or "").strip() in ("", "{}", "null")


def name_of(tc):
    if not isinstance(tc, dict):
        return ""
    fn = tc.get("function") or {}
    return (fn.get("name") or tc.get("toolName") or tc.get("name") or "").strip()


def id_of(tc):
    if not isinstance(tc, dict):
        return ""
    return tc.get("id") or tc.get("tool_call_id") or ""


rows = cur.execute(
    "SELECT id, conversation_id, role, content, reasoning_content, tool_calls_json, created_at "
    "FROM message WHERE tool_calls_json IS NOT NULL AND tool_calls_json != '' AND tool_calls_json != '[]' "
    "ORDER BY conversation_id, created_at, id"
).fetchall()

# ── ② 精确统计 ──
tot = empty = 0
tot_need = empty_need = 0            # 仅"有声明的必填参数"的工具
by_tool = defaultdict(lambda: [0, 0])   # 真空参（有必填）
unknown_tools = defaultdict(int)
empty_meta = {"c0r0": 0, "c0": 0, "r0": 0, "both": 0, "all": 0}  # content/reasoning 空统计
conv_rows = defaultdict(list)          # convId -> [(seq, is_empty_need, ts)]

for r in rows:
    tcs = parse_tc(r["tool_calls_json"])
    if not tcs:
        continue
    for tc in tcs:
        nm = name_of(tc)
        e = is_empty(args_of(tc))
        tot += 1
        if e:
            empty += 1
        reqs = tool_required.get(nm)
        if reqs is None:
            unknown_tools[nm] += 1
            need = True  # 未知工具：保守计入（大概率有参数）
        else:
            need = len(reqs) > 0
        if need:
            tot_need += 1
            if e:
                empty_need += 1
                by_tool[nm][0] += 1
                by_tool[nm][1] += 1
                # 元信息统计
                cl = len(r["content"] or "")
                rl = len(r["reasoning_content"] or "")
                empty_meta["all"] += 1
                if cl == 0 and rl == 0:
                    empty_meta["both"] += 1
                if cl == 0:
                    empty_meta["c0"] += 1
                if rl == 0:
                    empty_meta["r0"] += 1
                if cl == 0 and rl == 0:
                    empty_meta["c0r0"] += 1
        elif reqs is not None:
            by_tool[nm]  # 无参工具，不统计空参
        conv_rows[r["conversation_id"]].append((r["created_at"], nm, e, need))


def pct(a, b):
    return "  n/a" if b == 0 else f"{a / b * 100:.1f}%"


print("\n========== 精确空参率（只算有必填参数的工具）==========")
print(f"全部调用          : {tot}   空参 {empty} ({pct(empty, tot)})   ← 含无参工具，分母被污染")
print(f"有必填参数的调用  : {tot_need}   空参 {empty_need} ({pct(empty_need, tot_need)})   ← 真实空参率")
print(f"\n未知工具（未在源码抽取到定义）: {len(unknown_tools)} 种")
for k, v in sorted(unknown_tools.items(), key=lambda x: -x[1])[:10]:
    print(f"    {k:<40} {v}")

print("\n========== 空参样本的 content / reasoning 长度（判断是否异常路径）==========")
print(f"  空参样本数        : {empty_meta['all']}")
print(f"  content==0        : {empty_meta['c0']}  ({pct(empty_meta['c0'], empty_meta['all'])})")
print(f"  reasoning==0      : {empty_meta['r0']}  ({pct(empty_meta['r0'], empty_meta['all'])})")
print(f"  content==0 且 reasoning==0 : {empty_meta['both']}  ({pct(empty_meta['both'], empty_meta['all'])})")

print("\n========== 按会话：空参率 + 是否随序号累积 ==========")
convs = []
for cid, items in conv_rows.items():
    items.sort(key=lambda x: x[0])
    n = len(items)
    ne = sum(1 for _, _, e, need in items if need and e)
    nn = sum(1 for _, _, _, need in items if need)
    # 前 1/3 与后 1/3 的空参率（有必填参数的子集）
    sub = [e for _, _, e, need in items if need]
    third = max(1, len(sub) // 3)
    head = sub[:third]
    tail = sub[-third:]
    hr = sum(head) / len(head) if head else 0
    tr = sum(tail) / len(tail) if tail else 0
    ts = max(x[0] for x in items)
    convs.append((ts, cid, n, nn, ne, hr, tr))

convs.sort(key=lambda x: x[0])
print(f"{'会话':<10} {'时间':<20} {'调用':>5} {'有必填':>6} {'空参':>5} {'空参率':>7} {'前1/3':>7} {'后1/3':>7}  趋势")
for ts, cid, n, nn, ne, hr, tr in convs[-25:]:
    import datetime
    d = datetime.datetime.fromtimestamp(ts / 1000).strftime("%m-%d %H:%M")
    trend = "↑累积" if tr > hr + 0.1 else ("↓改善" if hr > tr + 0.1 else "持平")
    print(f"{str(cid)[:8]:<10} {d:<20} {n:>5} {nn:>6} {ne:>5} {pct(ne, nn):>7} {hr*100:>6.0f}% {tr*100:>6.0f}%  {trend}")

# ── ③ 时间分桶：修复前 vs 修复后 ──
print("\n========== 按消息时间分桶（看退化特征是否消失）==========")
buckets = defaultdict(lambda: [0, 0])
for cid, items in conv_rows.items():
    for ts, nm, e, need in items:
        if not need:
            continue
        day = ts // 86400000 * 86400000
        buckets[day][0] += 1
        buckets[day][1] += e
import datetime
for day in sorted(buckets):
    t, e = buckets[day]
    d = datetime.datetime.fromtimestamp(day / 1000).strftime("%Y-%m-%d")
    bar = "█" * round(e / t * 40)
    print(f"  {d}  {pct(e, t):>6}  ({e}/{t}) {bar}")

con.close()
print("\n[diag] 完成")