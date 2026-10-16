// 远程仓库（git remote）的纯逻辑：`git remote -v` 解析 + 用户输入校验。
//
// ★ 为什么单独成模块（而不是塞进 services/git.ts）：
//   ① services/git.ts 已 900+ 行，仓库口径是「多小文件 > 少大文件」；
//   ② 下面两个校验是**安全边界** —— 名字与地址最终会被拼进 git 命令行，
//      必须能被单测直接钉住，而不是只能连着 keyring / workspace 守卫一起 mock。
//
// ★ 为什么必须校验而不是直接透传用户输入：
//   `git remote add --upload-pack=calc origin url` 这类参数注入，只需要一个以 `-` 开头的
//   “名字”就能成立；地址里混入空白 / 换行则会被拆成额外参数。远程地址由用户手填，
//   属于典型系统边界输入。

/** 一条远程配置 */
export interface GitRemote {
  name: string;
  /** 拉取地址（`git remote -v` 的 (fetch) 行） */
  fetchUrl: string;
  /** 推送地址；未单独配置（或与拉取一致）时等于 fetchUrl */
  pushUrl: string;
}

/** 远程名里被 git 自己拒绝、或会造成参数注入的字符（`-` 由 startsWith 单独挡） */
const ILLEGAL_NAME_CHARS = /[\s~^:?*\[\\]/;
/** 控制字符（含换行、制表、NUL）：名字与地址都不允许 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 解析 `git remote -v` 的输出。
 * 每行形如：`origin\thttps://github.com/a/b.git (fetch)`
 * 只有 push 行（未配 fetch，极少见）时，fetchUrl 回落到 push 地址 —— 宁可少也不留空。
 *
 * 解析失败的行一律跳过：git 输出里可能混入警告文本，不能让一条杂音毁掉整份列表。
 */
export function parseRemoteVerbose(out: string): GitRemote[] {
  const byName = new Map<string, GitRemote>();
  for (const line of String(out || '').split('\n')) {
    const m = line.trim().match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const [, name, url, kind] = m;
    const cur = byName.get(name) || { name, fetchUrl: '', pushUrl: '' };
    if (kind === 'fetch') cur.fetchUrl = url;
    else cur.pushUrl = url;
    byName.set(name, cur);
  }
  return [...byName.values()].map((r) => ({
    ...r,
    fetchUrl: r.fetchUrl || r.pushUrl,
    pushUrl: r.pushUrl || r.fetchUrl,
  }));
}

/**
 * 校验并规范化远程名。
 * 规则：非空、不以 `-` 开头（否则会被 git 当成选项）、不含空白/控制字符与 `~^:?*[\\`、
 * 不含 `..`、不以 `.lock` 结尾（后两条是 git 自身的 ref 规则，早失败好过让 git 抛原生英文错）。
 * @returns 去掉首尾空白的名字
 */
export function assertRemoteName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new Error('远程名称不能为空');
  if (name.startsWith('-')) throw new Error(`远程名称不能以「-」开头：${name}`);
  if (ILLEGAL_NAME_CHARS.test(name) || CONTROL_CHARS.test(name)) {
    throw new Error(`远程名称含非法字符（空白 ~ ^ : ? * [ \\ 之一）：${name}`);
  }
  if (name.includes('..')) throw new Error(`远程名称不能含「..」：${name}`);
  if (name.endsWith('.lock')) throw new Error(`远程名称不能以「.lock」结尾：${name}`);
  return name;
}

/**
 * 校验并规范化远程地址。
 * 不限定协议：https / git@host:path / ssh:// / file:/// / 本地路径都合法，git 自己能认即可。
 * 只挡两类必然有害的输入：以 `-` 开头（参数注入）、含空白或控制字符（会被拆成多个参数）。
 * @returns 去掉首尾空白的地址
 */
export function assertRemoteUrl(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) throw new Error('远程地址不能为空');
  if (url.startsWith('-')) throw new Error('远程地址不能以「-」开头');
  if (CONTROL_CHARS.test(url) || /\s/.test(url)) throw new Error('远程地址不能包含空白或控制字符');
  return url;
}
