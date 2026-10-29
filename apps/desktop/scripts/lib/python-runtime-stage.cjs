/**
 * Python 运行时随插件裁剪（computer-use 插件拥有它）。
 *
 * `resources/python`（解释器，~400MB）与 `resources/python-tools`（随包脚本 + 预烤依赖）
 * 在 yml 的 extraResources 里是**无条件**拷贝的 —— extraResources 不走 files: 排除规则，
 * 未选 computer-use 的包也会被塞进这两个目录。而 electron-builder 对缺失的 `from`
 * 路径会报错，所以这里用「整目录移到暂存区 + 留空壳目录」的方式裁剪：
 *   · 空壳存在 ⇒ extraResources 有源可拷（拷进包里的也是空目录，运行时按"文件不存在"判缺失）；
 *   · 内容在暂存区 ⇒ 打完原样移回，开发机的 python 运行时不受影响（移动是 rename，秒级）；
 *   · 崩溃残留：下一次 stage 先 restore，不会累积。
 *
 * 运行时判定依赖**文件**是否存在（python.exe / python-tools 内有内容），
 * 因此空目录 = 诚实缺失 → 回退系统 python（见 packages/core/.../python-runtime.ts）。
 */
const fsDefault = require('fs');
const path = require('path');

const PYTHON_DIRS = ['python', 'python-tools'];
const HOLD_DIR_NAME = '.prune-hold';
/** 拥有这两个资源的插件 id（与 build/plugins.catalog.json 的 extraResources 对应）。 */
const OWNER_PLUGIN_ID = 'computer-use';

function holdDir(resourcesDir) {
  return path.join(resourcesDir, HOLD_DIR_NAME);
}

/**
 * 裁剪：未选中 computer-use 时把两个目录的内容移到暂存区，留下空壳。
 * keep=true 时先恢复上次残留（崩溃后重跑），然后不做裁剪。
 *
 * @returns {{skipped: boolean, moved: string[], restored: string[]}}
 */
function stagePythonRuntime({ resourcesDir, keep, fs = fsDefault, log = () => {} } = {}) {
  const restored = restorePythonRuntime({ resourcesDir, fs, log });
  if (keep) return { skipped: true, moved: [], restored };

  const moved = [];
  for (const name of PYTHON_DIRS) {
    const src = path.join(resourcesDir, name);
    if (!fs.existsSync(src)) {
      // 从没生成过：建空壳即可（extraResources 有源可拷，运行时判定为缺失）
      fs.mkdirSync(src, { recursive: true });
      continue;
    }
    const hold = path.join(holdDir(resourcesDir), name);
    fs.rmSync(hold, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(hold), { recursive: true });
    fs.renameSync(src, hold);
    fs.mkdirSync(src, { recursive: true });
    moved.push(name);
    log(`prune  ${name} → resources/${HOLD_DIR_NAME}/`);
  }
  return { skipped: false, moved, restored };
}

/** 恢复：把暂存区内容移回（幂等；没有暂存就是 no-op）。 */
function restorePythonRuntime({ resourcesDir, fs = fsDefault, log = () => {} } = {}) {
  const hold = holdDir(resourcesDir);
  const restored = [];
  if (!fs.existsSync(hold)) return restored;

  for (const name of PYTHON_DIRS) {
    const src = path.join(hold, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(resourcesDir, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(src, dest);
    restored.push(name);
    log(`restore ${name}`);
  }
  try {
    fs.rmSync(hold, { recursive: true, force: true });
  } catch {
    /* 残留空目录无害 */
  }
  return restored;
}

module.exports = { PYTHON_DIRS, OWNER_PLUGIN_ID, HOLD_DIR_NAME, holdDir, stagePythonRuntime, restorePythonRuntime };
