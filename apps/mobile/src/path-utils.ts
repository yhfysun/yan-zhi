// 移动端路径 → Capacitor Filesystem 入参的归一化（纯函数，零依赖，可单测）。
//
// ★★ 背景（实测 bug：预览框报「文件不存在」且路径重复两遍）
//
// `Filesystem.readFile({ path, directory: Directory.Data })` 里的 `path` 是
// **相对 Directory.Data 的路径**，不是绝对路径。而内嵌后端在 Android 上产出的是
// **绝对路径**（形如 `data/data/com.yanzhi.mobile/files/capawesome_nodejs/...`，
// 没有前导斜杠）。直接当相对路径传进去，Capacitor 会再拼一次根目录，得到：
//
//   /data/user/0/com.yanzhi.mobile/files/data/data/com.yanzhi.mobile/files/...
//   └────────── Directory.Data ──────────┘└──────────── 后端给的 path ───────────┘
//
// —— 也就是用户看到的「路径重复两遍、文件不存在」。
//
// 处置：**是绝对路径就用 `file://` 直连**（此时不能再传 directory），
// 相对路径才走 directory 拼接。

/**
 * 判断是否「绝对/可直连」路径，并归一成 `file://` URI。
 *
 * 覆盖后端可能给出的几种形态：
 *   · `file:///data/...`          → 已经是 URI，原样返回
 *   · `/data/...`                 → 真绝对路径，补 `file://`
 *   · `data/data/<pkg>/files/...` → Android 家目录相对形式，补成 `/data/user/0/...`
 *   · `data/user/0/...`           → 同上
 *   · `capawesome_nodejs/...`     → **相对 Directory.Data**，返回 null（交由调用方走 directory）
 *
 * @returns 可直连的 `file://` URI；非绝对路径返回 null。
 */
export function toFileUri(p: string): string | null {
  const raw = String(p ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('file://')) return raw;
  // 真绝对路径（含 Windows 盘符形式，移动端用不到但保持健壮）
  if (raw.startsWith('/')) return 'file://' + raw;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return 'file:///' + raw.replace(/\\/g, '/');
  // Android 应用私有目录的「家目录相对」写法：data/data/<pkg>/files/...
  // Capacitor 的 Directory.Data 实际落在 /data/user/0/<pkg>/files
  if (/^data\/data\//.test(raw)) {
    return 'file:///data/user/0/' + raw.replace(/^data\/data\//, '');
  }
  if (/^data\/user\/\d+\//.test(raw)) {
    return 'file:///' + raw;
  }
  return null;
}

/**
 * 组装 Capacitor Filesystem 的调用入参。
 *
 * 绝对路径 → `{ path: 'file://...' }`（**不传 directory**，传了会二次拼接）
 * 相对路径 → `{ path, directory: Directory.Data }`
 *
 * 这里不 import Directory 枚举，避免纯函数依赖 Capacitor 运行时；
 * 由调用方把 `Directory.Data` 的值传进来。
 */
export function toFsArg<T>(path: string, dataDirValue: T): { path: string; directory?: T } {
  const uri = toFileUri(path);
  if (uri) return { path: uri };
  return { path: String(path ?? ''), directory: dataDirValue };
}