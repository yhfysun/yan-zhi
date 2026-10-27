// 插件目录互导 lint（mode-pluginization P7）。
//
// 规则：`apps/server/src/plugins/<dir>/**` 里的相对 import 只允许落在
//   ① 本目录内；② 本插件的入口/共享模块（`<owner>.ts` / `<owner>-*.ts`，owner = 目录名或去掉 -tools 的目录名）；
//   ③ 目录外（services/ 等宿主模块）—— 宿主能力另由构建器闸强制走 host-bridge。
// 目录之间互导（`<A>/x.ts → <B>/y.ts`）一律红：那会把 B 的整棵依赖图卷进 A 的插件包，
// 同时让「未选 B 时 A 仍能构建」变成碰运气。
//
// ★ 为什么只判目录、不判入口文件之间的引用：ops-shell.ts → cicd-pipeline.ts、
//   sec-lab-tools → sec-lab-guard.ts 这类共享助手引用是现存设计（打包时按需复制），
//   本 lint 不把它们当违规；真正的边界风险在目录级（新增文件最容易在那里越界）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGINS_ROOT = fileURLToPath(new URL('../src/plugins/', import.meta.url));

interface Edge {
  from: string; // 相对 plugins/ 的 posix 路径
  spec: string; // 原始 import 说明符
  target: string; // 解析后的相对路径（posix，可能带 index）
}

function listTs(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTs(p, base));
    else if (ent.name.endsWith('.ts')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** 不参与扫描的目录：templates/ 是"源码字符串容器"（导出的模板文本），不是插件目录 */
const SKIP_DIRS = new Set(['templates']);

function collectEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const ent of fs.readdirSync(PLUGINS_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
    const dirName = ent.name;
    for (const rel of listTs(path.join(PLUGINS_ROOT, dirName))) {
      const abs = path.join(PLUGINS_ROOT, dirName, rel);
      const src = fs.readFileSync(abs, 'utf8');
      for (const m of src.matchAll(/(?:^\s*(?:import[^'"]*?from|export[^'"]*?from)\s*|import\s*\(\s*|require\s*\(\s*)'([^']+)'/gm)) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(abs), spec);
        const target = path.relative(PLUGINS_ROOT, resolved).split(path.sep).join('/');
        edges.push({ from: `${dirName}/${rel}`, spec, target });
      }
    }
  }
  return edges;
}

/** 目录的 owner 前缀：`sec-lab-tools` 归 `sec-lab`；其余目录归自己 */
function ownerOf(dirName: string): string {
  return dirName.endsWith('-tools') ? dirName.slice(0, -'-tools'.length) : dirName;
}

describe('插件目录互导 lint', () => {
  const edges = collectEdges();

  it('扫描到了插件目录（防止路径写错导致空扫描假绿）', () => {
    expect(edges.length).toBeGreaterThan(20);
  });

  it('目录之间不互相 import', () => {
    const violations = edges.filter(({ from, target }) => {
      if (target.startsWith('..')) return false; // 指向 plugins/ 之外的宿主模块
      const fromDir = from.split('/')[0];
      if (!target.includes('/')) return false; // 目标是 plugins/ 根下的入口文件，另一条规则管
      const targetDir = target.split('/')[0];
      return targetDir !== fromDir;
    });
    expect(
      violations.map((v) => `${v.from} → ${v.spec}`),
      '插件目录不得跨目录 import（共享能力请走 host-bridge 或抽中立模块）',
    ).toEqual([]);
  });

  it('目录只能引用本插件 owner 的根级模块', () => {
    const violations = edges.filter(({ from, target }) => {
      if (target.startsWith('..')) return false; // 宿主模块
      const fromDir = from.split('/')[0];
      if (target.includes('/')) return false; // 只查 plugins/ 根下的文件（如 ./foo.js → foo.ts）
      const owner = ownerOf(fromDir);
      const base = target.replace(/(\.js|\.ts)$/, '').replace(/\/index$/, '');
      return base !== owner && !base.startsWith(`${owner}-`);
    });
    expect(
      violations.map((v) => `${v.from} → ${v.spec}`),
      '插件目录只能引用自己（owner 前缀）的根级模块',
    ).toEqual([]);
  });
});
