// 剪辑工程文件读写 —— 单一出口。
//
// ★ 为什么必须只有一处目录解析：书签
//   · clip_project 工具（智能体路径）
//   · routes/clip.ts（UI 路径）
//   两条入口若各自拼路径，必然会漂移 —— 表现为「AI 改的工程 UI 看不到」，
//   而两边都不报错（都在"成功地"读写两个不同的文件）。
//
// ★ 轨道模型 v2 序列化边界（P0-1）：
//   · 写盘：剥离 texts/overlays（内存投影字段），图层从这两个视图**重建**进 layers；
//     layers 是唯一持久化形态。layers 里 v1 视图外的新 kind（sticker/effect…）原样保留。
//   · 读盘：version=1 → migrateV1ToV2；version=2 → 用 layers 派生 texts/overlays 视图。
//     无论哪种版本，**内存形态统一**：消费方（渲染/预览/路由/UI）永远读 v1 形状。

import fs from 'node:fs';
import path from 'node:path';
// 宿主目录解析经桥（P4）：本文件随 clip-mode 插件包分发，复制一份 artifact-dir 会把
// hereDir 指向插件目录，产物根目录就全错了。
import { resolveArtifactDirFor } from '../host-bridge.js';
import {
  migrateV1ToV2,
  layersFromV1Fields,
  v1FieldsFromLayers,
  type ClipProject,
  type ClipProjectV1,
  type ClipText,
  type ClipOverlay,
  type Layer,
} from './clip-project.js';

export const CLIP_PROJECT_FILE = 'clip-project.json';

/** 工程文件目录：会话的**中间目录**（内部工作文件，不污染交付区）。 */
export function clipProjectPath(conversationId?: string): { dir: string; file: string } {
  const dir = conversationId
    ? resolveArtifactDirFor({ conversationId, category: 'intermediate' }).dir
    : resolveArtifactDirFor({ category: 'intermediate' }).dir;
  return { dir, file: path.join(dir, CLIP_PROJECT_FILE) };
}

/** 读工程；不存在或损坏返回 null（调用方按"还没有工程"处理，不抛错）。 */
export function readClipProject(conversationId?: string): ClipProject | null {
  try {
    const { file } = clipProjectPath(conversationId);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ClipProject | ClipProjectV1;
    if (!parsed || !Array.isArray(parsed.clips)) return null;
    if (parsed.version === 2) {
      // v2：layers 是唯一存储 → 派生 texts/overlays 内存视图
      const layers = Array.isArray((parsed as ClipProject).layers) ? (parsed as ClipProject).layers : [];
      const { texts, overlays } = v1FieldsFromLayers(layers);
      return {
        ...(parsed as ClipProject),
        layers,
        texts,
        ...(overlays.length ? { overlays } : {}),
      };
    }
    // v1：texts 必有（老文件），overlays 可选 → 迁移到 v2 内存形态
    const v1 = parsed as unknown as ClipProjectV1;
    if (!Array.isArray(v1.texts)) return null;
    const migrated = migrateV1ToV2(v1);
    return migrated;
  } catch {
    return null;
  }
}

/**
 * 写工程（目录不存在则创建）；返回落盘路径。
 *
 * ★ v2 序列化边界：剥离 texts/overlays（内存投影），layers 从这两个视图重建。
 *   这样"layers 是唯一存储"不会因某个 op 忘了同步而破坏 —— 序列化时统一做，
 *   op 层（applyClipOp）不需要逐 op 维护镜像。
 * ★ v1 备份：首次把 v1 文件迁出时留 `.v1.bak`（方案文档 §7 风险表的缓解措施：
 *   迁移坏老草稿 = 用户成果丢失，必须可回退）。
 */
export function writeClipProject(conversationId: string | undefined, project: ClipProject): string {
  const { dir, file } = clipProjectPath(conversationId);
  fs.mkdirSync(dir, { recursive: true });
  // v1 备份：落盘前若磁盘上是 v1 且内存已是 v2（刚迁移），先把原件复制走
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: number };
      if (raw.version === 1) {
        const bak = path.join(dir, 'clip-project.v1.bak');
        if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
        // 备份只留一份（首次迁移原件）；内存已是 v2 → 下次写盘正常覆盖
      }
    } catch { /* 读不出来说明不是合法 json，备份跳过（写盘本身会报错或成功覆盖） */ }
  }
  // 序列化形态：texts/overlays 剥离，layers 重建（text 层的 text 字段与视图同源）。
  // ★ 重建时保留旧层里投影不覆盖的扩展字段（transform/keyframes/track/audio）——
  //   否则 P0-2 给 text 层加 transform 后，每次落盘都会把它抹掉。
  const prevById = new Map((project.layers || []).map((l) => [l.id, l]));
  const rebuilt: Layer[] = layersFromV1Fields(project.texts, project.overlays || []).map((l) => {
    const prev = prevById.get(l.id);
    if (!prev) return l;
    // ★ v1 视图**权威**的变换字段（位置/缩放/混合）只能以投影结果为准，不能从旧层回填：
    //   否则 UI 把画中画从「滤色」改回「正常」时，旧层里残留的 blend 会把它复活 ——
    //   "overlays 上没有 blend" 是一个**明确的 normal**，合并必须允许删字段，而不只是覆盖。
    //   其余扩展字段（rotation/opacity 等 P0-2 起的）仍从旧层保留。
    const keep = { ...prev.transform };
    delete keep.x; delete keep.y; delete keep.scale; delete keep.blend;
    return { ...l, transform: { ...keep, ...l.transform } };
  });
  // v1 视图之外的新 kind 图层（sticker/effect/audio…）原样保留
  const extra = (project.layers || []).filter((l) => l.kind !== 'text' && l.kind !== 'video');
  const byId = new Map<string, Layer>();
  for (const l of extra) byId.set(l.id, l);
  for (const l of rebuilt) byId.set(l.id, l);
  const layers = [...byId.values()];
  const persist: Record<string, unknown> = {
    version: 2,
    name: project.name,
    updatedAt: project.updatedAt,
    output: project.output,
    clips: project.clips,
    layers,
    ...(project.audioFx ? { audioFx: project.audioFx } : {}),
    ...(project.bgm ? { bgm: project.bgm } : {}),
  };
  fs.writeFileSync(file, JSON.stringify(persist, null, 2), 'utf8');
  return file;
}
