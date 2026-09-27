// 实例配置（单一真相源）—— 让「开发实例」与「安装版」在运行期彻底隔离。
//
// ★★★ 为什么需要（2026-09-27 用户报障：「我都安装好了这个软件了，但是你在修改代码的时候
//   这个软件还会变化？」）：
//   安装包本体是静态的（app.asar 自带 dist，实测 6227 项 0 软链接），源码改不动它。
//   但两个实例在运行期有三处共用，导致开发版一启动就把安装版顶替：
//     ① **端口 3001**：dev 编排器把「正在运行的正式版」列入可杀名单并强杀，
//        再用自己的后端占住 3001 —— 安装版窗口前端还是旧文件，但所有 /api 请求
//        打到的是开发版后端 → 看起来就是「装好的软件跟着源码变」。
//     ② **userData**：硬编码 %APPDATA%\yan-zhi → localStorage / 密钥 / 数据库互相污染。
//     ③ **单实例锁**：谁先起谁独占，另一个被挤掉，窗口同标题同图标分不清。
//
// 本模块把这三件事收敛成一份配置：**凡是「按实例而异」的东西只能从这里取**，
// 各处（main.cjs / preload.cjs / dev.mjs）一律引用，不再各自硬编码。
//
// ⚠️ 这是 CommonJS 主进程模块。渲染进程拿不到 process.env，端口经 preload 的
//    `electronAPI.apiPort` 下发（见 preload.cjs），UI 侧不要再自己写端口常量。

const path = require('path');

/** 生产默认端口（与 server/src/index.ts 的 PORT 默认值一致） */
const DEFAULT_API_PORT = 3001;
/** 开发实例默认端口 —— 与生产错开，避免争用与误杀 */
const DEV_API_PORT = 3002;
/** 默认生产 userData 目录名（历史数据都在这里，不能改名） */
const DEFAULT_USERDATA_NAME = 'yan-zhi';
/** 开发实例的 userData 目录名 —— 与生产分开，互不污染 */
const DEV_USERDATA_NAME = 'yan-zhi-dev';

/**
 * 解析 API 端口。
 *
 * 优先级：**显式环境变量 > 实例默认**。
 * 为什么先读 env：dev 编排器（bin/dev.mjs）需要把端口下发给 Electron 主进程，
 * 让它拉起的内嵌后端监听同一个端口；将来若要多开几个实例，也只改环境变量。
 *
 * 非法值（非数字 / 越界）一律**回落默认**而非透传 —— 写错端口不能变成"监听随机端口"
 * 这种更难查的故障（与 YZ_INSTALL_SILENT_MAX_MB 的处理口径一致）。
 */
function resolveApiPort(env) {
  const e = env || {};
  const fallback = e.YANZHI_DEV_INSTANCE ? DEV_API_PORT : DEFAULT_API_PORT;
  const raw = e.YANZHI_API_PORT;
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

/**
 * 是否开发实例。
 *
 * ★ 判据是**显式环境变量**，不是 `app.isPackaged`：
 *   `app.isPackaged` 判定的是「是否从 asar 启动」，它区分的是**打包与否**；
 *   而我们要区分的是**哪个实例的数据与端口**。两者不能混用 ——
 *   若用 isPackaged 判，一旦有人跑打包版 dev（`electron --dev`）就会拿到生产的 userData。
 *   dev 编排器在拉起 Electron 时注入 `YANZHI_DEV_INSTANCE=1`。
 */
function isDevInstance(env) {
  const e = env || {};
  return String(e.YANZHI_DEV_INSTANCE || '') === '1';
}

/** 本实例的 userData 目录名 */
function userDataName(isDev) {
  return isDev ? DEV_USERDATA_NAME : DEFAULT_USERDATA_NAME;
}

/**
 * 共享数据目录名 —— **始终是生产目录**，与实例无关。
 *
 * ★★ 为什么 models / bin 必须共享而不是各存一份：
 *   本地 LLM 模型是 1.1GB 的 gguf、下载的运行时二进制也是几十上百 MB。
 *   若开发实例在 `yan-zhi-dev/models` 找不到模型，用户会遇到
 *   「升级/切换实例后模型突然不可用、要重新下载 1.1GB」——
 *   这是把一个数据隔离问题变成了一个明显的功能回归。
 *   → 隔离的是**状态**（数据库 / 密钥 / 浏览器存储），不是**大文件缓存**。
 */
function sharedDataName() {
  return DEFAULT_USERDATA_NAME;
}

/**
 * 一次性迁移：开发实例首次启动时，若自己的目录不存在而生产目录存在，
 * 就把生产目录**复制**一份作为起点（不移动 —— 生产实例还要继续用）。
 *
 * 目的：用户不用在开发实例里重新配模型/授权码才能调试。
 * 复制而非移动，且仅首次（目标已存在就跳过）→ 不会反复覆盖用户在 dev 里的改动。
 */
function resolveUserDataDirs(appDataPath, isDev) {
  const name = userDataName(isDev);
  return {
    userData: path.join(appDataPath, name),
    /** 大文件缓存目录（models/bin）：固定指向生产目录，两实例共用 */
    shared: path.join(appDataPath, sharedDataName()),
    /** 是否需要从生产目录引导复制（仅 dev 且自身目录不存在时） */
    seedFrom: isDev ? path.join(appDataPath, DEFAULT_USERDATA_NAME) : null,
  };
}

module.exports = {
  DEFAULT_API_PORT,
  DEV_API_PORT,
  DEFAULT_USERDATA_NAME,
  DEV_USERDATA_NAME,
  resolveApiPort,
  isDevInstance,
  userDataName,
  sharedDataName,
  resolveUserDataDirs,
};