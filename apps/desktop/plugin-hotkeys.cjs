'use strict';
/**
 * 插件窗口全局快捷键 · 纯逻辑（零 electron 依赖，供 main.cjs 与 node --test 共用）。
 *
 * 渲染层把「已启用插件声明的窗口 + 用户改过的组合」整份同步过来，这里只做
 * 规范化与差量计算：哪些要注册、哪些要注销、哪些没变。真正的
 * globalShortcut.register 仍收敛在 main.cjs 的 setGlobalHotkey 里（守门测试要求
 * 全进程只有一处 register 调用）。
 */
const path = require('path');
const { PLUGIN_ID_RE } = require('./plugin-protocol.cjs');

const PLACEMENTS = new Set(['desktop', 'overlay', 'normal']);
const ENTRY_RE = /\.html?$/i;
/** Electron accelerator 只允许这些字符（组合用 + 连接，如 Control+Alt+D） */
const ACCEL_RE = /^[A-Za-z0-9+]{1,64}$/;

function sanitizeAccelerator(v) {
  const s = String(v || '').trim();
  if (!ACCEL_RE.test(s) || s.endsWith('+')) return '';
  // 必须带修饰键或用功能键：防止把单字母注册成全局热键吃掉整个键盘
  if (!s.includes('+') && !/^F\d{1,2}$/.test(s)) return '';
  return s;
}

function readRect(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const k of ['x', 'y', 'w', 'h']) {
    const n = Number(raw[k]);
    if (Number.isFinite(n)) out[k] = Math.round(n);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 规范化渲染层传来的快捷键清单。
 * @param list Array<{pluginId, windowId, entry, placement?, accelerator, rect?, resizable?, title?}>
 * @returns Map<'pluginId/windowId', spec> —— 只含**有效且要注册**的条目
 */
function normalizePluginHotkeys(list) {
  const out = new Map();
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const pluginId = String(raw.pluginId || '');
    const windowId = String(raw.windowId || '');
    if (!PLUGIN_ID_RE.test(pluginId) || !PLUGIN_ID_RE.test(windowId)) continue;
    const entry = String(raw.entry || '');
    if (!entry || path.isAbsolute(entry) || entry.includes('..') || !ENTRY_RE.test(entry)) continue;
    const accelerator = sanitizeAccelerator(raw.accelerator);
    if (!accelerator) continue; // 用户禁用或非法组合：不占坑
    const key = pluginId + '/' + windowId;
    if (out.has(key)) continue; // 同一窗口只认第一条
    out.set(key, {
      key,
      pluginId,
      windowId,
      entry,
      placement: PLACEMENTS.has(raw.placement) ? raw.placement : 'normal',
      accelerator,
      rect: readRect(raw.rect),
      resizable: raw.resizable === true,
      title: String(raw.title || ''),
    });
  }
  return out;
}

module.exports = { normalizePluginHotkeys, sanitizeAccelerator, readRect };
