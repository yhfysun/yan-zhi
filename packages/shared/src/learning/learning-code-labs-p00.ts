import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
  LearningV2CodeLanguage,
} from './v2-types.js';

function task(
  id: string,
  title: string,
  brief: string,
  source: string,
  stdin: string,
  checkpoint: string,
): LearningV2CodeLabTask {
  return {
    id,
    title,
    brief,
    defaultLanguage: 'javascript',
    starterCode: {
      javascript: source,
    } satisfies Partial<Record<LearningV2CodeLanguage, string>>,
    stdin,
    checkpoint,
  };
}

function lab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return {
    title,
    description,
    requiredRuntime: 'node',
    runtimeLabel: 'Node.js 24 / 标准库',
    docsUrl: 'https://nodejs.org/api/',
    installSteps: [
      '运行命令：node main.js；stdin 按 brief 原样提供。',
      'Git 任务会真实调用本机 git；HTTP 任务会在 127.0.0.1 启动真实回环服务。',
      'Docker 任务只验证 Compose、环境变量和启动契约，不声称在本实验内启动容器。',
    ],
    languages: ['javascript'],
    practice,
    apply,
  };
}

export const LEARNING_CODE_LABS_P00: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:Git 与可回滚开发：每次修改都有退路': lab(
    'P00 代码台 02 · 提交、标签与反向提交',
    '在临时仓库中真实创建发布提交与错误提交，再执行 git revert。学习者要观察 revert 如何创建新提交、保留历史，并让文件内容回到安全版本。',
    task(
      'p00-git-safe-revert-guided',
      '跟做：用新提交撤销错误提交',
      'stdin 给出安全文本、错误文本和发布标签。初始化 main 分支，创建发布提交并打标签，再提交故障版本，最后用 git revert 恢复内容；断言原始提交仍是当前 HEAD 的祖先。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const request = JSON.parse(fs.readFileSync(0, 'utf8'));
if (typeof request.safeText !== 'string' || typeof request.badText !== 'string') {
  throw new Error('safeText and badText are required');
}
if (!/^v\d+\.\d+\.\d+$/.test(request.tag || '')) {
  throw new Error('tag must look like v1.2.3');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-git-guided-'));
const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

function git(args) {
  const result = spawnSync(
    'git',
    [
      '-c', 'user.name=P00 Learner',
      '-c', 'user.email=p00@example.test',
      '-c', 'commit.gpgsign=false',
      ...args,
    ],
    { cwd: root, encoding: 'utf8', env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      'git ' + args.join(' ') + ' failed: ' + (result.stderr || result.stdout),
    );
  }
  return result.stdout.trim();
}

try {
  git(['init', '--quiet', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'release.txt'), request.safeText + '\n');
  git(['add', 'release.txt']);
  git(['commit', '--quiet', '-m', 'release: safe version']);
  const safeCommit = git(['rev-parse', 'HEAD']);
  git(['tag', request.tag]);

  fs.writeFileSync(path.join(root, 'release.txt'), request.badText + '\n');
  git(['add', 'release.txt']);
  git(['commit', '--quiet', '-m', 'feat: broken behavior']);
  const badCommit = git(['rev-parse', 'HEAD']);

  git(['revert', '--no-edit', 'HEAD']);
  const current = fs.readFileSync(path.join(root, 'release.txt'), 'utf8').trim();
  const headCommit = git(['rev-parse', 'HEAD']);
  const headParent = git(['rev-parse', 'HEAD^']);
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', safeCommit, 'HEAD'],
    { cwd: root, env },
  );
  const log = git(['log', '--format=%H|%s']).split(/\r?\n/);

  if (current !== request.safeText) throw new Error('revert did not restore content');
  if (headCommit === badCommit) throw new Error('revert did not create a new commit');
  if (headParent !== badCommit) throw new Error('revert parent is not the bad commit');
  if (ancestor.status !== 0) throw new Error('safe release left history');
  if (log.length !== 3) throw new Error('expected three commits after revert');
  if (git(['status', '--porcelain']) !== '') throw new Error('worktree is not clean');

  console.log(JSON.stringify({
    branch: 'main',
    tag: request.tag,
    safeCommit,
    badCommit,
    revertCommit: headCommit,
    historyCount: log.length,
    content: current,
    clean: true,
  }, null, 2));
  console.log('git safe revert verified');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      '{"safeText":"stable-release","badText":"crash-on-start","tag":"v1.0.0"}',
      '输出必须显示三个提交、revertCommit 不同于 badCommit、content 回到 stable-release、clean 为 true，并出现 git safe revert verified。再把 safeText 与 badText 对调，仍应成功但内容证明来自输入。',
    ),
    task(
      'p00-git-history-independent',
      '独立实践：在共享历史中保留可追溯链',
      'stdin 给出发布标签、基线内容和故障内容。真实执行提交、打标签、故障提交与 revert，拒绝硬重置式恢复；输出提交父子关系、祖先检查和标签指向，证明共享分支仍可安全同步。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const request = JSON.parse(fs.readFileSync(0, 'utf8'));
if (request.strategy !== 'revert') {
  throw new Error('shared history requires revert, not reset');
}
if (!request.baseContent || !request.badContent) {
  throw new Error('baseContent and badContent are required');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-git-independent-'));
const fixedEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z',
};

function runGit(args, accepted = [0]) {
  const result = spawnSync(
    'git',
    [
      '-c', 'user.name=P00 Release Bot',
      '-c', 'user.email=release@example.test',
      '-c', 'commit.gpgsign=false',
      ...args,
    ],
    { cwd: root, encoding: 'utf8', env: fixedEnv },
  );
  if (result.error) throw result.error;
  if (!accepted.includes(result.status)) {
    throw new Error(
      'git ' + args.join(' ') + ' exited ' + result.status + ': ' +
      (result.stderr || result.stdout),
    );
  }
  return result.stdout.trim();
}

function commitFile(content, message) {
  fs.writeFileSync(path.join(root, 'service-state.txt'), content + '\n');
  runGit(['add', 'service-state.txt']);
  runGit(['commit', '--quiet', '-m', message]);
  return runGit(['rev-parse', 'HEAD']);
}

try {
  runGit(['init', '--quiet', '-b', 'main']);
  const base = commitFile(request.baseContent, 'release: baseline');
  runGit(['tag', '-a', request.tag, '-m', 'release baseline']);
  const bad = commitFile(request.badContent, 'feat: candidate regression');
  const beforeRevert = runGit(['rev-parse', 'HEAD']);
  if (beforeRevert !== bad) throw new Error('candidate is not at HEAD');

  runGit(['revert', '--no-edit', 'HEAD']);
  const revert = runGit(['rev-parse', 'HEAD']);
  const revertParent = runGit(['rev-parse', 'HEAD^']);
  const current = fs.readFileSync(
    path.join(root, 'service-state.txt'),
    'utf8',
  ).trim();
  const tagCommit = runGit(['rev-list', '-n', '1', request.tag]);
  const baseIsAncestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', base, 'HEAD'],
    { cwd: root, env: fixedEnv },
  ).status === 0;
  const badIsAncestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', bad, 'HEAD'],
    { cwd: root, env: fixedEnv },
  ).status === 0;
  const subjects = runGit(['log', '--reverse', '--format=%s']).split(/\r?\n/);

  if (revert === bad || revertParent !== bad) {
    throw new Error('revert chain is invalid');
  }
  if (current !== request.baseContent) throw new Error('state was not restored');
  if (tagCommit !== base || !baseIsAncestor || !badIsAncestor) {
    throw new Error('history or tag traceability was lost');
  }
  if (subjects.length !== 3 || !subjects[2].startsWith('Revert ')) {
    throw new Error('unexpected commit history');
  }
  if (runGit(['status', '--porcelain']) !== '') {
    throw new Error('worktree is not clean');
  }

  console.log(JSON.stringify({
    strategy: request.strategy,
    base,
    bad,
    revert,
    revertParent,
    tagCommit,
    baseIsAncestor,
    badIsAncestor,
    restored: current,
    subjects,
  }, null, 2));
  console.log('shared history remains traceable');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      '{"strategy":"revert","tag":"v2.0.0","baseContent":"healthy","badContent":"broken"}',
      '输出必须证明 base 与 bad 都是 HEAD 祖先、tagCommit 指向 base、restored 等于 healthy，且第三条提交主题以 Revert 开头。把 strategy 改为 reset 应被拒绝，说明共享分支不能靠改写历史恢复。',
    ),
  ),

  'programming:程序如何运行：源码、编译与进程': lab(
    'P00 代码台 03 · 源码、退出码与进程边界',
    '同一份源码分别经过语法编译检查、父进程读取和 Node 子进程执行。实验把 PID、退出码、标准输出、标准错误和源码摘要串成一条可复核启动链。',
    task(
      'p00-process-lifecycle-guided',
      '跟做：观察父进程与两个子进程',
      '写入一份 Node 程序，分别以成功退出码 0 和 stdin 指定的失败退出码启动。比对父 PID、两个子 PID、运行版本、源码 SHA-256 与 stderr，确认终端命令确实创建了独立进程。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const request = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Number.isInteger(request.failureExit) ||
    request.failureExit < 1 || request.failureExit > 125) {
  throw new Error('failureExit must be between 1 and 125');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-process-guided-'));
const worker = path.join(root, 'worker.mjs');
const source = [
  "const code = Number(process.argv[2]);",
  "const payload = {",
  "  pid: process.pid,",
  "  runtime: process.version,",
  "  executable: process.execPath,",
  "  code,",
  "};",
  "if (code === 0) {",
  "  process.stdout.write(JSON.stringify(payload) + '\\n');",
  "} else {",
  "  process.stderr.write(JSON.stringify(payload) + '\\n');",
  "  process.exitCode = code;",
  "}",
].join('\n');

function spawnWorker(code) {
  return spawnSync(process.execPath, [worker, String(code)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

try {
  fs.writeFileSync(worker, source + '\n', 'utf8');
  const check = spawnSync(process.execPath, ['--check', worker], {
    cwd: root,
    encoding: 'utf8',
  });
  if (check.status !== 0) throw new Error(check.stderr || 'syntax check failed');

  const sourceHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(worker))
    .digest('hex');
  const success = spawnWorker(0);
  const failure = spawnWorker(request.failureExit);
  if (success.status !== 0) throw new Error('success child failed');
  if (failure.status !== request.failureExit) {
    throw new Error('failure exit code was not preserved');
  }

  const successData = JSON.parse(success.stdout.trim());
  const failureData = JSON.parse(failure.stderr.trim());
  if (successData.pid === process.pid || failureData.pid === process.pid) {
    throw new Error('child did not receive a separate PID');
  }
  if (successData.pid === failureData.pid) {
    throw new Error('two executions unexpectedly shared one PID');
  }
  if (successData.runtime !== process.version) {
    throw new Error('child runtime differs from parent');
  }
  if (!path.isAbsolute(successData.executable)) {
    throw new Error('process.execPath must be absolute');
  }

  console.log(JSON.stringify({
    parentPid: process.pid,
    parentRuntime: process.version,
    syntaxCheckExit: check.status,
    successPid: successData.pid,
    successExit: success.status,
    failurePid: failureData.pid,
    failureExit: failure.status,
    sourceHash,
  }, null, 2));
  console.log('source and process evidence verified');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      '{"failureExit":7}',
      '输出必须出现 syntaxCheckExit 0、successExit 0、failureExit 7、三个不同 PID，以及 64 位 sourceHash。把 failureExit 改成 9 后 failureExit 必须同步变成 9，证明退出码来自真实子进程。',
    ),
    task(
      'p00-process-compile-independent',
      '独立实践：先编译语义，再启动制品进程',
      'stdin 给出阶段名、就绪标记和退出码。用 vm.Script 编译并执行纯函数语义模型，再用 node --check 编译检查启动文件并创建真实进程；最后核对源码摘要、编译结果和退出状态。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!/^[a-z][a-z0-9-]{2,31}$/.test(input.stage || '')) {
  throw new Error('stage must be a safe lowercase identifier');
}
if (!Number.isInteger(input.exitCode) || input.exitCode < 0 || input.exitCode > 125) {
  throw new Error('exitCode must be an integer from 0 to 125');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-process-independent-'));
const launcher = path.join(root, 'launch.mjs');
const compiledModel = [
  "'use strict';",
  "globalThis.lifecycle = {",
  "  rawStage: globalThis.input.stage,",
  "  normalizedStage: globalThis.input.stage.trim().toLowerCase(),",
  "  ready: globalThis.input.ready === true,",
  "  requestedExit: globalThis.input.exitCode,",
  "};",
].join('\n');
const launcherSource = [
  "import fs from 'node:fs';",
  "const input = JSON.parse(fs.readFileSync(0, 'utf8'));",
  "const evidence = {",
  "  pid: process.pid,",
  "  stage: input.stage,",
  "  ready: input.ready === true,",
  "  runtime: process.version,",
  "};",
  "if (input.ready === true) {",
  "  process.stdout.write(JSON.stringify(evidence) + '\\n');",
  "}",
  "process.exitCode = input.exitCode;",
].join('\n');

try {
  const context = {
    input: {
      stage: input.stage,
      ready: input.ready,
      exitCode: input.exitCode,
    },
  };
  const script = new vm.Script(compiledModel, {
    filename: 'lifecycle-model.js',
  });
  script.runInNewContext(context, { timeout: 1000 });
  const model = context.lifecycle;
  if (!model || model.normalizedStage !== input.stage ||
      model.ready !== input.ready || model.requestedExit !== input.exitCode) {
    throw new Error('compiled semantic model produced invalid state');
  }

  fs.writeFileSync(launcher, launcherSource + '\n', 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', launcher], {
    cwd: root,
    encoding: 'utf8',
  });
  if (syntax.status !== 0) throw new Error(syntax.stderr || 'compile failed');

  const child = spawnSync(process.execPath, [launcher], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({
      stage: input.stage,
      ready: input.ready,
      exitCode: input.exitCode,
    }),
  });
  if (child.status !== input.exitCode) {
    throw new Error(
      'expected exit ' + input.exitCode + ', got ' + child.status,
    );
  }
  const evidence = input.ready ? JSON.parse(child.stdout.trim()) : null;
  if (evidence) {
    if (evidence.pid === process.pid) throw new Error('launcher reused parent PID');
    if (evidence.stage !== input.stage || evidence.ready !== true) {
      throw new Error('launcher evidence does not match stdin');
    }
  }

  const digest = crypto
    .createHash('sha256')
    .update(launcherSource)
    .digest('hex');
  console.log(JSON.stringify({
    compile: {
      vmScript: 'compiled',
      syntaxCheckExit: syntax.status,
      digest,
    },
    model,
    process: {
      pid: evidence ? evidence.pid : null,
      ready: evidence ? evidence.ready : false,
      exit: child.status,
    },
  }, null, 2));
  console.log('compile-to-process chain verified');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      '{"stage":"bootstrap","ready":true,"exitCode":3}',
      '输出必须包含 vmScript compiled、syntaxCheckExit 0、process.exit 3、process.pid 不同于运行器 PID，以及 compile-to-process chain verified。把 ready 改为 false 后 stdout 不应产生伪进程证据，但退出码仍需保持 3。',
    ),
  ),

  'programming:首次 HTTP 请求：浏览器到服务端': lab(
    'P00 代码台 04 · 回环 HTTP 与请求追踪',
    '在 127.0.0.1 的随机端口启动真实 Node HTTP 服务，用 fetch 和内置代理检查状态码、响应头、正文错误契约与 trace id。所有网络流量只在本机回环。',
    task(
      'p00-http-loopback-guided',
      '跟做：区分成功响应与路由错误',
      'stdin 给出健康检查路径和请求 id。启动真实 HTTP 服务，先请求健康路径并检查 200、JSON 内容类型和回显 id，再请求不存在路径检查 404 与结构化错误正文。',
      String.raw`const fs = require('node:fs');
const http = require('node:http');

const request = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!request.path || !request.path.startsWith('/')) {
  throw new Error('path must start with /');
}
if (!/^[a-zA-Z0-9-]{6,40}$/.test(request.traceId || '')) {
  throw new Error('traceId must contain 6-40 safe characters');
}

const server = http.createServer((req, res) => {
  const traceId = req.headers['x-trace-id'] || 'missing';
  res.setHeader('x-trace-id', String(traceId));
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET' && req.url === request.path) {
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'ok',
      traceId,
      path: request.path,
    }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.url,
    },
  }));
});

(async () => {
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('server address is unavailable');
    }
    const origin = 'http://127.0.0.1:' + address.port;
    const success = await fetch(origin + request.path, {
      headers: { 'x-trace-id': request.traceId },
    });
    const successBody = await success.json();
    const missing = await fetch(origin + '/missing-route', {
      headers: { 'x-trace-id': request.traceId },
    });
    const missingBody = await missing.json();

    if (success.status !== 200) throw new Error('health status was not 200');
    if (!success.headers.get('content-type')?.includes('application/json')) {
      throw new Error('health content type is not JSON');
    }
    if (successBody.status !== 'ok' ||
        successBody.traceId !== request.traceId) {
      throw new Error('success body or trace id mismatch');
    }
    if (missing.status !== 404) throw new Error('missing route was not 404');
    if (missingBody.error?.code !== 'ROUTE_NOT_FOUND') {
      throw new Error('missing route error contract is invalid');
    }

    console.log(JSON.stringify({
      origin,
      request: {
        method: 'GET',
        path: request.path,
        traceId: request.traceId,
      },
      success: {
        status: success.status,
        contentType: success.headers.get('content-type'),
        traceId: success.headers.get('x-trace-id'),
        body: successBody,
      },
      missing: {
        status: missing.status,
        body: missingBody,
      },
    }, null, 2));
    console.log('loopback HTTP responses verified');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      '{"path":"/api/health","traceId":"p00-trace-001"}',
      '输出必须出现随机 127.0.0.1 端口、success.status 200、missing.status 404、traceId 原样回显，并以 loopback HTTP responses verified 结束。把 path 改为重复斜杠或空值应被输入校验拒绝。',
    ),
    task(
      'p00-http-proxy-independent',
      '独立实践：让网关转发并保留状态语义',
      'stdin 给出商品和数量。后端验证 POST 正文，网关通过 http.request 转发并保留 201/422、Location 和 trace id；客户端分别提交合法与非法数量，核对真实本地代理链和结构化错误。',
      String.raw`const fs = require('node:fs');
const http = require('node:http');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!/^[A-Z0-9-]{3,20}$/.test(input.sku || '')) {
  throw new Error('sku must be an uppercase identifier');
}
if (!Number.isInteger(input.quantity) || input.quantity < 1) {
  throw new Error('quantity must be a positive integer');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const backendEvents = [];
const backend = http.createServer(async (req, res) => {
  const traceId = String(req.headers['x-trace-id'] || 'missing');
  backendEvents.push('request:' + req.url);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-trace-id', traceId);
  if (req.method !== 'POST' || req.url !== '/orders') {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: 'ROUTE_NOT_FOUND' } }));
    return;
  }
  try {
    const body = await readJson(req);
    if (!body.sku || !Number.isInteger(body.quantity) || body.quantity < 1) {
      res.statusCode = 422;
      res.end(JSON.stringify({
        error: {
          code: 'INVALID_QUANTITY',
          traceId,
        },
      }));
      return;
    }
    res.statusCode = 201;
    res.setHeader('location', '/orders/' + body.sku);
    res.end(JSON.stringify({
      orderId: body.sku + '-' + body.quantity,
      traceId,
    }));
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: { code: 'INVALID_JSON', traceId } }));
  }
});

const gatewayEvents = [];
const gateway = http.createServer((clientReq, clientRes) => {
  gatewayEvents.push(clientReq.method + ':' + clientReq.url);
  const backendAddress = backend.address();
  if (!backendAddress || typeof backendAddress === 'string') {
    clientRes.writeHead(503, { 'content-type': 'application/json' });
    clientRes.end(JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE' } }));
    return;
  }
  const traceId = String(clientReq.headers['x-trace-id'] || 'missing');
  const forwarded = http.request({
    hostname: '127.0.0.1',
    port: backendAddress.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      'content-type': 'application/json',
      'x-trace-id': traceId,
    },
  }, (backendRes) => {
    clientRes.statusCode = backendRes.statusCode;
    for (const name of ['content-type', 'location', 'x-trace-id']) {
      const value = backendRes.headers[name];
      if (value) clientRes.setHeader(name, value);
    }
    backendRes.pipe(clientRes);
  });
  forwarded.on('error', () => {
    clientRes.statusCode = 502;
    clientRes.end(JSON.stringify({ error: { code: 'UPSTREAM_FAILURE' } }));
  });
  clientReq.pipe(forwarded);
});

(async () => {
  try {
    await listen(backend);
    await listen(gateway);
    const gatewayAddress = gateway.address();
    if (!gatewayAddress || typeof gatewayAddress === 'string') {
      throw new Error('gateway address is unavailable');
    }
    const origin = 'http://127.0.0.1:' + gatewayAddress.port;
    const post = (body, traceId) => fetch(origin + '/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify(body),
    });

    const valid = await post({
      sku: input.sku,
      quantity: input.quantity,
    }, 'p00-proxy-valid');
    const validBody = await valid.json();
    const invalid = await post({
      sku: input.sku,
      quantity: -1,
    }, 'p00-proxy-invalid');
    const invalidBody = await invalid.json();

    if (valid.status !== 201) throw new Error('valid order did not return 201');
    if (valid.headers.get('location') !== '/orders/' + input.sku) {
      throw new Error('location header was lost');
    }
    if (valid.headers.get('x-trace-id') !== 'p00-proxy-valid' ||
        validBody.traceId !== 'p00-proxy-valid') {
      throw new Error('trace id was lost through proxy');
    }
    if (invalid.status !== 422 ||
        invalidBody.error?.code !== 'INVALID_QUANTITY') {
      throw new Error('invalid order contract did not survive proxy');
    }
    if (backendEvents.length !== 2 || gatewayEvents.length !== 2) {
      throw new Error('unexpected proxy request count');
    }

    console.log(JSON.stringify({
      origin,
      gatewayEvents,
      backendEvents,
      valid: {
        status: valid.status,
        location: valid.headers.get('location'),
        traceId: valid.headers.get('x-trace-id'),
      },
      invalid: {
        status: invalid.status,
        error: invalidBody.error,
      },
    }, null, 2));
    console.log('gateway HTTP chain verified');
  } finally {
    await close(gateway);
    await close(backend);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      '{"sku":"BOOK-001","quantity":2}',
      '输出必须显示 gatewayEvents 与 backendEvents 各两条、valid.status 201、合法 Location、invalid.status 422，且两个不同 trace id 被保留。修改 sku 为小写或数量为 0 时，应在启动服务前失败。',
    ),
  ),

  'programming:从空目录搭建项目与 Docker 本地依赖': lab(
    'P00 代码台 05 · 空目录项目与依赖契约',
    '从临时空目录生成源码、测试、迁移、脚本、环境样例与 Compose 文件，再真实启动项目健康检查。Docker 仅验证依赖声明和健康检查契约，不会把文本检查伪装成容器运行。',
    task(
      'p00-project-bootstrap-guided',
      '跟做：生成最小目录并启动健康服务',
      'stdin 给出项目名、数据库占位地址与健康路径。创建分层目录、package.json、README、迁移和 Compose 契约，真实启动 Node 服务请求健康路径，最后输出目录树和 Docker 模拟边界。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!/^[a-z][a-z0-9-]{2,30}$/.test(input.project || '')) {
  throw new Error('project must be a lowercase identifier');
}
if (!/^postgres:\/\/[^:\s]+:[^@\s]+@[^/\s]+\/[a-z0-9_]+$/.test(input.databaseUrl || '')) {
  throw new Error('databaseUrl must be a placeholder PostgreSQL URL');
}
if (!input.healthPath || !input.healthPath.startsWith('/')) {
  throw new Error('healthPath must start with /');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-project-guided-'));
const files = {
  'package.json': JSON.stringify({
    name: input.project,
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.20.0',
    scripts: { start: 'node src/server.mjs', test: 'node --test' },
  }, null, 2) + '\n',
  '.env.example': 'DATABASE_URL=postgres://app:change-me@127.0.0.1:5432/app\n',
  '.gitignore': '.env\nnode_modules/\ncoverage/\n',
  'README.md': [
    '# ' + input.project,
    '',
    '## Start',
    '1. Copy .env.example to .env.',
    '2. Run pnpm start.',
    '3. GET ' + input.healthPath,
    '',
    '## Local dependency',
    'Run docker compose up -d db, then pnpm start.',
  ].join('\n') + '\n',
  'compose.yaml': [
    'services:',
    '  db:',
    '    image: postgres:16-alpine',
    '    environment:',
    '      POSTGRES_DB: app',
    '      POSTGRES_USER: app',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "pg_isready -U app -d app"]',
    '      interval: 5s',
    '    ports:',
    '      - "127.0.0.1:5432:5432"',
  ].join('\n') + '\n',
  'migrations/.gitkeep': '',
  'tests/.gitkeep': '',
  'src/server.mjs': [
    "import http from 'node:http';",
    "if (!process.env.DATABASE_URL) {",
    "  process.stderr.write('DATABASE_URL is required\\n');",
    "  process.exit(9);",
    "}",
    "const healthPath = process.env.HEALTH_PATH || '/health';",
    "const server = http.createServer((req, res) => {",
    "  if (req.url === healthPath) {",
    "    res.setHeader('content-type', 'application/json');",
    "    res.end(JSON.stringify({ status: 'ok', databaseConfigured: true }));",
    "    return;",
    "  }",
    "  res.statusCode = 404;",
    "  res.end(JSON.stringify({ error: 'not found' }));",
    "});",
    "server.listen(0, '127.0.0.1', () => {",
    "  const address = server.address();",
    "  process.stdout.write(JSON.stringify({",
    "    event: 'ready',",
    "    port: address.port,",
    "    pid: process.pid,",
    "  }) + '\\n');",
    "});",
  ].join('\n') + '\n',
};

function listFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    output.push(relative + (entry.isDirectory() ? '/' : ''));
    if (entry.isDirectory()) output.push(...listFiles(absolute));
  }
  return output.sort();
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: input.databaseUrl,
        HEALTH_PATH: input.healthPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('server startup timed out: ' + stderr));
    }, 5000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timer);
      try {
        const evidence = JSON.parse(stdout.slice(0, newline));
        resolve({ child, evidence });
      } catch (error) {
        child.kill();
        reject(error);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      if (stdout.includes('"event":"ready"')) return;
      clearTimeout(timer);
      reject(new Error('server exited early: ' + code + ' ' + stderr));
    });
  });
}

async function stopServer(child) {
  child.kill();
  await once(child, 'exit');
}

(async () => {
  try {
    for (const [relative, content] of Object.entries(files)) {
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, 'utf8');
    }

    const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
    for (const requiredLine of [
      'postgres:16-alpine',
      'pg_isready -U app -d app',
      '127.0.0.1:5432:5432',
    ]) {
      if (!compose.includes(requiredLine)) {
        throw new Error('compose contract is missing: ' + requiredLine);
      }
    }
    const envExample = fs.readFileSync(
      path.join(root, '.env.example'),
      'utf8',
    );
    if (!envExample.includes('change-me')) {
      throw new Error('environment example must use a placeholder');
    }
    if (fs.existsSync(path.join(root, '.env'))) {
      throw new Error('real environment file must not be generated');
    }

    const { child, evidence } = await startServer();
    try {
      const response = await fetch(
        'http://127.0.0.1:' + evidence.port + input.healthPath,
      );
      const body = await response.json();
      if (response.status !== 200 || body.status !== 'ok' ||
          body.databaseConfigured !== true) {
        throw new Error('generated service health check failed');
      }
      console.log(JSON.stringify({
        project: input.project,
        files: listFiles(root),
        process: evidence,
        health: {
          status: response.status,
          body,
        },
        docker: {
          mode: 'compose-contract-only',
          image: 'postgres:16-alpine',
          containerStarted: false,
        },
      }, null, 2));
      console.log('empty-directory service verified');
    } finally {
      await stopServer(child);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      '{"project":"p00-service","databaseUrl":"postgres://app:local-dev@127.0.0.1:5432/app","healthPath":"/healthz"}',
      '输出必须列出 src/server.mjs、compose.yaml 和迁移目录，health.status 为 200，docker.mode 为 compose-contract-only 且 containerStarted 为 false。删除 DATABASE_URL 的进程测试应退出 9，不能把未配置数据库当成成功。',
    ),
    task(
      'p00-project-rebuild-independent',
      '独立实践：从清单重建并隔离真实配置',
      'stdin 给出项目名、Compose 镜像和必需环境变量。按清单重建项目，验证 .gitignore、README、Compose 健康检查与 package script；缺少数据库变量必须启动失败，配置完整时 node --run start 必须自检通过。',
      String.raw`const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!/^[a-z][a-z0-9-]{2,30}$/.test(input.project || '')) {
  throw new Error('project must be a lowercase identifier');
}
if (!/^postgres:\d+-alpine$/.test(input.composeImage || '')) {
  throw new Error('composeImage must be a pinned alpine PostgreSQL image');
}
if (!Array.isArray(input.requiredEnv) ||
    input.requiredEnv.some((name) => !/^[A-Z][A-Z0-9_]{2,30}$/.test(name))) {
  throw new Error('requiredEnv contains an invalid name');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p00-project-independent-'));
const requiredLiteral = JSON.stringify(input.requiredEnv);
const serverSource = [
  "import http from 'node:http';",
  "const required = " + requiredLiteral + ";",
  "const missing = required.filter((name) => !process.env[name]);",
  "if (missing.length > 0) {",
  "  process.stderr.write('missing=' + missing.join(',') + '\\n');",
  "  process.exit(9);",
  "}",
  "const server = http.createServer((req, res) => {",
  "  res.setHeader('content-type', 'application/json');",
  "  if (req.url === '/ready') {",
  "    res.end(JSON.stringify({ ready: true, env: required }));",
  "    return;",
  "  }",
  "  res.statusCode = 404;",
  "  res.end(JSON.stringify({ error: 'not found' }));",
  "});",
  "server.listen(0, '127.0.0.1', async () => {",
  "  const address = server.address();",
  "  try {",
  "    const response = await fetch(",
  "      'http://127.0.0.1:' + address.port + '/ready',",
  "    );",
  "    const body = await response.json();",
  "    process.stdout.write(JSON.stringify({",
  "      event: 'self-check',",
  "      status: response.status,",
  "      body,",
  "      pid: process.pid,",
  "    }) + '\\n');",
  "    server.close();",
  "  } catch (error) {",
  "    console.error(error);",
  "    process.exitCode = 1;",
  "    server.close();",
  "  }",
  "});",
].join('\n') + '\n';
const projectFiles = {
  'package.json': JSON.stringify({
    name: input.project,
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.20.0',
    scripts: {
      start: 'node src/server.mjs',
      doctor: 'node scripts/doctor.mjs',
    },
  }, null, 2) + '\n',
  '.gitignore': '.env\nnode_modules/\ncoverage/\ndist/\n',
  '.env.example': input.requiredEnv
    .map((name) => name + '=replace-me')
    .join('\n') + '\n',
  'README.md': [
    '# ' + input.project,
    '',
    '## Reproduce',
    '1. Copy .env.example to .env and replace placeholders.',
    '2. Run docker compose up -d db.',
    '3. Run node --run start.',
    '',
    '## Contract',
    'Docker is a local dependency contract, not executed by this lab.',
  ].join('\n') + '\n',
  'compose.yaml': [
    'services:',
    '  db:',
    '    image: ' + input.composeImage,
    '    environment:',
    '      POSTGRES_DB: app',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "pg_isready -U postgres"]',
    '      interval: 3s',
    '      retries: 10',
    '    ports:',
    '      - "127.0.0.1:5432:5432"',
  ].join('\n') + '\n',
  'migrations/001_init.sql': 'CREATE TABLE health(id integer primary key);\n',
  'scripts/doctor.mjs': [
    "import fs from 'node:fs';",
    "for (const file of ['package.json', 'compose.yaml', '.env.example']) {",
    "  if (!fs.existsSync(file)) process.exit(8);",
    "}",
    "console.log('project files present');",
  ].join('\n') + '\n',
  'src/server.mjs': serverSource,
};

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env,
  });
}

try {
  for (const [relative, content] of Object.entries(projectFiles)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, 'utf8');
  }

  const missingEnv = { ...process.env };
  for (const name of input.requiredEnv) delete missingEnv[name];
  const missingDirect = runNode(['src/server.mjs'], missingEnv);
  if (missingDirect.status !== 9 ||
      !missingDirect.stderr.includes('missing=')) {
    throw new Error('direct server process did not exit with code 9');
  }
  const missing = runNode(['--run', 'start'], missingEnv);
  if (missing.status === 0 || !missing.stderr.includes('missing=')) {
    throw new Error('missing environment did not fail closed');
  }

  const completeEnv = { ...process.env };
  for (const name of input.requiredEnv) completeEnv[name] = 'test-value';
  const complete = runNode(['--run', 'start'], completeEnv);
  if (complete.status !== 0) {
    throw new Error('configured start failed: ' + complete.stderr);
  }
  const evidence = JSON.parse(complete.stdout.trim());
  if (evidence.event !== 'self-check' || evidence.status !== 200 ||
      evidence.body.ready !== true) {
    throw new Error('start script self-check is invalid');
  }
  if (evidence.pid === process.pid) {
    throw new Error('project start did not create a child process');
  }

  const doctor = runNode(['--run', 'doctor'], completeEnv);
  if (doctor.status !== 0 ||
      !doctor.stdout.includes('project files present')) {
    throw new Error('project doctor failed');
  }

  const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  if (!compose.includes('image: ' + input.composeImage) ||
      !compose.includes('pg_isready') ||
      !ignore.split(/\r?\n/).includes('.env') ||
      !readme.includes('node --run start') ||
      !readme.includes('Docker is a local dependency contract')) {
    throw new Error('rebuild contract is incomplete');
  }
  if (fs.existsSync(path.join(root, '.env'))) {
    throw new Error('real .env was generated');
  }

  console.log(JSON.stringify({
    project: input.project,
    missingDirectExit: missingDirect.status,
    missingEnvExit: missing.status,
    startExit: complete.status,
    doctorExit: doctor.status,
    selfCheck: evidence,
    dockerContract: {
      image: input.composeImage,
      healthcheck: 'pg_isready',
      containerStarted: false,
    },
  }, null, 2));
  console.log('rebuild and fail-closed startup verified');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      '{"project":"p00-rebuild","composeImage":"postgres:16-alpine","requiredEnv":["DATABASE_URL","SESSION_SECRET"]}',
      '输出必须包含 missingDirectExit 9、missingEnvExit 非零、startExit 0、doctorExit 0、selfCheck.status 200、不同进程 PID，以及 dockerContract.containerStarted false。把 requiredEnv 改成非法名称应在建目录前被拒绝。',
    ),
  ),
};
