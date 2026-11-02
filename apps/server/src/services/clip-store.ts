// 剪辑工程文件读写 —— 单一出口。
//
// ★ 为什么必须只有一处目录解析：书签
//   · clip_project 工具（智能体路径）
//   · routes/clip.ts（UI 路径）
//   两条入口若各自拼路径，必然会漂移 —— 表现为「AI 改的工程 UI 看不到」，
//   而两边都不报错（都在"成功地"读写两个不同的文件）。
//
// ★ 轨道模型 v3（S1，2026-11-02）：**落盘只有 v3**，内存统一 v3 + v2 投影视图。
//   · 写盘：tracks / timedLayers 是唯一持久化形态。S1 期间 applyClipOp 与 UI 仍编辑
//     v2 视图（clips/texts/overlays/audios/stickers/effects/layers），落盘时由视图**重建**
//     轨道与定时层 —— 否则 op 的改动静默丢失。
//   · 读盘：v1 → migrateV1ToV2 → v3；v2 → v3；v3 → 校验后派生 v2 视图。
//     无论磁盘版本，**内存形态统一**：消费方（渲染/预览/路由/UI）永远读 v2 形状。
//   · 备份：磁盘上是 v1 → `clip-project.v1.bak`（既有行为保留）；v2 → `clip-project.v2.bak`
//     （方案 §6：迁移坏老草稿 = 用户成果丢失，必须可回退）。只留首次迁移的原件。
//   · 迁移/校验失败：**不写盘**，原文件保持不动。

import fs from 'node:fs';
import path from 'node:path';
// 宿主目录解析经桥（P4）：本文件随 clip-mode 插件包分发，复制一份 artifact-dir 会把
// hereDir 指向插件目录，产物根目录就全错了。
import { resolveArtifactDirFor } from '../host-bridge.js';
import {
  migrateV1ToV2,
  v1FieldsFromLayers,
  normalizeMulticamGroups,
  normalizeOutput,
  type ClipProject,
  type ClipProjectV1,
} from './clip-project.js';
import {
  buildProjectV3ForWrite,
  loadedFromV2,
  validateProjectV3,
  v2ViewsOfV3,
  CLIP_PROJECT_V3_VERSION,
  type ClipProjectV3,
  type ClipProjectV3Loaded,
} from './clip-project-v3.js';

export const CLIP_PROJECT_FILE = 'clip-project.json';

/** 工程文件目录：会话的**中间目录**（内部工作文件，不污染交付区）。 */
export function clipProjectPath(conversationId?: string): { dir: string; file: string } {
  const dir = conversationId
    ? resolveArtifactDirFor({ conversationId, category: 'intermediate' }).dir
    : resolveArtifactDirFor({ category: 'intermediate' }).dir;
  return { dir, file: path.join(dir, CLIP_PROJECT_FILE) };
}

/**
 * v1/v2 文件 → 既有 v2 内存形态（归一化规则与 S1 之前**逐行相同**）。
 * ★ 单独抽出来是为了让"老工程读入的 v2 视图"与迁移前保持字节级一致：
 *   v3 迁移只负责在旁边补 tracks/timedLayers，不参与视图归一化。
 */
function normalizeV2Shape(parsed: ClipProject | ClipProjectV1): ClipProject | null {
  if (!parsed || !Array.isArray((parsed as ClipProject).clips)) return null;
  if (parsed.version === 2) {
    // v2：layers 是唯一存储 → 派生 texts/overlays 内存视图
    const layers = Array.isArray((parsed as ClipProject).layers) ? (parsed as ClipProject).layers : [];
    const { texts, overlays, audios, stickers, effects } = v1FieldsFromLayers(layers);
    return {
      ...(parsed as ClipProject),
      layers,
      texts,
      // 补帧方式只认 off/blend/mci；历史脏值摘掉（等价 off，off 不落字段）
      output: normalizeOutput((parsed as ClipProject).output),
      // 老工程没有多机位组 → 空数组（UI 直接遍历，不必判空）
      multicamGroups: normalizeMulticamGroups((parsed as ClipProject).multicamGroups),
      ...(overlays.length ? { overlays } : {}),
      ...(audios.length ? { audios } : {}),
      ...(stickers.length ? { stickers } : {}),
      ...(effects.length ? { effects } : {}),
    };
  }
  // v1：texts 必有（老文件），overlays 可选 → 迁移到 v2 内存形态
  const v1 = parsed as unknown as ClipProjectV1;
  if (!Array.isArray(v1.texts)) return null;
  const migrated = migrateV1ToV2(v1);
  return { ...migrated, multicamGroups: [] };
}

/** 读工程；不存在、损坏或结构非法返回 null（调用方按"还没有工程"处理，不抛错）。 */
export function readClipProject(conversationId?: string): ClipProjectV3Loaded | null {
  try {
    const { file } = clipProjectPath(conversationId);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ClipProjectV3 | ClipProject | ClipProjectV1;
    if (!parsed || typeof parsed !== 'object') return null;

    // v3：规范形态 → 校验 → 投影出 v2 视图（渲染/UI/AI op 继续读 v2 形状）
    if (parsed.version === CLIP_PROJECT_V3_VERSION) {
      const v3 = parsed as ClipProjectV3;
      if (!Array.isArray(v3.tracks)) return null;
      const check = validateProjectV3(v3);
      if (!check.ok) return null;
      return v2ViewsOfV3(v3);
    }

    // v1 / v2：先得到既有 v2 形态，再迁到 v3 内存（视图原样保留 → 出片路径零改动）
    const v2 = normalizeV2Shape(parsed);
    return v2 ? loadedFromV2(v2) : null;
  } catch {
    return null;
  }
}

/**
 * 写工程（目录不存在则创建）；返回落盘路径。
 *
 * ★ 落盘只写 v3：`tracks` / `timedLayers` 是唯一存储，v2 视图字段一律剥离。
 * ★ 备份：v1 → .v1.bak、v2 → .v2.bak（首次迁移的原件，可回退）。
 * ★ 迁移/校验失败 → 抛错且**不写盘**（原文件保持不动）。
 */
export function writeClipProject(conversationId: string | undefined, project: ClipProject): string {
  const { dir, file } = clipProjectPath(conversationId);
  fs.mkdirSync(dir, { recursive: true });

  // 1) 先构建 + 校验：任何失败都在碰文件之前发生
  const v3 = buildProjectV3ForWrite(project);
  const check = validateProjectV3(v3);
  if (!check.ok) throw new Error(`剪辑工程无法保存为 v3：${check.error}`);

  // 2) 迁移备份：只在磁盘上是旧版本、且备份还不存在时复制一份
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: number };
      const bakName = raw.version === 1
        ? 'clip-project.v1.bak'
        : raw.version === 2
          ? 'clip-project.v2.bak'
          : null;
      if (bakName) {
        const bak = path.join(dir, bakName);
        if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
      }
    } catch { /* 读不出来说明不是合法 json，备份跳过（写盘本身会成功覆盖） */ }
  }

  // 3) 落盘：逐字段重建，避免把内存投影视图写进文件
  const persist: Record<string, unknown> = {
    version: CLIP_PROJECT_V3_VERSION,
    name: v3.name,
    updatedAt: v3.updatedAt,
    output: v3.output,
    tracks: v3.tracks,
    timedLayers: v3.timedLayers,
    ...(v3.audioFx ? { audioFx: v3.audioFx } : {}),
    ...(v3.bgm ? { bgm: v3.bgm } : {}),
    // ★ 必须保留：逐字段重建，漏掉 multicamGroups = UI 保存一次就丢组
    ...(v3.multicamGroups?.length ? { multicamGroups: v3.multicamGroups } : {}),
  };
  fs.writeFileSync(file, JSON.stringify(persist, null, 2), 'utf8');
  return file;
}
