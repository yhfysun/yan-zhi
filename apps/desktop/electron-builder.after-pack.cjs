/**
 * electron-builder afterPack 钩子（打包后、生成安装包前）。
 *
 * 两件事：
 *   1) 清理随包后端里的开发产物（.js.map / .d.ts / .d.ts.map）；
 *   2) 给可执行文件写安全 fuses（见 scripts/apply-fuses.cjs）。
 *
 * ★ 为什么必须在 afterPack 里做（而不是只写在 yml 的 files: 段）：
 *   `extraResources` 是**原样复制**，不经过 `files:` 的排除规则。此前
 *   `apps/server/dist` 的 sourcemap 就是这样被打进 resources/server/dist 的 ——
 *   等于把后端 TypeScript 源码结构直接交给客户。这里在复制完成后统一兜底删除。
 */
const fs = require('node:fs');
const path = require('node:path');
const { applyFuses } = require('./scripts/apply-fuses.cjs');

/** resources 目录：Windows/Linux 在 appOutDir/resources，macOS 在 .app/Contents/Resources。 */
function resolveResourcesDir(appOutDir, platform) {
  if (platform === 'darwin') {
    const apps = fs.readdirSync(appOutDir).filter((n) => n.endsWith('.app'));
    if (!apps.length) throw new Error(`[after-pack] ${appOutDir} 下没有 .app`);
    return path.join(appOutDir, apps[0], 'Contents', 'Resources');
  }
  return path.join(appOutDir, 'resources');
}

/** 递归删除后端源码映射与类型声明（运行时不读）。返回删除数量。 */
function stripDevArtefacts(dir) {
  let removed = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (/\.(js\.map|mjs\.map|cjs\.map|d\.ts|d\.ts\.map)$/.test(e.name)) {
        fs.rmSync(p, { force: true });
        removed++;
      }
    }
  };
  walk(dir);
  return removed;
}

/** 递归找出残留的 map（断言用）。 */
function findMaps(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findMaps(p, out);
    else if (e.name.endsWith('.map')) out.push(p);
  }
  return out;
}

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName || process.platform;
  const resourcesDir = resolveResourcesDir(context.appOutDir, platform);

  const asar = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(asar)) {
    throw new Error(`[after-pack] 未找到 app.asar：${asar}（OnlyLoadAppFromAsar 需要它）`);
  }

  const serverDist = path.join(resourcesDir, 'server', 'dist');
  if (fs.existsSync(serverDist)) {
    const removed = stripDevArtefacts(serverDist);
    const left = findMaps(serverDist);
    if (left.length) {
      throw new Error(`[after-pack] 后端仍残留 sourcemap（${left.length} 个），拒绝出包：${left[0]}`);
    }
    console.log(`[after-pack] 已清理后端开发产物 ${removed} 个文件`);
  }

  await applyFuses({ appOutDir: context.appOutDir, platform });
};
