import type { LearningV2CodeLab } from './v2-types.js';

/**
 * 编程通识 F0-F1 的真实代码实验室。
 *
 * 课程名与 handwritten/programming-foundations.ts 中的课程键逐字对应。
 * 这里不登记通用模板：每段代码都在应用内生成 main.js，由 Node.js
 * 实际执行；Git 课程通过 child_process 操作临时仓库，算法课程统计
 * 真实执行到的比较、访问和计时结果。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 内置运行时',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    'Node.js 由应用内置，本实验不需要安装第三方 npm 包。',
    '先运行跟做代码，确认退出码为 0，再进入独立实践。',
    '代码只写入系统临时目录；stdin 留空时不会伪造输入或输出。',
  ],
  languages: ['javascript'],
} as const;

export const PROGRAMMING_FOUNDATION_F0_F1_CODE_LABS: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:编程通识 · 计算机、终端与版本控制：操作系统、Shell、PATH 与进程': {
    title: 'F0 代码台 01 · 让父进程和子进程各自作证',
    description:
      '用 Node.js 启动一个真实子进程，观察 pid、ppid、工作目录和 PATH 条目。它不是画一张进程图，而是让父子进程分别输出身份信息并核对退出码。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f0-process-guided',
      title: '跟做：核对父进程与子进程',
      brief:
        '运行命令：node main.js，stdin 留空。代码用 child_process 启动一个 Node 子进程，要求输出的 child ppid 等于当前父进程 pid，child cwd 等于当前工作目录。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const path = require('node:path');

const childScript = \`
console.log(JSON.stringify({
  pid: process.pid,
  ppid: process.ppid,
  cwd: process.cwd(),
  pathEntries: (process.env.PATH || '').split(path.delimiter).length,
  nodeExecutable: process.execPath
}));
\`;

const result = spawnSync(process.execPath, ['-e', childScript], {
  encoding: 'utf8',
  env: { ...process.env }
});

if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'child process failed');
  process.exit(1);
}

const child = JSON.parse(result.stdout.trim());
console.log('parent pid:', process.pid);
console.log('child pid:', child.pid);
console.log('child ppid:', child.ppid);
console.log('parent cwd:', process.cwd());
console.log('child cwd:', child.cwd);
console.log('PATH entries:', child.pathEntries);
console.log('node executable:', child.nodeExecutable);

if (child.pid === process.pid || child.ppid !== process.pid) {
  console.error('父子进程关系不符合预期');
  process.exit(1);
}

if (path.resolve(child.cwd) !== path.resolve(process.cwd())) {
  console.error('子进程没有继承当前工作目录');
  process.exit(1);
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：child pid 与 parent pid 不同，child ppid 恰好等于 parent pid，child cwd 等于 parent cwd，PATH entries 至少为 1，exit 0。若子进程启动错误、ppid 不匹配或 cwd 不一致，实验失败。把包含 pid、cwd 与 exit 的输出保存为本课运行证据。',
    },
    apply: {
      id: 'programming-foundations-f0-process-independent',
      title: '独立实践：验证 PATH 被清空后的命令解析',
      brief:
        '运行命令：node main.js，stdin 留空。先保存原 PATH，再临时清空 PATH 启动命令，观察 ENOENT 或其他失败；随后用 process.execPath 的绝对路径启动同一子进程，证明“命令名”和“可执行文件”不是同一个东西。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env }
  });
}

const originalPath = process.env.PATH || '';
const pathEntries = originalPath.split(path.delimiter).filter(Boolean);
console.log('PATH entries before:', pathEntries.length);
console.log('PATH first entry:', pathEntries[0] || '(empty)');
console.log('current executable:', process.execPath);

process.env.PATH = '';
const missing = run('node', ['--version']);
console.log('empty PATH status:', missing.status);
console.log('empty PATH error code:', missing.error?.code || '(none)');

const absolute = run(process.execPath, ['-e', 'console.log("absolute child ok")']);
console.log('absolute child status:', absolute.status);
console.log('absolute child stdout:', absolute.stdout.trim());

process.env.PATH = originalPath;
console.log('PATH restored:', process.env.PATH === originalPath);

if (absolute.status !== 0) {
  console.error(absolute.stderr || absolute.error?.message || 'absolute child failed');
  process.exit(1);
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：empty PATH 的 node 通常返回非 0 状态或 ENOENT，而 absolute child status 必须是 0，且 stdout 为 absolute child ok。失败边界是修改 PATH 后忘记恢复、子进程使用错误命令或把错误文本当成成功。证据应同时包含空 PATH 失败记录、绝对路径成功记录和 PATH restored true。',
    },
  },

  'programming:编程通识 · 计算机、终端与版本控制：文件、权限、编码与日志': {
    title: 'F0 代码台 02 · 同一个文件，三种读法',
    description:
      '真实创建 UTF-8、UTF-16LE 文件并读取它们的字节与 mode，然后把日志按追加方式写入并只取最后两行。重点不是记命令，而是区分字节、字符和日志流。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f0-files-guided',
      title: '跟做：检查字节、编码和文件 mode',
      brief:
        '运行命令：node main.js，stdin 留空。代码写入中文 UTF-8 文本和 UTF-16LE 文本，分别按正确编码与错误编码读取，再打印文件大小和权限低 9 位。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-files-'));
const utf8File = path.join(dir, 'utf8.txt');
const utf16File = path.join(dir, 'utf16le.txt');

try {
  fs.writeFileSync(utf8File, '你好，终端\\n', 'utf8');
  fs.writeFileSync(utf16File, 'hello 文件', 'utf16le');

  const stat = fs.statSync(utf8File);
  console.log('utf8 mode:', (stat.mode & 0o777).toString(8).padStart(3, '0'));
  console.log('utf8 bytes:', stat.size);
  console.log('utf8 text:', fs.readFileSync(utf8File, 'utf8').trim());

  const wrong = fs.readFileSync(utf16File, 'utf8');
  console.log('utf16 bytes:', fs.statSync(utf16File).size);
  console.log('utf16 read as utf8:', JSON.stringify(wrong));
  console.log('utf16 read correctly:', fs.readFileSync(utf16File, 'utf16le').trim());
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：utf8 text 能还原中文，utf16 read as utf8 会出现替换字符或异常字符，utf16 read correctly 必须还原 hello 文件；mode 输出为 3 位八进制数字。失败边界是只改控制台字体、把显示乱码当成文件已损坏，或把 UTF-16 字节直接当 UTF-8 解码。证据需包含两种正确读法和一次错误读法。',
    },
    apply: {
      id: 'programming-foundations-f0-files-independent',
      title: '独立实践：写日志、试只读并留下尾部证据',
      brief:
        '运行命令：node main.js，stdin 留空。代码创建一个日志文件，追加三类级别日志后只读取尾部两行；再给文件设置只读权限并尝试写入，如实记录是否被操作系统阻断。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-log-'));
const logFile = path.join(dir, 'app.log');

try {
  fs.writeFileSync(logFile, 'INFO boot\\nWARN slow-query\\nERROR timeout\\n', 'utf8');
  fs.appendFileSync(logFile, 'INFO recovered\\n', 'utf8');

  const lines = fs.readFileSync(logFile, 'utf8').trimEnd().split(/\\r?\\n/);
  console.log('last two lines:', JSON.stringify(lines.slice(-2)));
  console.log('line count:', lines.length);

  fs.chmodSync(logFile, 0o444);
  let writeBlocked = false;
  try {
    fs.appendFileSync(logFile, 'SHOULD_NOT_RUN\\n', 'utf8');
  } catch (error) {
    writeBlocked = true;
    console.log('read-only write blocked:', error.code || error.message);
  }
  console.log('read-only write blocked flag:', writeBlocked);
  console.log('tail evidence:', lines.slice(-2).join(' | '));
} finally {
  try { fs.chmodSync(logFile, 0o644); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：last two lines 必须是 ["ERROR timeout","INFO recovered"]，line count 为 4；read-only write blocked flag 可以为 true（权限被真正执行）或 false（当前平台/账户没有阻止写入），但必须如实输出原因。失败边界是把 777 当通用修复、忽略平台权限差异，或只截取 ERROR 一行而丢失时间与上下文。完成证据是最后两行和权限试写结果。',
    },
  },

  'programming:编程通识 · 计算机、终端与版本控制：Git 对象、暂存区与提交': {
    title: 'F0 代码台 03 · 用 Git 对象验证一次提交',
    description:
      '在临时目录初始化真实 Git 仓库，用 hash-object、cat-file、rev-parse 和 show 观察 blob、tree、commit 与暂存区。输出必须来自 Git，不允许用随机字符串伪造哈希。',
    ...nodeRuntime,
    docsUrl: 'https://git-scm.com/book/zh/v2',
    installSteps: [
      '实验由应用内置 Node.js 启动，但 Git 命令必须真实存在于本机 PATH。',
      '先在终端运行 git --version；没有 Git 时，实验会以启动失败结束，而不是伪造对象。',
      '先看跟做输出的 blob 与 commit 类型，再完成独立实践中的未暂存改动。',
    ],
    practice: {
      id: 'programming-foundations-f0-git-guided',
      title: '跟做：追踪一个 blob 到一次 commit',
      brief:
        '运行命令：node main.js，stdin 留空。代码创建临时仓库、写文件、计算 blob、add、commit，再读取对象类型与 HEAD 哈希。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Lab Learner',
      GIT_AUTHOR_EMAIL: 'learner@example.test',
      GIT_COMMITTER_NAME: 'Lab Learner',
      GIT_COMMITTER_EMAIL: 'learner@example.test'
    }
  });
  if (result.status !== 0) {
    throw new Error(\`git \${args.join(' ')}: \${result.stderr || result.error?.message}\`);
  }
  return result.stdout.trim();
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-git-object-'));
try {
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'lesson.txt'), 'lesson=1\\n', 'utf8');

  const blobBeforeAdd = git(dir, ['hash-object', 'lesson.txt']);
  git(dir, ['add', 'lesson.txt']);
  const blobType = git(dir, ['cat-file', '-t', blobBeforeAdd]);
  const commitHash = git(dir, ['commit', '-m', 'initial lesson']);
  const head = git(dir, ['rev-parse', 'HEAD']);

  console.log('blob hash:', blobBeforeAdd);
  console.log('blob object type:', blobType);
  console.log('commit output:', commitHash);
  console.log('HEAD:', head);
  console.log('show stat:', git(dir, ['show', '--stat', 'HEAD']));

  if (blobType !== 'blob' || head.length !== 40) process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：blob object type 为 blob，HEAD 是 40 位十六进制对象名，show stat 能看到 lesson.txt，exit 0。失败边界是 Git 不存在、提交身份未配置、hash-object 没有对应对象，或把未 add 的工作区内容误认为已进入暂存区。把 blob hash、HEAD 和 show stat 作为本课证据。',
    },
    apply: {
      id: 'programming-foundations-f0-git-independent',
      title: '独立实践：证明未 add 的修改不会进入提交',
      brief:
        '运行命令：node main.js，stdin 留空。先提交 base.txt，再修改它但不 stage；随后新增 staged.txt 并 commit。用 show 和 status 证明提交只包含 staged.txt，base.txt 的修改仍留在工作区。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Lab Learner',
      GIT_AUTHOR_EMAIL: 'learner@example.test',
      GIT_COMMITTER_NAME: 'Lab Learner',
      GIT_COMMITTER_EMAIL: 'learner@example.test'
    }
  });
  if (result.status !== 0) {
    throw new Error(\`git \${args.join(' ')}: \${result.stderr || result.error?.message}\`);
  }
  return result.stdout.trim();
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-git-index-'));
try {
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base=v1\\n', 'utf8');
  git(dir, ['add', 'base.txt']);
  git(dir, ['commit', '-m', 'base']);

  fs.appendFileSync(path.join(dir, 'base.txt'), 'working-only=yes\\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'staged.txt'), 'staged=yes\\n', 'utf8');
  git(dir, ['add', 'staged.txt']);
  git(dir, ['commit', '-m', 'add staged file']);

  const show = git(dir, ['show', '--stat', '--oneline', 'HEAD']);
  const status = git(dir, ['status', '--short']);
  console.log('show:', show);
  console.log('status:', status || '(clean)');
  console.log('base still dirty:', status.includes('base.txt'));
  console.log('commit includes staged:', show.includes('staged.txt'));

  if (!status.includes('base.txt') || !show.includes('staged.txt')) process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：show 包含 staged.txt，status 包含 base.txt，base still dirty 为 true，commit includes staged 为 true。失败边界是误把 git add 当成自动提交、只提交 base 或让未 stage 的修改混入提交。完成证据是 show 与 status 两段原始输出。',
    },
  },

  'programming:编程通识 · 计算机、终端与版本控制：分支、合并与冲突恢复': {
    title: 'F0 代码台 04 · 分支指针与冲突恢复',
    description:
      '在两个临时 Git 仓库里分别完成自动合并和冲突合并。冲突任务会故意让 git merge 返回非 0，再人工改写冲突文件、git add、commit，验证分支只是引用而不是目录副本。',
    ...nodeRuntime,
    docsUrl: 'https://git-scm.com/book/zh/v2',
    installSteps: [
      '实验由应用内置 Node.js 启动，并通过 child_process 调用真实 git。',
      '运行前确认 git --version 可用；冲突任务中的非 0 合并退出码是预期边界。',
      '先完成跟做中的自动合并，再运行独立实践的冲突解决。',
    ],
    practice: {
      id: 'programming-foundations-f0-branch-guided',
      title: '跟做：让两个分支各自新增文件再合并',
      brief:
        '运行命令：node main.js，stdin 留空。代码创建 feature 分支新增 feature.txt，回到默认分支新增 main.txt，最后 merge feature，并打印合并提交的两个父提交关系。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(cwd, args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Lab Learner',
      GIT_AUTHOR_EMAIL: 'learner@example.test',
      GIT_COMMITTER_NAME: 'Lab Learner',
      GIT_COMMITTER_EMAIL: 'learner@example.test'
    }
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(\`git \${args.join(' ')}: \${result.stderr || result.error?.message}\`);
  }
  return result;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-git-branch-'));
try {
  git(dir, ['init', '-q']);
  const baseBranch = git(dir, ['branch', '--show-current']).stdout.trim();
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\\n', 'utf8');
  git(dir, ['add', 'base.txt']);
  git(dir, ['commit', '-m', 'base']);

  git(dir, ['checkout', '-q', '-b', 'feature']);
  fs.writeFileSync(path.join(dir, 'feature.txt'), 'feature branch\\n', 'utf8');
  git(dir, ['add', 'feature.txt']);
  git(dir, ['commit', '-m', 'feature work']);

  git(dir, ['checkout', '-q', baseBranch]);
  fs.writeFileSync(path.join(dir, 'main.txt'), 'main branch\\n', 'utf8');
  git(dir, ['add', 'main.txt']);
  git(dir, ['commit', '-m', 'main work']);
  git(dir, ['merge', '--no-edit', 'feature']);

  const parents = git(dir, ['rev-list', '--parents', '-n', '1', 'HEAD']).stdout.trim().split(/\\s+/);
  console.log('base branch:', baseBranch);
  console.log('merge commit:', parents[0]);
  console.log('parent count:', parents.length - 1);
  console.log('files:', fs.readdirSync(dir).filter((name) => name.endsWith('.txt')).sort().join(', '));
  console.log(git(dir, ['log', '--oneline', '--graph', '--all']).stdout.trim());

  if (parents.length - 1 !== 2) process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：parent count 为 2，文件列表同时包含 base.txt、feature.txt、main.txt，log 图中能看到合并节点。失败边界是分支切换丢文件、忘记 commit 就 merge，或把 merge 只看成“复制文件”。完成证据是 merge commit、parent count 和文件列表。',
    },
    apply: {
      id: 'programming-foundations-f0-branch-independent',
      title: '独立实践：解决同一行的真实冲突',
      brief:
        '运行命令：node main.js，stdin 留空。两个分支修改 config.txt 同一行，merge 必须返回非 0 并留下冲突标记；随后将内容改成 resolved，git add 后完成合并，打印冲突状态变化。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(cwd, args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Lab Learner',
      GIT_AUTHOR_EMAIL: 'learner@example.test',
      GIT_COMMITTER_NAME: 'Lab Learner',
      GIT_COMMITTER_EMAIL: 'learner@example.test'
    }
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(\`git \${args.join(' ')}: \${result.stderr || result.error?.message}\`);
  }
  return result;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-git-conflict-'));
try {
  git(dir, ['init', '-q']);
  const baseBranch = git(dir, ['branch', '--show-current']).stdout.trim();
  const config = path.join(dir, 'config.txt');
  fs.writeFileSync(config, 'mode=base\\n', 'utf8');
  git(dir, ['add', 'config.txt']);
  git(dir, ['commit', '-m', 'base config']);

  git(dir, ['checkout', '-q', '-b', 'feature']);
  fs.writeFileSync(config, 'mode=feature\\n', 'utf8');
  git(dir, ['commit', '-am', 'feature mode']);

  git(dir, ['checkout', '-q', baseBranch]);
  fs.writeFileSync(config, 'mode=main\\n', 'utf8');
  git(dir, ['commit', '-am', 'main mode']);

  const merge = git(dir, ['merge', 'feature'], true);
  const conflictText = fs.readFileSync(config, 'utf8');
  console.log('merge status:', merge.status);
  console.log('conflict markers:', conflictText.includes('<<<<<<<') && conflictText.includes('======='));
  console.log('unmerged before:', git(dir, ['diff', '--name-only', '--diff-filter=U']).stdout.trim() || '(none)');

  fs.writeFileSync(config, 'mode=resolved\\n', 'utf8');
  git(dir, ['add', 'config.txt']);
  git(dir, ['commit', '-m', 'resolve mode conflict']);
  console.log('resolved content:', fs.readFileSync(config, 'utf8').trim());
  console.log('unmerged after:', git(dir, ['diff', '--name-only', '--diff-filter=U']).stdout.trim() || '(none)');
  console.log(git(dir, ['log', '--oneline', '--graph', '--all']).stdout.trim());

  if (merge.status === 0 || !conflictText.includes('<<<<<<<')) process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：merge status 为非 0，conflict markers 为 true，unmerged before 包含 config.txt，resolved content 为 mode=resolved，unmerged after 为 (none)。失败边界是看到冲突标记就直接删掉一方、忘记 git add，或用 reset --hard 代替语义解决。完成证据是冲突标记检查、unmerged 前后状态和解决后的内容。',
    },
  },

  'programming:编程通识 · 计算机、终端与版本控制：包管理器与版本锁定': {
    title: 'F0 代码台 05 · 让本地依赖生成并复现锁文件',
    description:
      '用真实 npm 处理一个本地 file: 依赖，先生成 package-lock.json，再读出锁定版本。实验不依赖网络，重点观察声明版本、锁文件与可复现安装之间的关系。',
    ...nodeRuntime,
    docsUrl: 'https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json',
    installSteps: [
      '实验由应用内置 Node.js 启动，并调用本机 npm；不需要联网。',
      '本地依赖使用 file:./dep，npm 只解析临时目录里的包。',
      '先看 lockfile 是否生成，再运行独立实践核对声明版本与锁定版本。',
    ],
    practice: {
      id: 'programming-foundations-f0-package-guided',
      title: '跟做：生成并读取 package-lock.json',
      brief:
        '运行命令：node main.js，stdin 留空。代码创建 root 与 dep 两个本地包，执行 npm install --package-lock-only --offline，然后读取 lockfile 中的依赖版本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-npm-lock-'));
const depDir = path.join(dir, 'dep');
const npm = 'npm';

function runNpm(args) {
  return spawnSync(npm, args, {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_cache: path.join(dir, '.npm-cache'),
      npm_config_audit: 'false',
      npm_config_fund: 'false'
    }
  });
}

try {
  fs.mkdirSync(depDir);
  fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
    name: 'local-lock-demo',
    version: '1.2.3',
    private: true
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'lock-lab',
    version: '1.0.0',
    private: true,
    dependencies: { 'local-lock-demo': 'file:./dep' }
  }, null, 2));

  const version = runNpm(['--version']);
  if (version.status !== 0) throw new Error(version.stderr || version.error?.message || 'npm unavailable');
  const install = runNpm(['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  if (install.status !== 0) throw new Error(install.stderr || install.stdout || 'npm install failed');

  const lockPath = path.join(dir, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const lockedVersion = lock.packages?.['node_modules/local-lock-demo']?.version
    || lock.packages?.['dep']?.version;
  console.log('npm version:', version.stdout.trim());
  console.log('lockfile exists:', fs.existsSync(lockPath));
  console.log('declared:', JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies['local-lock-demo']);
  console.log('locked version:', lockedVersion);
  console.log('lockfileVersion:', lock.lockfileVersion);

  if (!fs.existsSync(lockPath) || lockedVersion !== '1.2.3') process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：lockfile exists 为 true，declared 为 file:./dep，locked version 为 1.2.3，npm install 的 exit 为 0。失败边界是 npm 不在 PATH、联网解析外部包、只有 package.json 而没有 lockfile，或把范围字符串当成确定版本。完成证据是 npm version、lockfile exists、locked version 和 lockfileVersion。',
    },
    apply: {
      id: 'programming-foundations-f0-package-independent',
      title: '独立实践：比较 install 与 npm ci 的锁文件行为',
      brief:
        '运行命令：node main.js，stdin 留空。代码先生成锁文件，再读取锁定版本；随后用 npm ci 尝试按锁文件安装，并把结果与未锁定的声明版本对照。重点看 npm ci 是否要求锁文件完全匹配。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-npm-ci-'));
const depDir = path.join(dir, 'dep');
const npm = 'npm';

function npmRun(args) {
  return spawnSync(npm, args, {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_cache: path.join(dir, '.npm-cache'),
      npm_config_audit: 'false',
      npm_config_fund: 'false'
    }
  });
}

try {
  fs.mkdirSync(depDir);
  fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
    name: 'local-lock-demo',
    version: '2.0.0',
    private: true
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'ci-lock-lab',
    version: '1.0.0',
    private: true,
    dependencies: { 'local-lock-demo': 'file:./dep' }
  }, null, 2));

  const install = npmRun(['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  if (install.status !== 0) throw new Error(install.stderr || install.stdout || 'npm install failed');
  const lockBefore = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  const locked = lockBefore.packages['node_modules/local-lock-demo']?.version
    || lockBefore.packages.dep?.version;

  const ci = npmRun(['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  console.log('declared spec:', 'file:./dep');
  console.log('locked version:', locked);
  console.log('npm ci status:', ci.status);
  console.log('npm ci stderr empty:', !ci.stderr.trim());
  console.log('node_modules present:', fs.existsSync(path.join(dir, 'node_modules')));

  if (ci.status !== 0) {
    console.log('ci boundary:', ci.stderr.trim().split(/\\r?\\n/)[0]);
  }
  if (locked !== '2.0.0') process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：lockfile 中的 locked version 为 2.0.0；npm ci status 为 0，并且 node_modules present 为 true（本机 npm 若限制本地 file 依赖，必须打印 ci boundary，不能把失败改写成成功）。失败边界是删除锁文件后仍宣称可复现、把 npm install 与 npm ci 当成等价，或忽略 CI 的非 0 状态。完成证据是锁定版本、ci status 与 node_modules 的存在状态。',
    },
  },

  'programming:编程通识 · 计算机、终端与版本控制：编辑器、终端与远程开发': {
    title: 'F0 代码台 06 · 用子进程模拟一次远程环境卡',
    description:
      '在临时目录启动一个带独立工作目录和环境变量的 Node 子进程，像远程开发一样分别打印本地与“远端”的 cwd、配置文件和用户标记。重点是先确认代码到底在哪一边运行。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f0-remote-guided',
      title: '跟做：比较本地与子进程的工作目录',
      brief:
        '运行命令：node main.js，stdin 留空。代码在子目录 remote-work 中启动子进程，传入 REMOTE_DEMO=1，父进程和子进程分别打印 cwd、platform 与环境标记。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-remote-'));
const remoteDir = path.join(dir, 'remote-work');
fs.mkdirSync(remoteDir);

const childScript = \`
console.log(JSON.stringify({
  cwd: process.cwd(),
  platform: process.platform,
  remote: process.env.REMOTE_DEMO || '',
  user: process.env.USERNAME || process.env.USER || '(unknown)'
}));
\`;

try {
  const childResult = spawnSync(process.execPath, ['-e', childScript], {
    cwd: remoteDir,
    encoding: 'utf8',
    env: { ...process.env, REMOTE_DEMO: '1' }
  });
  if (childResult.status !== 0) {
    throw new Error(childResult.stderr || childResult.error?.message || 'child failed');
  }
  const child = JSON.parse(childResult.stdout.trim());
  console.log('local cwd:', process.cwd());
  console.log('remote cwd:', child.cwd);
  console.log('same cwd:', path.resolve(process.cwd()) === path.resolve(child.cwd));
  console.log('remote marker:', child.remote);
  console.log('platform:', child.platform);
  console.log('remote user:', child.user);

  if (path.resolve(process.cwd()) === path.resolve(child.cwd) || child.remote !== '1') {
    process.exit(1);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：local cwd 与 remote cwd 不同，same cwd 为 false，remote marker 为 1，子进程正常退出。失败边界是把编辑器打开的目录当成子进程的 cwd、只看文件名不看进程环境，或把本地路径误当成远端路径。完成证据是两段 cwd、platform 和 remote marker。',
    },
    apply: {
      id: 'programming-foundations-f0-remote-independent',
      title: '独立实践：读取不同工作目录下的同名配置',
      brief:
        '运行命令：node main.js，stdin 留空。父进程写本地 config.json，子进程在 remote-work 中读取相对路径 config.json；两边内容必须不同，才能证明相对路径由 cwd 决定。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0-remote-config-'));
const remoteDir = path.join(dir, 'remote-work');
fs.mkdirSync(remoteDir);
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ source: 'local' }), 'utf8');
fs.writeFileSync(path.join(remoteDir, 'config.json'), JSON.stringify({ source: 'remote' }), 'utf8');

const childScript = \`
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync(path.resolve('config.json'), 'utf8'));
console.log(JSON.stringify({ cwd: process.cwd(), config }));
\`;

try {
  const result = spawnSync(process.execPath, ['-e', childScript], {
    cwd: remoteDir,
    encoding: 'utf8',
    env: { ...process.env, REMOTE_DEMO: '1' }
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'remote child failed');
  const remote = JSON.parse(result.stdout.trim());
  const local = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

  console.log('local config:', JSON.stringify(local));
  console.log('remote config:', JSON.stringify(remote.config));
  console.log('remote cwd:', remote.cwd);
  console.log('relative path resolved:', local.source !== remote.config.source);

  if (remote.config.source !== 'remote' || local.source === remote.config.source) process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：local config 为 {"source":"local"}，remote config 为 {"source":"remote"}，relative path resolved 为 true，remote child exit 0。失败边界是把 ./config.json 误认为始终指向编辑器打开的目录，或不看 cwd 就把相对路径错误归咎于“远端文件不存在”。完成证据是两份配置与 remote cwd。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：复杂度、常数与真实数据规模': {
    title: 'F1 代码台 01 · 线性与二分，把增长量级跑出来',
    description:
      '同一组递增数据上分别执行线性查找与二分查找，统计比较次数并记录耗时。先看计数，再看时间，避免把 Big-O 当成固定毫秒数。',
    ...nodeRuntime,
    docsUrl: 'https://nodejs.org/api/perf_hooks.html',
    practice: {
      id: 'programming-foundations-f1-complexity-guided',
      title: '跟做：统计线性与二分查找的比较次数',
      brief:
        '运行命令：node main.js，stdin 留空。代码对 1,000、10,000、100,000 个递增元素查找最后一个目标，输出两种算法的比较次数和耗时。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function linearSearch(values, target) {
  let checks = 0;
  for (const value of values) {
    checks += 1;
    if (value === target) return { index: checks - 1, checks };
  }
  return { index: -1, checks };
}

function binarySearch(values, target) {
  let low = 0;
  let high = values.length - 1;
  let checks = 0;
  while (low <= high) {
    checks += 1;
    const mid = Math.floor((low + high) / 2);
    if (values[mid] === target) return { index: mid, checks };
    if (values[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return { index: -1, checks };
}

for (const n of [1000, 10000, 100000]) {
  const values = Array.from({ length: n }, (_, index) => index);
  const target = n - 1;

  const linearStart = performance.now();
  const linear = linearSearch(values, target);
  const linearMs = performance.now() - linearStart;

  const binaryStart = performance.now();
  const binary = binarySearch(values, target);
  const binaryMs = performance.now() - binaryStart;

  console.log(JSON.stringify({
    n,
    linearChecks: linear.checks,
    binaryChecks: binary.checks,
    linearMs: Number(linearMs.toFixed(4)),
    binaryMs: Number(binaryMs.toFixed(4)),
    linearIndex: linear.index,
    binaryIndex: binary.index
  }));
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：每个规模的 linearChecks 都等于 n，binaryChecks 都不超过 ceil(log2(n))+1，两种算法都返回 n-1；耗时只作参考，不应断言固定毫秒。失败边界是数据未排序、只比较一次耗时、把 O(log n) 理解成“永远更快”。完成证据是三个规模的 checks 与索引表。',
    },
    apply: {
      id: 'programming-foundations-f1-complexity-independent',
      title: '独立实践：比较排序一次后的二分与哈希预建',
      brief:
        '运行命令：node main.js，stdin 留空。对同一组数据分别计时“排序后二分查找”和“建立 Set 后查找”，统计排序比较次数、建表操作和查询次数，说明一次排序成本何时值得。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function buildDescending(n) {
  return Array.from({ length: n }, (_, index) => n - index);
}

function sortAndSearch(values, target) {
  let comparisons = 0;
  const sorted = [...values].sort((a, b) => {
    comparisons += 1;
    return a - b;
  });
  let low = 0;
  let high = sorted.length - 1;
  let checks = 0;
  while (low <= high) {
    checks += 1;
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] === target) return { checks, comparisons };
    if (sorted[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return { checks, comparisons };
}

function setAndSearch(values, target) {
  let inserts = 0;
  const set = new Set();
  for (const value of values) {
    set.add(value);
    inserts += 1;
  }
  return { found: set.has(target), inserts };
}

for (const n of [10000, 100000]) {
  const values = buildDescending(n);
  const target = 42;
  const sortStart = performance.now();
  const sortedResult = sortAndSearch(values, target);
  const sortMs = performance.now() - sortStart;
  const setStart = performance.now();
  const setResult = setAndSearch(values, target);
  const setMs = performance.now() - setStart;
  console.log(JSON.stringify({
    n,
    sortedResult,
    sortMs: Number(sortMs.toFixed(4)),
    setResult,
    setMs: Number(setMs.toFixed(4))
  }));
}
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：排序路径的 comparisons 大于 0，Set 路径的 inserts 等于 n 且 found 为 true；两段耗时只用于同一台机器上的对照。失败边界是只测量查找而漏算排序、把首次建表成本当成零，或用未排序数组直接二分。完成证据是两种方案的 comparisons/inserts 与耗时表。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：数组、链表与缓存局部性': {
    title: 'F1 代码台 02 · 数组与链表的访问代价',
    description:
      '真实构造连续数组和节点链表，分别遍历与访问第 k 个元素，统计检查次数和耗时。比较的不是“哪种结构更高级”，而是当前操作最常做哪一类读取。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f1-linked-guided',
      title: '跟做：顺序遍历数组和链表',
      brief:
        '运行命令：node main.js，stdin 留空。用 100,000 个整数分别构造数组与单链表，顺序累加每个值，输出 visits、checksum 与耗时。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function makeArray(n) {
  return Array.from({ length: n }, (_, index) => index);
}

function makeList(n) {
  let head = null;
  for (let value = n - 1; value >= 0; value -= 1) {
    head = { value, next: head };
  }
  return head;
}

function sumArray(values) {
  let sum = 0;
  let visits = 0;
  for (const value of values) {
    visits += 1;
    sum += value;
  }
  return { sum, visits };
}

function sumList(head) {
  let sum = 0;
  let visits = 0;
  for (let node = head; node; node = node.next) {
    visits += 1;
    sum += node.value;
  }
  return { sum, visits };
}

const n = 100000;
const values = makeArray(n);
const head = makeList(n);

const arrayStart = performance.now();
const array = sumArray(values);
const arrayMs = performance.now() - arrayStart;

const listStart = performance.now();
const list = sumList(head);
const listMs = performance.now() - listStart;

console.log(JSON.stringify({ n, array, arrayMs: Number(arrayMs.toFixed(4)), list, listMs: Number(listMs.toFixed(4)) }));
if (array.visits !== list.visits || array.sum !== list.sum) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：array.visits 与 list.visits 都等于 100000，array.sum 与 list.sum 都等于 4,999,950,000；耗时会因机器和 Node 版本变化。失败边界是用不同数据比较、只测创建时间、把链表遍历误认为随机访问。完成证据是两种 visits/checksum 和耗时。',
    },
    apply: {
      id: 'programming-foundations-f1-linked-independent',
      title: '独立实践：按下标读取为何链表要多走很多步',
      brief:
        '运行命令：node main.js，stdin 留空。数组按 0、n/2、n-1 直接读取；链表从头走到同样下标并统计 node visits。输出 readCount 与 listVisits，直接看到随机访问的定位成本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function makeArray(n) {
  return Array.from({ length: n }, (_, index) => index);
}

function makeList(n) {
  let head = null;
  for (let value = n - 1; value >= 0; value -= 1) head = { value, next: head };
  return head;
}

function listAt(head, index) {
  let node = head;
  let visits = 0;
  for (let i = 0; i <= index; i += 1) {
    visits += 1;
    if (i === index) return { value: node.value, visits };
    node = node.next;
  }
  return { value: undefined, visits };
}

const n = 3000;
const values = makeArray(n);
const head = makeList(n);
const indexes = [0, Math.floor(n / 2), n - 1];
const arrayStart = performance.now();
const arrayReads = indexes.map((index) => ({ index, value: values[index] }));
const arrayMs = performance.now() - arrayStart;

const listStart = performance.now();
let listVisits = 0;
const listReads = indexes.map((index) => {
  const result = listAt(head, index);
  listVisits += result.visits;
  return { index, value: result.value };
});
const listMs = performance.now() - listStart;

console.log('array reads:', JSON.stringify(arrayReads));
console.log('list reads:', JSON.stringify(listReads));
console.log(JSON.stringify({ readCount: indexes.length, listVisits, arrayMs: Number(arrayMs.toFixed(4)), listMs: Number(listMs.toFixed(4)) }));
if (listVisits <= indexes.length) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：array reads 和 list reads 的三个 value 相同，readCount 为 3，listVisits 明显大于 3（本例为 0 + 1500 + 3000 = 4500）；耗时会受机器影响。失败边界是只比较输出值不看访问步数、在不存在的下标继续遍历，或把 O(1) 查找与 O(n) 定位混为一谈。完成证据是 readCount、listVisits 与两份读取结果。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：哈希表、冲突与扩容': {
    title: 'F1 代码台 03 · 手写桶、冲突与负载因子',
    description:
      '自己实现字符串哈希、固定桶链地址法和扩容重哈希，插值后统计冲突次数、最长桶链与查找结果。不使用 Map，避免把标准库当成实验对象。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f1-hash-guided',
      title: '跟做：在 8 个桶里故意制造冲突',
      brief:
        '运行命令：node main.js，stdin 留空。代码用 31 倍滚动哈希把 user:0 到 user:31 映射到 8 个桶，插入时统计冲突、桶长和查找结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `class ChainedHashTable {
  constructor(size = 8) {
    this.buckets = Array.from({ length: size }, () => []);
    this.count = 0;
    this.collisions = 0;
  }

  hash(key) {
    let value = 0;
    for (const char of key) value = (value * 31 + char.charCodeAt(0)) >>> 0;
    return value % this.buckets.length;
  }

  set(key, value) {
    const index = this.hash(key);
    const bucket = this.buckets[index];
    if (bucket.length > 0) this.collisions += 1;
    const existing = bucket.find((entry) => entry.key === key);
    if (existing) existing.value = value;
    else {
      bucket.push({ key, value });
      this.count += 1;
    }
  }

  get(key) {
    const bucket = this.buckets[this.hash(key)];
    return bucket.find((entry) => entry.key === key)?.value;
  }

  stats() {
    const lengths = this.buckets.map((bucket) => bucket.length);
    return {
      buckets: this.buckets.length,
      count: this.count,
      collisions: this.collisions,
      maxBucket: Math.max(...lengths),
      emptyBuckets: lengths.filter((length) => length === 0).length
    };
  }
}

const table = new ChainedHashTable(8);
for (let i = 0; i < 32; i += 1) table.set(\`user:\${i}\`, i);
console.log('stats:', JSON.stringify(table.stats()));
console.log('lookup user:17:', table.get('user:17'));
console.log('lookup missing:', table.get('user:999'));

if (table.get('user:17') !== 17 || table.get('user:999') !== undefined) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：buckets 为 8，count 为 32，collisions 大于 0，maxBucket 明显大于 1，lookup user:17 为 17，lookup missing 为 undefined。失败边界是哈希值没有取模、冲突时覆盖旧键、只统计元素数不统计桶链分布。完成证据是 stats 与两次 lookup。',
    },
    apply: {
      id: 'programming-foundations-f1-hash-independent',
      title: '独立实践：插入 100 个键并观察扩容',
      brief:
        '运行命令：node main.js，stdin 留空。从 4 个桶开始插入 100 个键，负载因子超过 0.75 时扩容并重哈希；输出 resizes、collisions、loadFactor 和查找结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `class GrowingHashTable {
  constructor() {
    this.size = 4;
    this.threshold = 0.75;
    this.buckets = Array.from({ length: this.size }, () => []);
    this.count = 0;
    this.collisions = 0;
    this.resizes = 0;
  }

  hash(key, size = this.size) {
    let value = 0;
    for (const char of key) value = (value * 33 + char.charCodeAt(0)) >>> 0;
    return value % size;
  }

  set(key, value) {
    if ((this.count + 1) / this.size > this.threshold) this.resize();
    const index = this.hash(key);
    const bucket = this.buckets[index];
    if (bucket.length > 0 && bucket.some((entry) => entry.key !== key)) this.collisions += 1;
    const existing = bucket.find((entry) => entry.key === key);
    if (existing) existing.value = value;
    else {
      bucket.push({ key, value });
      this.count += 1;
    }
  }

  resize() {
    const oldEntries = this.buckets.flat();
    this.size *= 2;
    this.buckets = Array.from({ length: this.size }, () => []);
    this.count = 0;
    this.resizes += 1;
    for (const entry of oldEntries) this.set(entry.key, entry.value);
  }

  get(key) {
    return this.buckets[this.hash(key)].find((entry) => entry.key === key)?.value;
  }

  loadFactor() {
    return this.count / this.size;
  }

  maxBucket() {
    return Math.max(...this.buckets.map((bucket) => bucket.length));
  }
}

const table = new GrowingHashTable();
for (let i = 0; i < 100; i += 1) table.set(\`key-\${i}\`, i);
console.log(JSON.stringify({
  count: table.count,
  resizes: table.resizes,
  collisions: table.collisions,
  loadFactor: Number(table.loadFactor().toFixed(3)),
  maxBucket: table.maxBucket(),
  lookup: table.get('key-77'),
  missing: table.get('key-999')
}));
if (table.count !== 100 || table.get('key-77') !== 77 || table.get('key-999') !== undefined) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：count 为 100，resizes 至少为 1，loadFactor 不超过 0.75，lookup 为 77，missing 为 undefined；collisions 和 maxBucket 用于判断哈希质量。失败边界是扩容后忘记重新哈希、统计 count 时把旧桶重复计算，或把最坏查找说成永远 O(1)。完成证据是扩容统计与查找结果。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：树、堆、排序与搜索': {
    title: 'F1 代码台 04 · 从 BST 路径到堆顶与稳定排序',
    description:
      '先实现二叉搜索树查找路径和数组最大堆的弹出顺序，再比较归并排序与快排的比较次数和稳定性。树、堆和排序都通过真实数据推进。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f1-tree-guided',
      title: '跟做：追踪 BST 查找路径并弹出最大堆',
      brief:
        '运行命令：node main.js，stdin 留空。BST 插入一组整数并打印查找 7 的比较路径；最大堆依次弹出堆顶，输出降序结果与每次交换次数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `class BST {
  constructor() { this.root = null; }
  insert(value) {
    const node = { value, left: null, right: null };
    if (!this.root) { this.root = node; return; }
    let current = this.root;
    while (true) {
      if (value < current.value) {
        if (!current.left) { current.left = node; return; }
        current = current.left;
      } else {
        if (!current.right) { current.right = node; return; }
        current = current.right;
      }
    }
  }
  path(value) {
    const path = [];
    let current = this.root;
    while (current) {
      path.push(current.value);
      if (value === current.value) return path;
      current = value < current.value ? current.left : current.right;
    }
    return path;
  }
}

class MaxHeap {
  constructor() { this.items = []; this.swaps = 0; }
  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent] >= this.items[index]) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      this.swaps += 1;
      index = parent;
    }
  }
  pop() {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let largest = index;
        if (left < this.items.length && this.items[left] > this.items[largest]) largest = left;
        if (right < this.items.length && this.items[right] > this.items[largest]) largest = right;
        if (largest === index) break;
        [this.items[index], this.items[largest]] = [this.items[largest], this.items[index]];
        this.swaps += 1;
        index = largest;
      }
    }
    return top;
  }
}

const bst = new BST();
for (const value of [8, 3, 10, 1, 6, 14, 4, 7, 13]) bst.insert(value);
console.log('BST path to 7:', bst.path(7).join(' -> '));

const heap = new MaxHeap();
for (const value of [5, 1, 8, 3, 9, 2]) heap.push(value);
const popped = [];
while (heap.items.length) popped.push(heap.pop());
console.log('heap pop order:', popped.join(' -> '));
console.log('heap swaps:', heap.swaps);

if (bst.path(7).at(-1) !== 7 || popped.join(',') !== '9,8,5,3,2,1') process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：BST path to 7 以 7 结束，heap pop order 必须为 9 -> 8 -> 5 -> 3 -> 2 -> 1，heap swaps 大于 0，exit 0。失败边界是堆弹出后忘记下沉、把普通 BST 当成自动平衡树，或只看最终数组不看查找路径。完成证据是查找路径、弹出顺序和交换次数。',
    },
    apply: {
      id: 'programming-foundations-f1-tree-independent',
      title: '独立实践：比较归并与快排的比较次数和稳定性',
      brief:
        '运行命令：node main.js，stdin 留空。对带相同分数的记录分别执行归并排序与快排，统计比较次数，并检查相同 key 的原始次序是否被保留。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `function mergeSort(input) {
  let comparisons = 0;
  function sort(items) {
    if (items.length <= 1) return items;
    const mid = Math.floor(items.length / 2);
    const left = sort(items.slice(0, mid));
    const right = sort(items.slice(mid));
    const merged = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      comparisons += 1;
      if (left[i].score <= right[j].score) merged.push(left[i++]);
      else merged.push(right[j++]);
    }
    return merged.concat(left.slice(i), right.slice(j));
  }
  return { items: sort(input), comparisons };
}

function quickSort(input) {
  let comparisons = 0;
  const items = [...input];
  function sort(left, right) {
    if (left >= right) return;
    const pivot = items[right].score;
    let store = left;
    for (let i = left; i < right; i += 1) {
      comparisons += 1;
      if (items[i].score < pivot) {
        [items[store], items[i]] = [items[i], items[store]];
        store += 1;
      }
    }
    [items[store], items[right]] = [items[right], items[store]];
    sort(left, store - 1);
    sort(store + 1, right);
  }
  sort(0, items.length - 1);
  return { items, comparisons };
}

function sorted(records) {
  return records.every((record, index) => index === 0 || record.score >= records[index - 1].score);
}

function equalKeyOrder(records) {
  const buckets = new Map();
  for (const record of records) {
    const group = buckets.get(record.score) || [];
    group.push(record.id);
    buckets.set(record.score, group);
  }
  return [...buckets.entries()].map(([score, ids]) => ({ score, ids }));
}

const records = [
  { id: 'a', score: 2 }, { id: 'b', score: 1 }, { id: 'c', score: 2 },
  { id: 'd', score: 1 }, { id: 'e', score: 3 }, { id: 'f', score: 2 },
  { id: 'g', score: 1 }
];
const merged = mergeSort(records);
const quick = quickSort(records);
console.log('merge comparisons:', merged.comparisons);
console.log('quick comparisons:', quick.comparisons);
console.log('merge order:', merged.items.map((item) => item.id).join(' -> '));
console.log('quick order:', quick.items.map((item) => item.id).join(' -> '));
console.log('merge equal-key groups:', JSON.stringify(equalKeyOrder(merged.items)));
console.log('quick equal-key groups:', JSON.stringify(equalKeyOrder(quick.items)));
console.log('merge sorted:', sorted(merged.items), 'quick sorted:', sorted(quick.items));

if (!sorted(merged.items) || !sorted(quick.items) || merged.comparisons <= 0 || quick.comparisons <= 0) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：merge comparisons 与 quick comparisons 都大于 0，merge sorted 与 quick sorted 都为 true；equal-key groups 中记录顺序用于观察稳定性，不能只看最终分数。失败边界是比较器方向写反、快排分区丢元素，或把“分数有序”误认为“稳定”。完成证据是两组比较次数、排序后 id 顺序和相等键分组。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：图、遍历与最短路径直觉': {
    title: 'F1 代码台 05 · BFS 的边数与 Dijkstra 的权重',
    description:
      '在同一张带权图上分别跑 BFS 与 Dijkstra，输出访问顺序、距离和路径。用真实数据说明“边数最少”与“总权重最小”不是同一个问题。',
    ...nodeRuntime,
    practice: {
      id: 'programming-foundations-f1-graph-guided',
      title: '跟做：无权图上的 BFS 与 DFS',
      brief:
        '运行命令：node main.js，stdin 留空。用邻接表表示一张小图，BFS 按层记录访问顺序与最短边数，DFS 用栈记录另一条访问序列。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const graph = {
  A: ['B', 'C'],
  B: ['A', 'D', 'E'],
  C: ['A', 'F'],
  D: ['B'],
  E: ['B', 'F'],
  F: ['C', 'E']
};

function bfs(start) {
  const queue = [start];
  const seen = new Set([start]);
  const distance = { [start]: 0 };
  const order = [];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    order.push(node);
    for (const next of graph[node]) {
      if (seen.has(next)) continue;
      seen.add(next);
      distance[next] = distance[node] + 1;
      queue.push(next);
    }
  }
  return { order, distance };
}

function dfs(start) {
  const stack = [start];
  const seen = new Set();
  const order = [];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    order.push(node);
    for (let i = graph[node].length - 1; i >= 0; i -= 1) {
      if (!seen.has(graph[node][i])) stack.push(graph[node][i]);
    }
  }
  return order;
}

const breadth = bfs('A');
console.log('BFS order:', breadth.order.join(' -> '));
console.log('BFS distance:', JSON.stringify(breadth.distance));
console.log('DFS order:', dfs('A').join(' -> '));
if (breadth.distance.F !== 2 || breadth.order.length !== 6) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：BFS order 从 A 开始且包含 A,B,C,D,E,F；BFS distance 中 A=0、B/C=1、D/E/F=2；DFS order 也必须覆盖六个节点。失败边界是忘记 visited 导致环中死循环、BFS 用栈或 DFS 用队列。完成证据是 BFS order、distance 与 DFS order。',
    },
    apply: {
      id: 'programming-foundations-f1-graph-independent',
      title: '独立实践：带权图上的 BFS 选择与 Dijkstra 选择',
      brief:
        '运行命令：node main.js，stdin 留空。图中 A 到 C 有直接边权重 9，也有 A->B->C 的总权重 3；BFS 会优先边数，Dijkstra 必须返回总权重更小的路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const weighted = {
  A: { B: 1, C: 9 },
  B: { C: 2 },
  C: {}
};

function bfsDistance(start) {
  const queue = [start];
  const distance = { [start]: 0 };
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of Object.keys(weighted[node])) {
      if (distance[next] !== undefined) continue;
      distance[next] = distance[node] + 1;
      queue.push(next);
    }
  }
  return distance;
}

function dijkstra(start, target) {
  const distance = Object.fromEntries(Object.keys(weighted).map((node) => [node, Infinity]));
  const previous = {};
  const visited = new Set();
  distance[start] = 0;
  while (visited.size < Object.keys(weighted).length) {
    let current = null;
    for (const node of Object.keys(weighted)) {
      if (!visited.has(node) && (current === null || distance[node] < distance[current])) current = node;
    }
    if (current === null || distance[current] === Infinity) break;
    visited.add(current);
    for (const [next, weight] of Object.entries(weighted[current])) {
      const candidate = distance[current] + weight;
      if (candidate < distance[next]) {
        distance[next] = candidate;
        previous[next] = current;
      }
    }
  }
  const path = [];
  for (let node = target; node; node = previous[node]) path.push(node);
  return { distance: distance[target], path: path.reverse() };
}

const bfs = bfsDistance('A');
const best = dijkstra('A', 'C');
console.log('BFS edge distance:', JSON.stringify(bfs));
console.log('Dijkstra distance:', best.distance);
console.log('Dijkstra path:', best.path.join(' -> '));
console.log('edge-count choice:', bfs.C === 1 ? 'A -> C' : 'unknown');
if (best.distance !== 3 || best.path.join(',') !== 'A,B,C') process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：BFS edge distance 为 {"A":0,"B":1,"C":1}，Dijkstra distance 为 3，Dijkstra path 为 A -> B -> C，edge-count choice 为 A -> C。失败边界是带权图仍只用 BFS、权重为负仍套 Dijkstra，或忽略 priority 选择当前最小距离。完成证据是 BFS 距离、Dijkstra 距离和路径。',
    },
  },

  'programming:编程通识 · 数据结构与算法基础：算法选型与可验证基准': {
    title: 'F1 代码台 06 · 固定种子下的算法选择基准',
    description:
      '用固定随机种子生成同一份数据，比较排序法与哈希计数法找出出现次数最多的元素。多次运行取中位数，输出数据规模、次数、耗时和选择理由。',
    ...nodeRuntime,
    docsUrl: 'https://nodejs.org/api/perf_hooks.html',
    practice: {
      id: 'programming-foundations-f1-benchmark-guided',
      title: '跟做：排序法与哈希法回答同一问题',
      brief:
        '运行命令：node main.js，stdin 留空。固定种子生成 100,000 个 0 到 9 的值，分别用排序后扫描和哈希计数找众数，输出比较/访问次数与耗时。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function seededValues(seed, n) {
  let state = seed >>> 0;
  const values = [];
  for (let i = 0; i < n; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    values.push((state >>> 0) % 10);
  }
  return values;
}

function bySort(values) {
  let comparisons = 0;
  const sorted = [...values].sort((a, b) => {
    comparisons += 1;
    return a - b;
  });
  let bestValue = null;
  let bestCount = 0;
  let currentValue = null;
  let currentCount = 0;
  for (const value of sorted) {
    comparisons += 1;
    if (value === currentValue) currentCount += 1;
    else {
      currentValue = value;
      currentCount = 1;
    }
    if (currentCount > bestCount) {
      bestValue = value;
      bestCount = currentCount;
    }
  }
  return { value: bestValue, count: bestCount, comparisons };
}

function byHash(values) {
  let visits = 0;
  const counts = new Map();
  for (const value of values) {
    visits += 1;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let bestValue = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    visits += 1;
    if (count > bestCount) { bestValue = value; bestCount = count; }
  }
  return { value: bestValue, count: bestCount, visits };
}

const values = seededValues(20261123, 100000);
const sortStart = performance.now();
const sorted = bySort(values);
const sortMs = performance.now() - sortStart;
const hashStart = performance.now();
const hash = byHash(values);
const hashMs = performance.now() - hashStart;
console.log('sort:', JSON.stringify({ ...sorted, ms: Number(sortMs.toFixed(3)) }));
console.log('hash:', JSON.stringify({ ...hash, ms: Number(hashMs.toFixed(3)) }));
console.log('same value kind:', typeof sorted.value === typeof hash.value);
if (sorted.value === null || hash.value === null) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：两种方法都返回一个 value，sort comparisons 与 hash visits 都大于 0，固定种子 20261123 保证重跑数据一致。失败边界是两种方法使用不同输入、只跑一次就断言性能、漏算排序后的扫描成本，或把中位数/分位数混成单次耗时。完成证据是 sort/hash 的 value、count、统计量和耗时。',
    },
    apply: {
      id: 'programming-foundations-f1-benchmark-independent',
      title: '独立实践：多轮取中位数并报告选择理由',
      brief:
        '运行命令：node main.js，stdin 留空。固定种子生成 200,000 个值，两种方法各跑 5 轮，输出每轮耗时、中位数和最终选择理由。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `const { performance } = require('node:perf_hooks');

function seededValues(seed, n) {
  let state = seed >>> 0;
  const values = [];
  for (let i = 0; i < n; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    values.push((state >>> 0) % 20);
  }
  return values;
}

function majorityBySort(values) {
  let comparisons = 0;
  const sorted = [...values].sort((a, b) => {
    comparisons += 1;
    return a - b;
  });
  let current = sorted[0];
  let count = 0;
  let best = { value: sorted[0], count: 0 };
  for (const value of sorted) {
    comparisons += 1;
    if (value === current) count += 1;
    else { current = value; count = 1; }
    if (count > best.count) best = { value, count };
  }
  return { ...best, comparisons };
}

function majorityByHash(values) {
  let visits = 0;
  const counts = new Map();
  for (const value of values) {
    visits += 1;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = { value: null, count: 0 };
  for (const [value, count] of counts) {
    visits += 1;
    if (count > best.count) best = { value, count };
  }
  return { ...best, visits };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const values = seededValues(20261123, 200000);
const sortRuns = [];
const hashRuns = [];
let sortResult = null;
let hashResult = null;
for (let round = 1; round <= 5; round += 1) {
  const sortStart = performance.now();
  sortResult = majorityBySort(values);
  sortRuns.push(performance.now() - sortStart);
  const hashStart = performance.now();
  hashResult = majorityByHash(values);
  hashRuns.push(performance.now() - hashStart);
}
console.log('sort runs ms:', sortRuns.map((value) => Number(value.toFixed(3))).join(', '));
console.log('hash runs ms:', hashRuns.map((value) => Number(value.toFixed(3))).join(', '));
console.log('sort median ms:', Number(median(sortRuns).toFixed(3)));
console.log('hash median ms:', Number(median(hashRuns).toFixed(3)));
console.log('sort evidence:', JSON.stringify(sortResult));
console.log('hash evidence:', JSON.stringify(hashResult));
console.log('selection:', '重复构建哈希表；若还要排序结果再付排序成本');
if (sortRuns.length !== 5 || hashRuns.length !== 5 || sortResult.count <= 0 || hashResult.count <= 0) process.exit(1);
`,
      },
      stdin: '',
      checkpoint:
        '预期观察：两列 runs 各有 5 个数字，sort median 与 hash median 都大于 0，sort/hash evidence 都给出正 count，selection 解释为什么按当前约束选择哈希。失败边界是每轮重新生成不同输入、只比较第一轮、没有记录种子/规模，或用一次耗时替代中位数。完成证据是 5 轮耗时、两个中位数和两种结果。',
    },
  },
};
