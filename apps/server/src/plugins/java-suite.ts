// java-suite 插件：Java 主流开发环境套件
// 集成 Maven / Gradle / Spring Boot / Java Debug / 测试运行 / 代码格式化 / Lombok / MyBatis
// 工具暴露给 AI，配合「Java 开发助手」智能体，用户描述需求即可自动执行
import type { BuiltInTool, McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname, extname, relative, delimiter } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
// ★ 宿主能力走宿主桥（mode-pluginization，见 computer-use.ts 同款注释）。
import { buildSpawnEnv, dataDir, resolveToolExe, runCmd } from '../host-bridge.js';

export const JAVA_SUITE_ID = 'java-suite';

// ============================================================
// 插件清单
// ============================================================
export const javaSuiteManifest: PluginManifest = {
  id: JAVA_SUITE_ID,
  name: 'Java 开发套件',
  version: '1.1.0',
  category: '功能',
  description:
    'Java 主流开发环境：Maven/Gradle 构建管理、Spring Boot 项目分析、Java 调试（JDWP + JDK JDI）、JUnit 测试运行、代码格式化、Lombok/MyBatis 支持。对话中可让 Java 开发助手自动完成构建、分析、调试、测试等任务。',
  permissions: ['fs', 'shell', 'network'],
  kind: 'code',
  contributes: {
    tools: [
      // 项目检测
      'java_detect_project',
      'java_find_classes',
      // Maven
      'maven_parse_pom',
      'maven_dependency_tree',
      'maven_exec',
      'maven_effective_pom',
      // Gradle
      'gradle_parse',
      'gradle_tasks',
      'gradle_exec',
      // Spring Boot
      'spring_analyze',
      'spring_list_beans',
      'spring_list_endpoints',
      'spring_parse_config',
      // Java 调试
      'java_debug_launch',
      'java_debug_attach',
      'java_debug_stop',
      'java_debug_set_breakpoint',
      'java_debug_step',
      'java_debug_continue',
      'java_debug_eval',
      'java_debug_status',
      // 测试
      'java_test_run',
      'java_test_list',
      // 格式化
      'java_format',
      // MyBatis
      'mybatis_analyze_mappers',
    ],

    routes: [
      { path: '/java', name: 'java-suite', component: 'views/plugin/JavaSuite.vue', meta: { desktopOnly: true } },
    ],
  },
  config: {
    type: 'object',
    properties: {
      javaHome: { type: 'string', description: 'JAVA_HOME 路径（不设则用环境变量）' },
      mavenHome: { type: 'string', description: 'MAVEN_HOME（不设则用 PATH 中的 mvn）' },
      gradleHome: { type: 'string', description: 'GRADLE_HOME（不设则用 PATH 中的 gradle）' },
      debugPort: { type: 'number', description: '调试默认端口', default: 5005 },
    },
  },
};

// ============================================================
// 辅助函数
// ============================================================
function textResult(text: string): McpCallResult {
  return { content: [{ type: 'text' as const, text }] } as McpCallResult;
}

function runCommand(
  command: string,
  workDir: string,
  timeoutMs = 120000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return runCmd(command, [], {
    cwd: workDir,
    maxBuffer: 20 * 1024 * 1024,
    shell: true,
    timeoutMs,
  }).then((r) => ({
    stdout: r.stdout,
    stderr: r.stderr,
    code: r.code ?? (r.ok ? 0 : 1),
  }));
}

function readFileSafe(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function exists(p: string): boolean { try { return existsSync(p); } catch { return false; } }

// ============================================================
// XML 解析（轻量，不依赖外部库，用于 pom.xml）
// ============================================================
function parseXml(xml: string): Record<string, unknown> {
  // 简易 XML → JSON：足够解析 pom.xml 的依赖/属性/模块
  const result: Record<string, unknown> = {};
  const stack: Array<{ name: string; obj: Record<string, unknown> }> = [{ name: '', obj: result }];
  let i = 0;
  while (i < xml.length) {
    if (xml[i] === '<') {
      if (xml[i + 1] === '?') { i = xml.indexOf('?>', i) + 2; continue; }
      if (xml[i + 1] === '!') { i = xml.indexOf('>', i) + 1; continue; }
      if (xml[i + 1] === '/') {
        const end = xml.indexOf('>', i);
        stack.pop();
        i = end + 1;
        continue;
      }
      const end = xml.indexOf('>', i);
      const tagContent = xml.slice(i + 1, end);
      const name = tagContent.split(/\s/)[0];
      i = end + 1;
      const textStart = i;
      const nextTag = xml.indexOf('<', i);
      const text = xml.slice(textStart, nextTag).trim();
      const obj: Record<string, unknown> = {};
      const parent = stack[stack.length - 1].obj;
      if (parent[name] !== undefined) {
        if (!Array.isArray(parent[name])) parent[name] = [parent[name]];
        (parent[name] as unknown[]).push(text || obj);
      } else {
        parent[name] = text || obj;
      }
      if (!text) stack.push({ name, obj });
    } else {
      i++;
    }
  }
  return result;
}

// ============================================================
// 项目检测
// ============================================================
interface JavaProjectInfo {
  buildTool: 'maven' | 'gradle' | 'none';
  isSpringBoot: boolean;
  isMultiModule: boolean;
  javaVersion?: string;
  springBootVersion?: string;
  projectName?: string;
  projectVersion?: string;
  hasLombok: boolean;
  hasMybatis: boolean;
  hasDockerfile: boolean;
  modules: string[];
  dependencies: Array<{ groupId: string; artifactId: string; version?: string; scope?: string }>;
}

function detectJavaProject(dir: string): JavaProjectInfo {
  const info: JavaProjectInfo = {
    buildTool: 'none',
    isSpringBoot: false,
    isMultiModule: false,
    hasLombok: false,
    hasMybatis: false,
    hasDockerfile: exists(join(dir, 'Dockerfile')),
    modules: [],
    dependencies: [],
  };

  // Maven
  const pomPath = join(dir, 'pom.xml');
  if (exists(pomPath)) {
    info.buildTool = 'maven';
    const pom = readFileSync(pomPath, 'utf8');
    const isSpring = /spring-boot-starter|spring-boot-maven-plugin/.test(pom);
    info.isSpringBoot = isSpring;
    info.hasLombok = /lombok/.test(pom);
    info.hasMybatis = /mybatis|mybatis-plus|tk\.mybatis/.test(pom);
    info.isMultiModule = /<modules>/.test(pom);

    // 提取项目坐标
    const nameMatch = pom.match(/<artifactId>([^<]+)<\/artifactId>/);
    const verMatch = pom.match(/<version>([^<]+)<\/version>/);
    if (nameMatch) info.projectName = nameMatch[1];
    if (verMatch) info.projectVersion = verMatch[1];

    // Java 版本
    const javaVerMatch = pom.match(/<java\.version>([^<]+)<\/java\.version>/) ||
      pom.match(/<maven\.compiler\.release>([^<]+)<\/maven\.compiler\.release>/);
    if (javaVerMatch) info.javaVersion = javaVerMatch[1];

    // Spring Boot 版本
    const sbVerMatch = pom.match(/spring-boot-starter-parent[\s\S]*?<version>([^<]+)<\/version>/);
    if (sbVerMatch) info.springBootVersion = sbVerMatch[1];

    // 提取依赖
    const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?(?:\s*<scope>([^<]+)<\/scope>)?\s*<\/dependency>/g;
    let depMatch;
    while ((depMatch = depRegex.exec(pom)) !== null) {
      info.dependencies.push({
        groupId: depMatch[1],
        artifactId: depMatch[2],
        version: depMatch[3],
        scope: depMatch[4],
      });
    }

    // 多模块
    const moduleRegex = /<module>([^<]+)<\/module>/g;
    let modMatch;
    while ((modMatch = moduleRegex.exec(pom)) !== null) {
      info.modules.push(modMatch[1]);
    }
  }

  // Gradle
  const gradlePath = join(dir, 'build.gradle');
  const gradleKtsPath = join(dir, 'build.gradle.kts');
  if (exists(gradlePath) || exists(gradleKtsPath)) {
    info.buildTool = 'gradle';
    const gradle = readFileSafe(exists(gradlePath) ? gradlePath : gradleKtsPath);
    info.isSpringBoot = /spring-boot|org\.springframework\.boot/.test(gradle);
    info.hasLombok = /lombok/.test(gradle);
    info.hasMybatis = /mybatis|mybatis-plus/.test(gradle);
    const nameMatch = gradle.match(/(?:rootProject\.name|archiveBaseName)\s*=\s*['"]([^'"]+)['"]/);
    if (nameMatch) info.projectName = nameMatch[1];
  }

  return info;
}

// ============================================================
// 查找 Java 类文件
// ============================================================
function findJavaFiles(dir: string, base = ''): Array<{ path: string; className: string; package: string }> {
  const results: Array<{ path: string; className: string; package: string }> = [];
  if (!exists(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...findJavaFiles(fullPath, relPath));
    } else if (entry.name.endsWith('.java')) {
      const content = readFileSafe(fullPath);
      const pkgMatch = content.match(/package\s+([\w.]+)\s*;/);
      const className = entry.name.replace('.java', '');
      results.push({
        path: fullPath,
        className,
        package: pkgMatch ? pkgMatch[1] : '',
      });
    }
  }
  return results;
}

// ============================================================
// Spring Boot 分析
// ============================================================
interface SpringBean {
  className: string;
  annotations: string[];
  type: 'controller' | 'service' | 'repository' | 'component' | 'configuration' | 'bean';
}

interface SpringEndpoint {
  method: string;
  path: string;
  handler: string;
  className: string;
}

function analyzeSpringProject(dir: string): { beans: SpringBean[]; endpoints: SpringEndpoint[]; configs: Record<string, unknown> } {
  const beans: SpringBean[] = [];
  const endpoints: SpringEndpoint[] = [];

  // 查找所有 Java 文件
  const srcDir = join(dir, 'src/main/java');
  const javaFiles = findJavaFiles(srcDir);

  for (const f of javaFiles) {
    const content = readFileSafe(f.path);
    const annotations: string[] = [];
    const annRegex = /@(\w+)/g;
    let annMatch;
    while ((annMatch = annRegex.exec(content)) !== null) {
      annotations.push(annMatch[1]);
    }

    let type: SpringBean['type'] | null = null;
    if (annotations.includes('RestController') || annotations.includes('Controller')) type = 'controller';
    else if (annotations.includes('Service')) type = 'service';
    else if (annotations.includes('Repository') || annotations.includes('Mapper')) type = 'repository';
    else if (annotations.includes('Component')) type = 'component';
    else if (annotations.includes('Configuration')) type = 'configuration';
    else if (annotations.includes('Bean')) type = 'bean';

    if (type) {
      beans.push({ className: f.className, annotations, type });
    }

    // 提取 Endpoint
    const mappingRegex = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*(?:\(\s*(?:value\s*=\s*)?["{]([^"}]*)["}])?/g;
    let mapMatch;
    while ((mapMatch = mappingRegex.exec(content)) !== null) {
      const httpMethod = mapMatch[1].toUpperCase();
      const path = mapMatch[2] || '';
      // 找到对应的方法名
      const afterMapping = content.slice(mapMatch.index + mapMatch[0].length);
      const methodMatch = afterMapping.match(/(?:public|private|protected)\s+\S+\s+(\w+)\s*\(/);
      endpoints.push({
        method: httpMethod === 'REQUEST' ? 'ALL' : httpMethod,
        path,
        handler: methodMatch ? methodMatch[1] : 'unknown',
        className: f.className,
      });
    }
  }

  // 解析 application.yml/properties
  const configPath = join(dir, 'src/main/resources/application.yml') ||
    join(dir, 'src/main/resources/application.properties');
  const configs: Record<string, unknown> = {};
  const ymlPath = join(dir, 'src/main/resources/application.yml');
  const propsPath = join(dir, 'src/main/resources/application.properties');
  if (exists(ymlPath)) {
    configs['application.yml'] = readFileSafe(ymlPath);
  } else if (exists(propsPath)) {
    configs['application.properties'] = readFileSafe(propsPath);
  }

  return { beans, endpoints, configs };
}

// ============================================================
// MyBatis 分析
// ============================================================
function analyzeMyBatisMappers(dir: string): Array<{ mapper: string; namespace: string; statements: Array<{ id: string; type: string; sql: string }> }> {
  const results: Array<{ mapper: string; namespace: string; statements: Array<{ id: string; type: string; sql: string }> }> = [];
  const resourcesDir = join(dir, 'src/main/resources');
  if (!exists(resourcesDir)) return results;

  function scanXml(d: string) {
    if (!exists(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) { scanXml(fullPath); continue; }
      if (!entry.name.endsWith('.xml')) continue;
      const content = readFileSafe(fullPath);
      if (!/<mapper|<select|<insert|<update|<delete/.test(content)) continue;
      const nsMatch = content.match(/namespace="([^"]+)"/);
      const statements: Array<{ id: string; type: string; sql: string }> = [];
      const stmtRegex = /<(select|insert|update|delete)\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
      let stmtMatch;
      while ((stmtMatch = stmtRegex.exec(content)) !== null) {
        statements.push({
          id: stmtMatch[2],
          type: stmtMatch[1],
          sql: stmtMatch[3].trim().slice(0, 200),
        });
      }
      results.push({ mapper: fullPath, namespace: nsMatch ? nsMatch[1] : '', statements });
    }
  }
  scanXml(resourcesDir);
  return results;
}

// ============================================================
// Java 调试会话管理
// ============================================================
interface JavaPauseLocation {
  reason: string;
  thread?: string;
  className?: string;
  method?: string;
  file?: string;
  line?: number;
}

interface DebugSession {
  id: string;
  pid: number | null;
  port: number;
  host: string;
  status: 'launching' | 'running' | 'paused' | 'stopped' | 'terminated';
  breakpoints: Array<{ className: string; line: number }>;
  projectDir: string;
  mainClass?: string;
  startedAt: number;
  launched: boolean;
  helperPid: number | null;
  lastPause: JavaPauseLocation | null;
  lastError: string;
  _helper?: ChildProcess | null;
  _target?: ChildProcess | null;
  _pending?: Map<string, {
    resolve: (value: { ok: boolean; result: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
  _cmdSeq?: number;
}

const debugSessions = new Map<string, DebugSession>();
let pluginStorage: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> } | null = null;

interface JavaHelperBuild {
  java: string;
  classesDir: string;
}

let javaHelperBuild: Promise<JavaHelperBuild> | null = null;
const helperArg = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

function splitProgramArgs(value: unknown): string[] {
  return String(value || '').match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) =>
    part.replace(/^(["'])([\s\S]*)\1$/, '$2'),
  ) || [];
}

function helperSourceFile(): string {
  const candidates = [
    fileURLToPath(new URL('./YanZhiJavaDebugger.java', import.meta.url)),
    fileURLToPath(new URL('../YanZhiJavaDebugger.java', import.meta.url)),
    resolve(process.cwd(), 'apps/server/src/plugins/YanZhiJavaDebugger.java'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Java 调试助手源码缺失（YanZhiJavaDebugger.java）');
}

function ensureJavaDebugHelper(): Promise<JavaHelperBuild> {
  if (!javaHelperBuild) {
    javaHelperBuild = Promise.resolve().then(() => {
      const java = resolveToolExe('java');
      if (!java) throw new Error('未配置 JDK：请到「设置 → 开发环境」选择包含 java 的 JDK 目录');
      const javac = join(dirname(java), process.platform === 'win32' ? 'javac.exe' : 'javac');
      if (!existsSync(javac)) {
        throw new Error(`当前 JDK 缺少 javac：${javac}。JDI 轻量调试需要完整 JDK，而不是仅 JRE`);
      }
      const sourceFile = helperSourceFile();
      const source = readFileSync(sourceFile);
      const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
      const classesDir = join(dataDir, 'java-debug-helper', hash);
      const classFile = join(classesDir, 'YanZhiJavaDebugger.class');
      if (!existsSync(classFile)) {
        mkdirSync(classesDir, { recursive: true });
        const compiled = spawnSync(javac, [
          '--add-modules', 'jdk.jdi',
          '-encoding', 'UTF-8',
          '-d', classesDir,
          sourceFile,
        ], {
          encoding: 'utf8',
          windowsHide: true,
          env: buildSpawnEnv(),
          timeout: 60_000,
        });
        if (compiled.status !== 0 || !existsSync(classFile)) {
          throw new Error(`Java 调试助手编译失败：${(compiled.stderr || compiled.stdout || '').trim().slice(0, 1200)}`);
        }
      }
      return { java, classesDir };
    }).catch((error) => {
      javaHelperBuild = null;
      throw error;
    });
  }
  return javaHelperBuild;
}

function decodeHelperEvent(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sendJavaHelper(
  session: DebugSession,
  command: string,
  ...args: string[]
): Promise<{ ok: boolean; result: string }> {
  const helper = session._helper;
  const input = helper?.stdin;
  if (!helper || helper.killed || !input?.writable) {
    return Promise.reject(new Error('Java 调试助手未连接'));
  }
  const id = String((session._cmdSeq || 0) + 1);
  session._cmdSeq = Number(id);
  return new Promise((resolveCommand, rejectCommand) => {
    const timer = setTimeout(() => {
      session._pending?.delete(id);
      rejectCommand(new Error(`Java 调试命令超时：${command}`));
    }, 20_000);
    session._pending?.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
    input.write([id, command, ...args].join('\t') + '\n');
  });
}

async function attachJavaDebugHelper(session: DebugSession): Promise<void> {
  const { java, classesDir } = await ensureJavaDebugHelper();
  const helper = spawn(java, [
    '--add-modules', 'jdk.jdi',
    '-cp', classesDir,
    'YanZhiJavaDebugger',
    session.host,
    String(session.port),
  ], {
    cwd: session.projectDir || process.cwd(),
    env: buildSpawnEnv(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  session._helper = helper;
  session.helperPid = helper.pid ?? null;
  session._pending = new Map();
  session._cmdSeq = 0;

  const attached = new Promise<void>((resolveAttached, rejectAttached) => {
    const timer = setTimeout(() => rejectAttached(new Error('Java 调试助手连接 JDWP 超时')), 20_000);
    const stdout = createInterface({ input: helper.stdout! });
    stdout.on('line', (line) => {
      const message = decodeHelperEvent(line);
      if (!message) return;
      if (message.event === 'attached') {
        clearTimeout(timer);
        resolveAttached();
        return;
      }
      if (message.event === 'paused') {
        session.status = 'paused';
        session.lastPause = {
          reason: String(message.reason || 'breakpoint'),
          thread: typeof message.thread === 'string' ? message.thread : undefined,
          className: typeof message.class === 'string' ? message.class : undefined,
          method: typeof message.method === 'string' ? message.method : undefined,
          file: typeof message.file === 'string' ? message.file : undefined,
          line: typeof message.line === 'string' ? Number(message.line) : undefined,
        };
        return;
      }
      if (message.event === 'exited' || message.event === 'disconnect') {
        session.status = 'terminated';
        return;
      }
      if (typeof message.id === 'string') {
        const pending = session._pending?.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        session._pending!.delete(message.id);
        const response = {
          ok: !!message.ok,
          result: String(message.result ?? ''),
        };
        if (response.ok) pending.resolve(response);
        else pending.reject(new Error(response.result || 'Java 调试命令失败'));
      }
    });
  });

  helper.stderr?.on('data', (chunk: Buffer) => {
    session.lastError = chunk.toString('utf8').trim().slice(0, 2000);
  });
  helper.once('error', (error) => {
    session.lastError = error.message;
    session.status = 'terminated';
  });
  helper.once('exit', (code) => {
    for (const pending of session._pending?.values() || []) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Java 调试助手已退出（${code ?? 'unknown'}）${session.lastError ? `：${session.lastError}` : ''}`));
    }
    session._pending?.clear();
    if (session.status !== 'paused') session.status = 'terminated';
  });

  await attached;
}

function stopJavaHelper(session: DebugSession): void {
  try {
    session._helper?.stdin?.write('0\tstop\n');
  } catch {
    // ignore
  }
  try {
    session._helper?.kill();
  } catch {
    // ignore
  }
  session._helper = null;
  session.status = 'terminated';
}

// ============================================================
// 工具定义
// ============================================================
export function makeJavaSuiteTools(): BuiltInTool[] {
  return [
    // ==================== 项目检测 ====================
    {
      name: 'java_detect_project',
      description: '检测 Java 项目类型：构建工具（Maven/Gradle）、Spring Boot、Lombok、MyBatis、Java 版本、依赖列表、多模块结构',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录绝对路径' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const info = detectJavaProject(String(args.dir));
        return textResult(JSON.stringify(info, null, 2));
      },
    },
    {
      name: 'java_find_classes',
      description: '查找项目中的 Java 类文件（包名、类名、路径）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          pattern: { type: 'string', description: '类名匹配模式（可选）' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const srcDir = join(String(args.dir), 'src/main/java');
        let classes = findJavaFiles(srcDir);
        if (args.pattern) {
          const p = String(args.pattern);
          classes = classes.filter((c) => c.className.includes(p) || c.package.includes(p));
        }
        return textResult(JSON.stringify(classes.map((c) => ({
          className: c.className,
          package: c.package,
          path: c.path,
        })), null, 2));
      },
    },

    // ==================== Maven ====================
    {
      name: 'maven_parse_pom',
      description: '解析 pom.xml：项目坐标、依赖、插件、属性、模块、parent',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录（含 pom.xml）' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const pomPath = join(String(args.dir), 'pom.xml');
        if (!exists(pomPath)) return textResult('pom.xml 不存在');
        const pom = readFileSync(pomPath, 'utf8');
        const parsed = parseXml(pom);
        return textResult(JSON.stringify(parsed.project || parsed, null, 2));
      },
    },
    {
      name: 'maven_dependency_tree',
      description: '获取 Maven 依赖树（mvn dependency:tree）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          scope: { type: 'string', description: '过滤 scope（compile/test/runtime/provided）' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const cmd = args.scope
          ? `mvn dependency:tree -Dscope=${args.scope} -q`
          : 'mvn dependency:tree -q';
        const r = await runCommand(cmd, String(args.dir), 120000);
        return textResult(r.stdout || r.stderr || '无输出');
      },
    },
    {
      name: 'maven_exec',
      description: '执行 Maven 命令（如 clean/package/install/compile/test-compile 等）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          goals: { type: 'string', description: 'Maven goals（如 clean package -DskipTests）' },
          timeout: { type: 'number', description: '超时 ms（默认 300000）' },
        },
        required: ['dir', 'goals'],
      },
      execute: async (args) => {
        const cmd = `mvn ${args.goals}`;
        const r = await runCommand(cmd, String(args.dir), (args.timeout as number) || 300000);
        const output = (r.stdout + '\n' + r.stderr).trim();
        return textResult(`[exit=${r.code}]\n${output}`);
      },
    },
    {
      name: 'maven_effective_pom',
      description: '获取 effective POM（mvn help:effective-pom），展开继承/插件管理后的完整 POM',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const r = await runCommand('mvn help:effective-pom -q', String(args.dir), 120000);
        return textResult(r.stdout || r.stderr || '无输出');
      },
    },

    // ==================== Gradle ====================
    {
      name: 'gradle_parse',
      description: '解析 build.gradle / build.gradle.kts：项目信息、依赖、插件、仓库',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const dir = String(args.dir);
        const gradlePath = exists(join(dir, 'build.gradle.kts')) ? join(dir, 'build.gradle.kts') : join(dir, 'build.gradle');
        if (!exists(gradlePath)) return textResult('build.gradle 不存在');
        const content = readFileSync(gradlePath, 'utf8');
        // 提取关键信息
        const plugins: string[] = [];
        const deps: string[] = [];
        const pluginRegex = /id\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = pluginRegex.exec(content)) !== null) plugins.push(m[1]);
        const depRegex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^'"]+)['"]/g;
        while ((m = depRegex.exec(content)) !== null) deps.push(m[1]);
        return textResult(JSON.stringify({ file: basename(gradlePath), plugins, dependencies: deps, raw: content.slice(0, 5000) }, null, 2));
      },
    },
    {
      name: 'gradle_tasks',
      description: '列出 Gradle 可用 task（gradle tasks）',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const r = await runCommand('gradle tasks --all', String(args.dir), 60000);
        return textResult(r.stdout || r.stderr || '无输出');
      },
    },
    {
      name: 'gradle_exec',
      description: '执行 Gradle task（如 build/clean/assemble/test 等）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          tasks: { type: 'string', description: 'Gradle tasks（如 clean build -x test）' },
          timeout: { type: 'number', description: '超时 ms' },
        },
        required: ['dir', 'tasks'],
      },
      execute: async (args) => {
        const cmd = `gradle ${args.tasks}`;
        const r = await runCommand(cmd, String(args.dir), (args.timeout as number) || 300000);
        return textResult(`[exit=${r.code}]\n${r.stdout}\n${r.stderr}`);
      },
    },

    // ==================== Spring Boot ====================
    {
      name: 'spring_analyze',
      description: '分析 Spring Boot 项目：Bean 列表（Controller/Service/Repository/Component）、API Endpoint、配置文件',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const result = analyzeSpringProject(String(args.dir));
        return textResult(JSON.stringify({
          beanCount: result.beans.length,
          endpointCount: result.endpoints.length,
          beans: result.beans,
          endpoints: result.endpoints,
          configs: result.configs,
        }, null, 2));
      },
    },
    {
      name: 'spring_list_beans',
      description: '列出 Spring Bean（按类型过滤：controller/service/repository/component/configuration）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          type: { type: 'string', description: 'Bean 类型过滤（可选）' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const result = analyzeSpringProject(String(args.dir));
        const beans = args.type
          ? result.beans.filter((b) => b.type === args.type)
          : result.beans;
        return textResult(JSON.stringify(beans, null, 2));
      },
    },
    {
      name: 'spring_list_endpoints',
      description: '列出所有 API Endpoint（HTTP 方法、路径、处理类、处理方法）',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const result = analyzeSpringProject(String(args.dir));
        return textResult(JSON.stringify(result.endpoints, null, 2));
      },
    },
    {
      name: 'spring_parse_config',
      description: '读取 Spring Boot 配置文件（application.yml/properties），支持 profile',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          profile: { type: 'string', description: '配置 profile（如 dev/prod，可选）' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const resourcesDir = join(String(args.dir), 'src/main/resources');
        const profile = args.profile ? `-${args.profile}` : '';
        const ymlPath = join(resourcesDir, `application${profile}.yml`);
        const propsPath = join(resourcesDir, `application${profile}.properties`);
        if (exists(ymlPath)) return textResult(readFileSafe(ymlPath));
        if (exists(propsPath)) return textResult(readFileSafe(propsPath));
        return textResult('配置文件不存在');
      },
    },

    // ==================== Java 调试 ====================
    {
      name: 'java_debug_launch',
      description: '启动 Java 调试会话（JDWP 协议）。通过 java -agentlib:jdwp 启动目标程序并挂载调试器。',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          mainClass: { type: 'string', description: '主类全名（如 com.example.Application）' },
          classpath: { type: 'string', description: 'classpath（可选，默认用 mvn 构建产物）' },
          args: { type: 'string', description: '程序参数（可选）' },
          port: { type: 'number', description: '调试端口（默认 5005）' },
        },
        required: ['dir', 'mainClass'],
      },
      execute: async (args) => {
        const dir = String(args.dir);
        const mainClass = String(args.mainClass);
        const port = (args.port as number) || 5005;
        const sessionId = `debug-${Date.now().toString(36)}`;
        try {
          const { java } = await ensureJavaDebugHelper();
          let cp = String(args.classpath || '').trim();
          if (!cp) {
            const cpFile = join(dir, '.yz-debug-classpath');
            await runCommand(
              `mvn dependency:build-classpath -Dmdep.outputFile="${cpFile.replace(/\\/g, '/')}" -q`,
              dir,
              120_000,
            );
            const dependencies = exists(cpFile) ? readFileSafe(cpFile).trim() : '';
            cp = [join(dir, 'target', 'classes'), dependencies].filter(Boolean).join(delimiter);
          }
          if (!cp) throw new Error('无法构建 classpath：请先执行 mvn compile，或显式传 classpath');

          const session: DebugSession = {
            id: sessionId,
            pid: null,
            port,
            host: '127.0.0.1',
            status: 'launching',
            breakpoints: [],
            projectDir: dir,
            mainClass,
            startedAt: Date.now(),
            launched: true,
            helperPid: null,
            lastPause: null,
            lastError: '',
          };
          const target = spawn(java, [
            `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${session.host}:${port}`,
            '-cp', cp,
            mainClass,
            ...splitProgramArgs(args.args),
          ], {
            cwd: dir,
            env: buildSpawnEnv(),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          session._target = target;
          session.pid = target.pid ?? null;
          target.stdout?.on('data', () => {});
          target.stderr?.on('data', (chunk: Buffer) => {
            session.lastError = chunk.toString('utf8').trim().slice(-2000);
          });
          target.once('exit', (code) => {
            if (session.status !== 'paused') session.status = 'terminated';
            session.lastError = session.lastError || `目标进程退出（${code ?? 'unknown'}）`;
          });
          debugSessions.set(sessionId, session);
          await attachJavaDebugHelper(session);
          session.status = 'paused';
          session.lastPause = { reason: 'entry' };
          return textResult(
            `调试会话已启动并暂停在入口: ${sessionId} (pid=${session.pid}, helper=${session.helperPid}, port=${port})\n`
              + '先调用 java_debug_set_breakpoint 设置断点，再调用 java_debug_continue 开始执行。',
          );
        } catch (error) {
          const session = debugSessions.get(sessionId);
          if (session) {
            try { session._target?.kill(); } catch { /* ignore */ }
            session.status = 'terminated';
            debugSessions.delete(sessionId);
          }
          return textResult(`[错误] Java 调试启动失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_attach',
      description: '附加到已运行的 Java 进程（JDWP 端口）',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: '目标主机（默认 127.0.0.1）' },
          port: { type: 'number', description: 'JDWP 端口' },
        },
        required: ['port'],
      },
      execute: async (args) => {
        const port = Number(args.port);
        const host = String(args.host || '127.0.0.1');
        const sessionId = `debug-${Date.now().toString(36)}`;
        const session: DebugSession = {
          id: sessionId,
          pid: null,
          port,
          host,
          status: 'running',
          breakpoints: [],
          projectDir: '',
          startedAt: Date.now(),
          launched: false,
          helperPid: null,
          lastPause: null,
          lastError: '',
        };
        debugSessions.set(sessionId, session);
        try {
          await attachJavaDebugHelper(session);
          session.status = 'running';
          return textResult(`已附加到 ${host}:${port}，会话 ID: ${sessionId}，调试助手 pid=${session.helperPid}`);
        } catch (error) {
          stopJavaHelper(session);
          debugSessions.delete(sessionId);
          return textResult(`[错误] 附加 Java 进程失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_stop',
      description: '停止调试会话',
      inputSchema: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: '调试会话 ID' } },
        required: ['sessionId'],
      },
      execute: async (args) => {
        const session = debugSessions.get(String(args.sessionId));
        if (!session) return textResult('会话不存在');
        stopJavaHelper(session);
        try { session._target?.kill(); } catch { /* ignore */ }
        debugSessions.delete(String(args.sessionId));
        return textResult(`会话 ${args.sessionId} 已停止`);
      },
    },
    {
      name: 'java_debug_set_breakpoint',
      description: '设置断点（类名 + 行号）',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '调试会话 ID' },
          className: { type: 'string', description: '全限定类名' },
          line: { type: 'number', description: '行号' },
        },
        required: ['sessionId', 'className', 'line'],
      },
      execute: async (args) => {
        const session = debugSessions.get(String(args.sessionId));
        if (!session) return textResult('会话不存在');
        const className = String(args.className).trim();
        const line = Math.max(1, Math.floor(Number(args.line)));
        if (!className || !Number.isFinite(line)) return textResult('[错误] className / line 非法');
        try {
          const response = await sendJavaHelper(session, 'break', helperArg(className), String(line));
          session.breakpoints.push({ className, line });
          return textResult(`断点已提交: ${className}:${line}（${response.result}）`);
        } catch (error) {
          return textResult(`[错误] 设置断点失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_step',
      description: '单步执行（step over / step into / step out）',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '调试会话 ID' },
          mode: { type: 'string', description: 'over / into / out' },
        },
        required: ['sessionId'],
      },
      execute: async (args) => {
        const session = debugSessions.get(String(args.sessionId));
        if (!session) return textResult('会话不存在');
        const mode = String(args.mode || 'over').toLowerCase();
        if (mode !== 'over' && mode !== 'into' && mode !== 'out') {
          return textResult('[错误] mode 只能是 over / into / out');
        }
        try {
          const response = await sendJavaHelper(session, 'step', mode);
          session.status = 'running';
          return textResult(`单步执行 ${mode}（会话 ${args.sessionId}）：${response.result}`);
        } catch (error) {
          return textResult(`[错误] 单步执行失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_continue',
      description: '继续执行到下一个断点',
      inputSchema: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: '调试会话 ID' } },
        required: ['sessionId'],
      },
      execute: async (args) => {
        const session = debugSessions.get(String(args.sessionId));
        if (!session) return textResult('会话不存在');
        try {
          const response = await sendJavaHelper(session, 'continue');
          session.status = 'running';
          session.lastPause = null;
          return textResult(`继续执行（会话 ${args.sessionId}）：${response.result}`);
        } catch (error) {
          return textResult(`[错误] 继续执行失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_eval',
      description: '在暂停的调试帧中读取值。支持局部变量、this、this.field、array[index]、Type.staticField；复杂表达式会明确拒绝',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '调试会话 ID' },
          expression: { type: 'string', description: '局部变量名、this、this.field、array[index] 或 Type.staticField' },
        },
        required: ['sessionId', 'expression'],
      },
      execute: async (args) => {
        const session = debugSessions.get(String(args.sessionId));
        if (!session) return textResult('会话不存在');
        const expression = String(args.expression || '').trim();
        if (!expression) return textResult('[错误] expression 不能为空');
        try {
          const response = await sendJavaHelper(session, 'eval', helperArg(expression));
          return textResult(`${response.result}`);
        } catch (error) {
          return textResult(`[错误] 求值失败：${(error as Error)?.message || error}`);
        }
      },
    },
    {
      name: 'java_debug_status',
      description: '查看所有活跃调试会话',
      inputSchema: { type: 'object' },
      execute: async () => {
        const sessions = Array.from(debugSessions.values());
        return textResult(JSON.stringify(sessions.map((s) => ({
          id: s.id, pid: s.pid, port: s.port, status: s.status,
          mainClass: s.mainClass, breakpoints: s.breakpoints.length,
          helperPid: s.helperPid, lastPause: s.lastPause, lastError: s.lastError || undefined,
        })), null, 2));
      },
    },

    // ==================== 测试 ====================
    {
      name: 'java_test_run',
      description: '运行 Java 测试（JUnit/TestNG）。支持 Maven（mvn test）和 Gradle（gradle test）。',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          testClass: { type: 'string', description: '指定测试类（可选，不传则运行全部）' },
          testMethod: { type: 'string', description: '指定测试方法（可选）' },
          buildTool: { type: 'string', description: '构建工具 maven/gradle（可选，自动检测）' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const dir = String(args.dir);
        const info = detectJavaProject(dir);
        const tool = args.buildTool as string || info.buildTool;
        let cmd: string;
        if (tool === 'gradle') {
          cmd = 'gradle test';
          if (args.testClass) cmd += ` --tests "${args.testClass}${args.testMethod ? '.' + args.testMethod : ''}"`;
        } else {
          cmd = 'mvn test';
          if (args.testClass) {
            cmd += ` -Dtest=${args.testClass}${args.testMethod ? '#' + args.testMethod : ''}`;
          }
        }
        const r = await runCommand(cmd, dir, 300000);
        // 提取测试结果摘要
        const output = r.stdout + r.stderr;
        const testSummary = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/);
        const summary = testSummary
          ? `\n测试结果: ${testSummary[1]} 总计, ${testSummary[2]} 失败, ${testSummary[3]} 错误, ${testSummary[4]} 跳过`
          : '';
        return textResult(`[exit=${r.code}]${summary}\n\n${output.slice(-3000)}`);
      },
    },
    {
      name: 'java_test_list',
      description: '列出项目中的测试类',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const testDir = join(String(args.dir), 'src/test/java');
        const tests = findJavaFiles(testDir);
        return textResult(JSON.stringify(tests.map((t) => ({
          className: t.className,
          package: t.package,
          path: t.path,
        })), null, 2));
      },
    },

    // ==================== 格式化 ====================
    {
      name: 'java_format',
      description: '格式化 Java 代码（google-java-format 或 spotless）',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录' },
          files: { type: 'string', description: '要格式化的文件/目录（默认 src/main/java）' },
          style: { type: 'string', description: '风格：google（默认）/aosp/palantir' },
        },
        required: ['dir'],
      },
      execute: async (args) => {
        const dir = String(args.dir);
        const target = args.files ? String(args.files) : 'src/main/java';
        const style = args.style || 'google';
        // 尝试 spotless（Maven 插件）或 google-java-format
        const info = detectJavaProject(dir);
        let cmd: string;
        if (info.buildTool === 'maven') {
          cmd = 'mvn spotless:apply -q';
        } else if (info.buildTool === 'gradle') {
          cmd = 'gradle spotlessApply';
        } else {
          cmd = `google-java-format --${style} -i ${target}`;
        }
        const r = await runCommand(cmd, dir, 60000);
        return textResult(`[exit=${r.code}]\n${r.stdout}\n${r.stderr}`);
      },
    },

    // ==================== MyBatis ====================
    {
      name: 'mybatis_analyze_mappers',
      description: '分析 MyBatis Mapper XML：namespace、SQL 语句（select/insert/update/delete）、参数映射',
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录' } },
        required: ['dir'],
      },
      execute: async (args) => {
        const mappers = analyzeMyBatisMappers(String(args.dir));
        return textResult(JSON.stringify(mappers.map((m) => ({
          mapper: basename(m.mapper),
          namespace: m.namespace,
          statementCount: m.statements.length,
          statements: m.statements,
        })), null, 2));
      },
    },
  ];
}

// ============================================================
// 插件入口模块
// ============================================================
export const javaSuiteModule: PluginModule = {
  activate(ctx) {
    pluginStorage = ctx.storage;
    const tools = makeJavaSuiteTools();
    for (const tool of tools) {
      ctx.registerTool(tool);
    }
    // 注册后端路由：供 JavaSuite.vue 前端调用（POST /api/plugin/java-suite/tools）
    ctx.registerBackendRoute((app) => {
      const r = app as {
        post: (path: string, handler: (req: unknown, res: unknown) => void) => void;
      };
      r.post('/tools', async (req, res) => {
        const body = (req as { body: { tool?: string; args?: Record<string, unknown> } }).body;
        const toolName = body.tool;
        const tool = tools.find((t) => t.name === toolName);
        const resp = res as { json: (d: unknown) => void; status: (c: number) => { json: (d: unknown) => void } };
        if (!tool) {
          resp.status(404).json({ error: `工具 ${toolName} 不存在` });
          return;
        }
        try {
          const result = await tool.execute(body.args || {});
          resp.json({ data: result });
        } catch (e: any) {
          resp.status(500).json({ error: e?.message || '工具执行失败' });
        }
      });
    });
    ctx.log('Java 开发套件插件已激活（Maven/Gradle/Spring Boot/Debug/Test/Format/MyBatis）');
  },
  deactivate() {
    for (const session of debugSessions.values()) {
      stopJavaHelper(session);
      try { session._target?.kill(); } catch { /* ignore */ }
    }
    debugSessions.clear();
  },
};
