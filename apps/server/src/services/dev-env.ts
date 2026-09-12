// 代码模式「开发环境」配置：Java / Maven / Python / Node / Git 的路径与版本管理。
// 配置持久化在 dataDir/dev-env.json（与 db 同目录），进程启动时载入一次。
// 终端（local-console）、运行配置、cmd_exec 都从这里取 PATH / 环境变量。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dataDir } from '../db.js';

export interface DevEnvConfig {
  /** JDK 安装根目录（JAVA_HOME），如 C:\Program Files\Java\jdk-17 */
  javaHome: string;
  /** Maven 安装根目录（M2_HOME），如 D:\apache-maven-3.9.6 */
  mavenHome: string;
  /** Python 解释器绝对路径，如 C:\Python311\python.exe；留空则用 PATH 里的 python */
  pythonPath: string;
  /** Node 可执行文件绝对路径；留空用 PATH 里的 node */
  nodePath: string;
  /** Git 可执行文件绝对路径；留空用 PATH 里的 git */
  gitPath: string;
  /** 新建终端默认 shell */
  defaultShell: 'powershell' | 'cmd' | 'bash';
  /** 追加到子进程的环境变量（KV） */
  extraEnv: Record<string, string>;
  /** JAVA 运行配置默认 JVM 参数 */
  javaOpts: string;
  /** Maven 额外参数（如 -o 离线 / -DskipTests） */
  mavenOpts: string;
  /** Python 包镜像源（pip install 时用） */
  pipIndexUrl: string;
}

export const DEFAULT_DEV_ENV: DevEnvConfig = {
  javaHome: '',
  mavenHome: '',
  pythonPath: '',
  nodePath: '',
  gitPath: '',
  defaultShell: process.platform === 'win32' ? 'powershell' : 'bash',
  extraEnv: {},
  javaOpts: '',
  mavenOpts: '',
  pipIndexUrl: '',
};

const CONFIG_FILE = path.join(dataDir, 'dev-env.json');

let cache: DevEnvConfig | null = null;

export function loadDevEnv(): DevEnvConfig {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    cache = { ...DEFAULT_DEV_ENV, ...(JSON.parse(raw) as Partial<DevEnvConfig>) };
  } catch {
    cache = { ...DEFAULT_DEV_ENV };
  }
  return cache;
}

export function saveDevEnv(patch: Partial<DevEnvConfig>): DevEnvConfig {
  const next: DevEnvConfig = { ...loadDevEnv(), ...patch };
  cache = next;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch { /* 只读环境下仅内存生效 */ }
  return next;
}

// ======================== 工具探测 ========================

export type ToolId = 'java' | 'maven' | 'python' | 'node' | 'git';

export interface ToolStatus {
  id: ToolId;
  label: string;
  /** 可执行文件或 HOME 路径（java/maven 为 HOME 目录，其余为 exe 路径） */
  path: string;
  version: string;
  ok: boolean;
  /** 探测失败原因 */
  error: string;
}

interface ToolSpec {
  id: ToolId;
  label: string;
  /** PATH 中查找的命令名（按顺序尝试） */
  commands: string[];
  /** 版本参数 */
  versionArgs: string[];
  /** 该工具是「HOME 目录型」（java/maven）还是「可执行文件型」（python/node/git） */
  kind: 'home' | 'exe';
  /** 相对 HOME 的可执行文件位置 */
  exeRel: string[];
}

const IS_WIN = process.platform === 'win32';

const TOOL_SPECS: ToolSpec[] = [
  { id: 'java', label: 'Java (JDK)', commands: ['java'], versionArgs: ['-version'], kind: 'home', exeRel: ['bin', IS_WIN ? 'java.exe' : 'java'] },
  { id: 'maven', label: 'Apache Maven', commands: ['mvn', IS_WIN ? 'mvn.cmd' : 'mvn'], versionArgs: ['-v'], kind: 'home', exeRel: ['bin', IS_WIN ? 'mvn.cmd' : 'mvn'] },
  { id: 'python', label: 'Python', commands: IS_WIN ? ['python', 'py', 'python3'] : ['python3', 'python'], versionArgs: ['--version'], kind: 'exe', exeRel: [] },
  { id: 'node', label: 'Node.js', commands: ['node'], versionArgs: ['--version'], kind: 'exe', exeRel: [] },
  { id: 'git', label: 'Git', commands: ['git'], versionArgs: ['--version'], kind: 'exe', exeRel: [] },
];

/** 在 PATH 中定位命令（Windows 用 where，其他用 which）；返回首个命中绝对路径 */
export function whichSync(cmd: string): string {
  try {
    const r = IS_WIN
      ? spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true })
      : spawnSync('which', [cmd], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (first) return first;
    }
  } catch { /* ignore */ }
  return '';
}

/** HOME 目录型：从 bin/java(.exe) 反推 JDK 根目录 */
function homeFromExe(exe: string): string {
  const bin = path.dirname(exe);
  if (path.basename(bin).toLowerCase() === 'bin') return path.dirname(bin);
  return bin;
}

function readVersion(cmd: string, args: string[]): { version: string; error: string } {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    if (r.error) return { version: '', error: r.error.message };
    if (!out) return { version: '', error: '无版本输出' };
    const m = out.match(/(\d+\.\d+(?:[.\d\w-]*))/);
    return { version: m ? m[1] : out.split('\n')[0].slice(0, 40), error: '' };
  } catch (err) {
    return { version: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** 解析某个工具当前应当使用的可执行文件路径（优先用户配置，其次 PATH） */
export function resolveToolExe(id: ToolId, cfg: DevEnvConfig = loadDevEnv()): string {
  const spec = TOOL_SPECS.find((s) => s.id === id)!;
  if (spec.kind === 'home') {
    const home = id === 'java' ? cfg.javaHome : cfg.mavenHome;
    if (home) {
      const candidate = path.join(home, ...spec.exeRel);
      if (fs.existsSync(candidate)) return candidate;
    }
    for (const c of spec.commands) {
      const found = whichSync(c);
      if (found) return found;
    }
    return '';
  }
  const configured = id === 'python' ? cfg.pythonPath : id === 'node' ? cfg.nodePath : cfg.gitPath;
  if (configured && fs.existsSync(configured)) return configured;
  for (const c of spec.commands) {
    const found = whichSync(c);
    if (found) return found;
  }
  return '';
}

/** 单次状态探测：给定工具 id，返回路径 + 版本 */
export function probeTool(id: ToolId, cfg: DevEnvConfig = loadDevEnv()): ToolStatus {
  const spec = TOOL_SPECS.find((s) => s.id === id)!;
  const exe = resolveToolExe(id, cfg);
  const base: ToolStatus = { id, label: spec.label, path: '', version: '', ok: false, error: '' };
  if (!exe) return { ...base, error: `未在 PATH 中找到 ${spec.commands.join(' / ')}` };
  const { version, error } = readVersion(exe, spec.versionArgs);
  if (error || !version) return { ...base, path: exe, error: error || '无法读取版本' };
  const shownPath = spec.kind === 'home' ? homeFromExe(exe) : exe;
  return { id, label: spec.label, path: shownPath, version, ok: true, error: '' };
}

/** 全量探测：返回可直接写回配置的建议值 + 每项状态 */
export function detectDevEnv(): { suggested: Partial<DevEnvConfig>; tools: ToolStatus[] } {
  const tools = TOOL_SPECS.map((s) => probeTool(s.id));
  const suggested: Partial<DevEnvConfig> = {};
  const by = (id: ToolId) => tools.find((t) => t.id === id);
  const java = by('java'); if (java?.ok) suggested.javaHome = java.path;
  const maven = by('maven'); if (maven?.ok) suggested.mavenHome = maven.path;
  const python = by('python'); if (python?.ok) suggested.pythonPath = python.path;
  const node = by('node'); if (node?.ok) suggested.nodePath = node.path;
  const git = by('git'); if (git?.ok) suggested.gitPath = git.path;
  return { suggested, tools };
}

// ======================== 子进程环境 ========================

/**
 * 构造注入了开发环境的子进程 env：
 * - 把 JDK/bin、Maven/bin、Python/Node/Git 所在目录前置到 PATH（避免 PATH 里根本没有 mvn）
 * - 显式设置 JAVA_HOME / M2_HOME / MAVEN_HOME
 * - 追加用户自定义 extraEnv
 */
export function buildSpawnEnv(cfg: DevEnvConfig = loadDevEnv()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const prepend: string[] = [];

  if (cfg.javaHome) {
    env.JAVA_HOME = cfg.javaHome;
    const bin = path.join(cfg.javaHome, 'bin');
    if (fs.existsSync(bin)) prepend.push(bin);
  }
  if (cfg.mavenHome) {
    env.M2_HOME = cfg.mavenHome;
    env.MAVEN_HOME = cfg.mavenHome;
    const bin = path.join(cfg.mavenHome, 'bin');
    if (fs.existsSync(bin)) prepend.push(bin);
  }
  for (const p of [cfg.pythonPath, cfg.nodePath, cfg.gitPath]) {
    if (p && fs.existsSync(p)) prepend.push(path.dirname(p));
  }
  if (cfg.javaOpts.trim()) env.JAVA_OPTS = cfg.javaOpts.trim();
  if (cfg.mavenOpts.trim()) env.MAVEN_OPTS = cfg.mavenOpts.trim();

  if (prepend.length) {
    const sep = path.delimiter;
    const existing = env.PATH || env.Path || '';
    env.PATH = [...prepend, ...existing.split(sep).filter(Boolean)].join(sep);
    if (IS_WIN) env.Path = env.PATH;
  }
  for (const [k, v] of Object.entries(cfg.extraEnv || {})) {
    if (k && v) env[k] = v;
  }
  return env;
}
