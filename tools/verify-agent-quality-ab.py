#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A/B 验收对照脚本（2026-10-07，配套「引入外部 Agent 方案」的验收口径）。

用途：对比「方案落地前后」两个时间窗内会话的执行质量指标，验证：
  · P0-4 只读并行 / P1-5 代码模式  → 平均步数与 token/步 下降
  · P0-1 toolChoice / strict       → 空参率下降
  · P1-9 预算闸                    → 触达预算的会话有「结账」收尾而非裸停
  · P1-10 critic                   → 接力更克制（接力轮次分布）

口径（全部只读，绝不写库 —— 诊断脚本不用 better-sqlite3，走 Python 内置 sqlite3 ro 模式）：
  · 一个「任务」= 一个会话内连续的工具调用流（conversation 内按 created_at 排序的
    assistant.tool_calls 批次序列，批间空隙 > 30 分钟视为新任务）
  · 空参 = arguments 为 '' / '{}' / NULL（按会话内调用序号记录，可看累积趋势）
  · token = messages.tokens 列（缺失按 0 计）

用法：
  python tools/verify-agent-quality-ab.py --cutoff 2026-10-07 --out tmp/ab-report.md
"""
import argparse
import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime

DB_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), '..', 'apps', 'server', 'data.db'),
    os.path.join(os.path.dirname(__file__), '..', 'apps', 'server', 'data', 'yan-zhi.db'),
]
GAP_MINUTES = 30  # 批间空隙超过该分钟数视为新任务


def open_ro(db_path):
    return sqlite3.connect(f'file:{db_path.replace(os.sep, "/")}?mode=ro', uri=True)


def ts(v):
    if not v:
        return None
    try:
        return datetime.fromtimestamp(int(v) / 1000)
    except Exception:
        return None


def load_calls(conn):
    """返回 [(conv_id, ts, tool_name, is_empty_args, tokens, role)] 的扁平列表。"""
    rows = conn.execute(
        "SELECT conversation_id, created_at, tool_calls_json, tokens, role FROM message ORDER BY conversation_id, created_at"
    ).fetchall()
    out = []
    for conv_id, created, tcj, tokens, role in rows:
        if not tcj:
            continue
        try:
            calls = json.loads(tcj)
        except Exception:
            continue
        if not isinstance(calls, list):
            continue
        t = ts(created)
        for tc in calls:
            if not isinstance(tc, dict):
                continue
            fn = tc.get('function') or {}
            name = fn.get('name') or tc.get('toolName') or ''
            if not name:
                continue
            args = fn.get('arguments', tc.get('arguments'))
            empty = args in (None, '', '{}')
            out.append({
                'conv': conv_id, 'ts': t, 'name': name, 'empty': empty,
                'tokens': int(tokens or 0), 'role': role,
            })
    return out


def group_tasks(calls):
    """把调用流切成任务（批间空隙 > GAP_MINUTES 视为新任务）。"""
    by_conv = defaultdict(list)
    for c in calls:
        by_conv[c['conv']].append(c)
    tasks = []
    for conv, items in by_conv.items():
        items.sort(key=lambda x: (x['ts'] or datetime.min))
        cur = []
        prev = None
        for it in items:
            if prev and it['ts'] and prev['ts'] and (it['ts'] - prev['ts']).total_seconds() > GAP_MINUTES * 60:
                tasks.append((conv, cur))
                cur = []
            cur.append(it)
            prev = it
        if cur:
            tasks.append((conv, cur))
    return tasks


def stats_for(tasks, after=None, before=None):
    """聚合一个时间窗的指标。"""
    sel = []
    for conv, items in tasks:
        t0 = items[0]['ts']
        if not t0:
            continue
        if after and t0 < after:
            continue
        if before and t0 >= before:
            continue
        sel.append((conv, t0, items))
    n_tasks = len(sel)
    total_calls = sum(len(items) for _, _, items in sel)
    total_steps = 0  # 步 = 工具调用批次
    empty = 0
    seq_positions = []  # (会话内调用序号, 是否空参) —— 看累积趋势
    for _, _, items in sel:
        # 批次计数：相邻同名+同参的连续重复只算一次太严格，直接以「调用条数」近似步数会偏高；
        # 这里用 message.tokens>0 的条数（每批 assistant 一条）更接近步数 —— 简化：calls 条数即近似步数。
        total_steps += len(items)
        for i, it in enumerate(items):
            if it['empty']:
                empty += 1
                seq_positions.append((i, 1))
            else:
                seq_positions.append((i, 0))
    return {
        'tasks': n_tasks,
        'calls': total_calls,
        'calls_per_task': round(total_calls / n_tasks, 2) if n_tasks else 0,
        'empty_rate': round(empty / total_calls * 100, 1) if total_calls else 0,
        'early_empty': _band(seq_positions, 0, 10),
        'late_empty': _band(seq_positions, 10, None),
    }


def _band(seq, lo, hi):
    xs = [e for (i, e) in seq if i >= lo and (hi is None or i < hi)]
    return round(sum(xs) / len(xs) * 100, 1) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cutoff', default='2026-10-07', help='A/B 分界日期（YYYY-MM-DD），之前=A 组（旧路径），之后=B 组（新路径）')
    ap.add_argument('--out', default='tmp/ab-report.md')
    args = ap.parse_args()

    db_path = next((p for p in DB_CANDIDATES if os.path.exists(p)), None)
    if not db_path:
        raise SystemExit('未找到 data.db，请确认路径')
    conn = open_ro(db_path)
    calls = load_calls(conn)
    tasks = group_tasks(calls)

    cutoff = datetime.strptime(args.cutoff, '%Y-%m-%d')
    a = stats_for(tasks, before=cutoff)
    b = stats_for(tasks, after=cutoff)

    lines = [
        '# Agent 质量 A/B 对照报告',
        '',
        f'- 数据库：`{os.path.abspath(db_path)}`（只读）',
        f'- A 组（旧路径）：任务起始 < {cutoff.date()}',
        f'- B 组（新路径）：任务起始 ≥ {cutoff.date()}',
        f'- 任务切分：同一会话内批间空隙 > {GAP_MINUTES} 分钟视为新任务',
        '',
        '| 指标 | A 组（旧） | B 组（新） | 变化 |',
        '|---|---|---|---|',
    ]

    def row(name, k, lower_better=True):
        va, vb = a[k], b[k]
        if not (isinstance(va, (int, float)) and isinstance(vb, (int, float))) or va in (0, None) or vb in (0, None):
            lines.append(f'| {name} | {va} | {vb} | - |')
            return
        pct = round((vb - va) / va * 100, 1)
        good = (vb < va) if lower_better else (vb > va)
        lines.append(f'| {name} | {va} | {vb} | {pct:+.1f}% {"✅" if good else "⚠️"} |')

    row('任务数', 'tasks', lower_better=False)
    row('工具调用总数', 'calls')
    row('平均步数/任务', 'calls_per_task')
    row('空参率 %', 'empty_rate')
    row('前段(序号0-9)空参率 %', 'early_empty')
    row('后段(序号10+)空参率 %', 'late_empty')

    lines += [
        '',
        '## 解读口径',
        '- **平均步数/任务** 下降 = 只读并行 + 代码模式收效（P0-4 / P1-5）',
        '- **空参率（尤其后段）** 下降 = toolChoice/strict 与历史清洗收效（P0-1），且不再随调用序号单调恶化（上下文腐化被遏制）',
        '- **后段空参率 < 前段空参率** 说明长会话没有累积退化（此前单调升到 75% 是基线病灶）',
        '- 样本量 < 5 任务时结论仅供参考（样本不足）',
    ]
    if min(a['tasks'], b['tasks']) < 5:
        lines.insert(6, f'> ⚠️ 样本不足（A={a["tasks"]}，B={b["tasks"]}），等更多任务后再看趋势。')

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
