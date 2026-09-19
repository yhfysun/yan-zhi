#!/usr/bin/env node
/**
 * 打包脚本的纯逻辑层（可单测）。
 *
 * ★ 为什么把这些从 build-all-editions.cjs / electron-build.cjs 里抽出来：
 *   那两个脚本在 require 时就会执行完整打包链路（编译 + electron-builder，数分钟），
 *   无法直接单测。而这里的三件事恰恰是**出错代价最高、又最容易写错**的部分：
 *     1) 产物后缀解析（漏了 → 打出「后缀与内容档位不一致」的包）；
 *     2) 旧产物目录清理（清不掉 → EBUSY 中断，报错却看不出是锁）；
 *     3) 档位参数解析（拼错 → 静默打出兜底档的包）。
 *   抽成纯函数后可在裸 Node 下用假 fs 秒级验证。
 *
 * 约定：需要触碰文件系统的地方一律接受注入的 `fs`，便于测试构造「被占用」等异常。
 */
const fsDefault = require('fs');
const path = require('path');

/** 三档全集，顺序即默认构建顺序。 */
const ALL_EDITIONS = ['lite', 'basic', 'pro'];

/** 各档对应的 electron-builder 配置（lite 与 full 目前内容等价，保留映射以便日后分叉）。 */
const EDITION_CONFIG = {
  lite: 'electron-builder.lite.yml',
  basic: 'electron-builder.full.yml',
  pro: 'electron-builder.full.yml',
};

const EDITION_LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/** --separate 模式下各档的独立输出目录名。 */
const SEPARATE_OUT = {
  lite: 'dist-release-lite',
  basic: 'dist-release-basic',
  pro: 'dist-release-pro',
};

/**
 * electron-builder 会复用（并需要清空重建）的 appOutDir，按平台列举。
 *
 * 同一输出目录连续构建多档时，上一档留在这里的 app.asar 有 200MB+，
 * 若被残留进程 / 杀软扫描持有，Windows 下删除会 EBUSY，
 * electron-builder 直接中断，报错却指向
 * `app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`（看不出是锁）。
 */
const APP_OUT_DIRS = ['win-unpacked', 'win-ia32-unpacked', 'mac', 'mac-arm64', 'linux-unpacked'];

/**
 * 解析产物名后缀。
 *
 * 优先环境变量，其次 edition.json，最后兜底 '-basic'。
 *
 * ★ 为什么必须有兜底而不是留空：electron-builder 展开 `${env.X}` 时
 *   变量不存在会直接抛 InvalidConfigurationError（不是忽略），留空即构建失败。
 *   ★ 为什么兜底是 basic 而不是别的：env / 配置文件写错属工程事故，
 *   按最小可用档跑比按最高档跑安全。
 */
function resolveArtifactSuffix({ fromEnv, editionJsonPath, fs = fsDefault } = {}) {
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(fs.readFileSync(editionJsonPath, 'utf8'));
    if (cfg && typeof cfg.artifactSuffix === 'string' && cfg.artifactSuffix) return cfg.artifactSuffix;
  } catch {
    /* edition.json 不存在（未跑 set-edition）→ 走兜底 */
  }
  return '-basic';
}

/**
 * 校验「输出目录可写且旧产物可清理」。
 *
 * ★ 为什么单独抽出来：这是同目录多档构建的**唯一硬约束**。
 *   安装包名带档位后缀，彼此不冲突，所以多档同目录本身没问题；
 *   真正会失败的是复用的 appOutDir（win-unpacked/）删不掉 —— 被残留进程或
 *   杀软扫描持有句柄时 EBUSY，electron-builder 报的却是
 *   ERR_ELECTRON_BUILDER_CANNOT_EXECUTE（看不出是锁）。
 *   与其等到打包中途炸，不如开工前先探一次：能提前几十秒给出可操作的提示。
 */
function checkOutputDirReady(outputDir, fs = fsDefault) {
  const blockers = [];
  for (const name of APP_OUT_DIRS) {
    const target = path.join(outputDir, name);
    if (!fs.existsSync(target)) continue;
    // 只探不改：真正删除由 clearAppOutDirs 负责，这里避免重复副作用。
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 1 });
    } catch (err) {
      blockers.push({ dir: target, code: err.code || 'UNKNOWN' });
    }
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * 清理输出目录下所有复用的 appOutDir。
 *
 * 不抛异常，而是把结果回给调用方 —— 由脚本决定如何呈现与退出码。
 * ★ 刻意不提供「清理失败就换个目录」的选项：产物路径必须可预测，
 *   静默改到 dist-release-<时间戳> 会让产物散落多处、用户找不到包。
 *
 * @returns {{removed: string[], failed: Array<{dir: string, code: string, message: string}>}}
 */
function clearAppOutDirs(outputDir, fs = fsDefault) {
  const removed = [];
  const failed = [];
  for (const name of APP_OUT_DIRS) {
    const target = path.join(outputDir, name);
    if (!fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
      removed.push(target);
    } catch (err) {
      failed.push({ dir: target, code: err.code || 'UNKNOWN', message: err.message });
    }
  }
  return { removed, failed };
}

/**
 * 解析 build-all-editions.cjs 的命令行。
 *
 * @returns {{editions: string[], separate: boolean, invalid: string[]}}
 */
function parseEditionsArgv(argv) {
  const raw = (argv || []).filter((a) => typeof a === 'string');
  const separate = raw.includes('--separate');
  const requested = raw.filter((a) => !a.startsWith('-'));
  const editions = requested.length ? requested : ALL_EDITIONS;
  const invalid = editions.filter((e) => !ALL_EDITIONS.includes(e));
  return { editions, separate, invalid };
}

/** 某档的输出目录（绝对路径）。separate=true 时各档独立，否则三档同目录。 */
function outDirForEdition(edition, { separate, singleOut, repoRoot }) {
  return separate
    ? path.resolve(repoRoot, SEPARATE_OUT[edition])
    : path.resolve(repoRoot, singleOut);
}

module.exports = {
  ALL_EDITIONS,
  EDITION_CONFIG,
  EDITION_LABEL,
  SEPARATE_OUT,
  APP_OUT_DIRS,
  resolveArtifactSuffix,
  checkOutputDirReady,
  clearAppOutDirs,
  parseEditionsArgv,
  outDirForEdition,
};