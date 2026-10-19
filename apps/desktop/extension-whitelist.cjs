/**
 * 精选扩展白名单（P2）
 *
 * ★ 只允许从这里安装商店扩展；本地目录安装不受此限制（用户显式选择文件夹）。
 * ★ status：
 *   - verified：P0/P2 已实际跑通安装与核心能力。
 *   - partial：能安装，但部分依赖 chrome.* API / toolbar popup / DNR 的功能在免费路径下不可用。
 * ★ uBlock Origin Lite 等 MV3 declarativeNetRequest 去广告扩展**不列入**：
 *   P0 实测 DNR 规则在 Electron 44 下不生效。
 */

const WHITELIST = [
  {
    id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
    name: 'Dark Reader',
    status: 'verified',
    note: '暗色模式。P0 已验证商店 CRX 安装成功、MV3 service worker 正常运行。',
  },
  {
    id: 'nhdogjmejiglipccpnnnanhbledajbpd',
    name: 'Vue.js devtools',
    status: 'partial',
    note: 'DevTools 扩展。安装后在开发者工具的 Vue 面板中使用。',
  },
  {
    id: 'bpoadfkcbjbfhfodiogcnhhhpibjhbnh',
    name: '沉浸式翻译',
    status: 'partial',
    note: '网页双语翻译可用；侧边栏、DNR 规则等部分功能可能不可用。',
  },
  {
    id: 'dhdgffkkebhmkfjojejmpbldmpobfkfo',
    name: 'Tampermonkey',
    status: 'partial',
    note: '脚本注入可用；工具栏弹窗、cookies / webNavigation 等 API 在免费路径下受限。',
  },
]

const IDS = new Set(WHITELIST.map((item) => item.id))

function isAllowedStoreExtension (id) {
  return IDS.has(String(id || ''))
}

function listWhitelist () {
  return WHITELIST.map((item) => ({ ...item }))
}

module.exports = { WHITELIST, isAllowedStoreExtension, listWhitelist }
