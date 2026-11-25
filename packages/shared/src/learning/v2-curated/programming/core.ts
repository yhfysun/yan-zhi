import type { ProgrammingCourseSeed } from './shared.js';

const MDN_HTTP = 'MDN Web Docs, HTTP overview. https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview';
const GIT_BOOK = 'Pro Git, official book. https://git-scm.com/book/en/v2';
const HTML_SPEC = 'WHATWG HTML Living Standard. https://html.spec.whatwg.org/';
const CSS_SPEC = 'W3C CSS Snapshot. https://www.w3.org/TR/CSS/';
const TC39 = 'ECMAScript Language Specification. https://tc39.es/ecma262/';
const TS_DOCS = 'TypeScript Documentation. https://www.typescriptlang.org/docs/';
const VUE_DOCS = 'Vue.js Documentation. https://vuejs.org/guide/';
const REACT_DOCS = 'React Documentation. https://react.dev/reference/react';
const NODE_DOCS = 'Node.js Documentation. https://nodejs.org/docs/latest/api/';
const VITE_DOCS = 'Vite Guide. https://vite.dev/guide/';
const NUXT_DOCS = 'Nuxt Documentation. https://nuxt.com/docs';
const NEXT_DOCS = 'Next.js Documentation. https://nextjs.org/docs';
const POSTGRES_DOCS = 'PostgreSQL Documentation. https://www.postgresql.org/docs/';
const OWASP = 'OWASP Application Security Verification Standard. https://owasp.org/www-project-application-security-verification-standard/';
const OTEL = 'OpenTelemetry Documentation. https://opentelemetry.io/docs/';
const DOCKER_DOCS = 'Docker Documentation. https://docs.docker.com/';
const NODE_HTTP = 'Node.js HTTP Documentation. https://nodejs.org/api/http.html';

const PROGRAMMING_CORE_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: '终端、版本与环境：先把工具链跑通',
    track: 'P00 · 入门与工具链',
    minutes: 28,
    prerequisite: '会使用键盘和浏览器，不要求写过代码。',
    goal: '能解释终端、Shell、PATH、进程和版本管理器的关系，并在新机器上安装一套可复现的开发环境。',
    guidedPractice: '在 PowerShell 依次运行 $PSVersionTable、Get-Command node、node --version、where.exe node 和 Get-Location，把每条命令的输出、退出状态与含义写进学习记录。',
    independentPractice: '从空目录建立 environment.md：记录系统、Node、pnpm、包管理器、锁文件、启动命令、测试命令和一次失败退出码；让另一台机器按文档复现。',
    commonErrors: ['只看到“command not found”就重装软件，没有先用 Get-Command、where.exe 和 PATH 判断命令解析位置。', '直接全局安装所有工具，项目没有 package.json、packageManager 字段或锁文件，换机器后版本漂移。'],
    sourceRefs: [MDN_HTTP, NODE_DOCS],
    steps: [
      [
        '先分清终端、Shell 与进程',
        '终端只是显示输入输出的窗口，PowerShell 才是解释命令的 Shell；外部命令被解析后会创建独立进程。先运行 $PSVersionTable 确认当前 Shell，再用 Get-Command node 查看命令类型和实际可执行文件路径，最后用 $PID 与 Get-Process 对照当前 Shell 进程。若 Get-Command 找不到 node，问题在 PATH 或安装；能找到但运行失败，问题在程序本身、参数或权限，两者不要混为一谈。',
        '终端、Shell、命令、进程是四层',
        {
          title: 'PowerShell：确认 Shell、命令来源和当前进程',
          language: 'PowerShell',
          code: `$PSVersionTable.PSVersion.ToString()
$cmd = Get-Command node -ErrorAction SilentlyContinue
$cmd | Select-Object Name, CommandType, Source
$PID
Get-Process -Id $PID | Select-Object Id, ProcessName, Path`,
          output: `7.x（实际版本以当前机器为准）
Name  CommandType  Source
node  Application  C:\\Program Files\\nodejs\\node.exe
18432
Id     ProcessName  Path
18432  pwsh         C:\\Program Files\\PowerShell\\7\\pwsh.exe

若 node 这一行不存在，先检查 PATH；有这一行但仍执行失败，再检查版本、参数、权限或程序错误。`,
        },
      ],
      [
        '用版本文件固定可复现环境',
        '同一项目不能依赖“我电脑上刚好能跑”。node --version 确认运行时，pnpm --version 确认包管理器，where.exe node 和 where.exe pnpm 确认实际解析路径；package.json 的 packageManager 字段与 pnpm-lock.yaml 的 lockfileVersion、依赖解析结果一起进入版本控制。换机器时先比对这四项，再执行安装，否则同一个命令可能装出不同依赖树。',
        '版本、路径、锁文件和包管理器一起锁定',
        {
          title: 'PowerShell：锁定 Node、pnpm 与依赖解析结果',
          language: 'PowerShell',
          code: `node --version
pnpm --version
where.exe node
where.exe pnpm
Get-Content .\\package.json
Get-Content .\\pnpm-lock.yaml -TotalCount 12`,
          output: `v24.18.1
11.20.0
C:\\Program Files\\nodejs\\node.exe
C:\\Users\\<user>\\AppData\\Local\\pnpm\\pnpm.exe

package.json 中应有：
"packageManager": "pnpm@11.20.0"

pnpm-lock.yaml 开头应能看到 lockfileVersion 和解析后的依赖。`,
        },
      ],
      [
        '理解目录、权限与隐藏文件',
        '相对路径从当前目录解析，绝对路径从盘符或根目录开始。先用 Get-Location 确认当前位置，再用 Get-ChildItem -Force 查看 .env、.gitignore 等隐藏文件；Get-Acl 查看访问控制。路径不存在、没有读取权限、没有执行权限是三类不同错误，不能直接“以管理员运行”掩盖。',
        '先确认当前目录，再读文件与权限',
        {
          title: 'PowerShell：定位路径、隐藏配置和访问权限',
          language: 'PowerShell',
          code: `Get-Location
Get-ChildItem -Force | Select-Object Mode, Length, Name
Get-Item .\\.env.example | Select-Object FullName, Length, Attributes
Get-Acl .\\.env.example | Format-List Owner, AccessToString`,
          output: `Path
----
C:\\work\\demo

Mode   Length Name
--     ------ ----
-a---     128 .env.example
-a---      42 .gitignore

FullName                 Length Attributes
C:\\work\\demo\\.env.example     128 Archive

Owner 与 AccessToString 显示当前用户和服务账户是否具备读写权限。`,
        },
      ],
      [
        '跑通一次最小构建',
        '安装、测试和构建是三个独立阶段，分别可能失败。先执行 pnpm install，再执行 pnpm test 和 pnpm build，每次保存退出码；自动化应读取退出码而不是搜索彩色日志。失败时先保留完整命令、工作目录、版本与最早错误，最后一行往往只是连锁失败。',
        '退出码是自动化判断成功与否的接口',
        {
          title: 'PowerShell：逐段执行并保存真实退出码',
          language: 'PowerShell',
          code: `pnpm install
$installExit = $LASTEXITCODE
pnpm test
$testExit = $LASTEXITCODE
pnpm build
$buildExit = $LASTEXITCODE
[pscustomobject]@{ install = $installExit; test = $testExit; build = $buildExit }
if ($installExit -ne 0 -or $testExit -ne 0 -or $buildExit -ne 0) {
  throw "toolchain failed"
}`,
          output: `install test build
------- ---- -----
      0    0     0

任一项非 0 时，PowerShell 抛出 toolchain failed。
记录失败时应附：当前目录、Node/pnpm 版本、完整命令和最早出现的错误。`,
        },
      ],
      [
        '形成环境交接卡',
        '交接卡必须让另一个学习者不靠口头说明完成任务：确认系统与架构，安装指定 Node 和 pnpm，核对 lockfile，启动依赖服务，执行测试与构建，再做健康检查。把命令、预期输出、端口和常见失败写入 environment.md，并在一台干净环境按文档复跑。',
        '能按文档从空目录复现，才算交接完成',
        {
          title: 'environment.md：可直接执行的环境交接卡',
          language: 'Markdown',
          code: `<!-- 保存为 environment.md -->
# 开发环境交接卡

## 1. 版本
- OS: Windows 11 x64
- Node: v24.18.1
- pnpm: 11.20.0
- Lockfile: pnpm-lock.yaml

## 2. 初始化
\`\`\`powershell
corepack enable
corepack prepare pnpm@11.20.0 --activate
pnpm install --frozen-lockfile
\`\`\`

## 3. 验收
- pnpm test -> exit 0
- pnpm build -> exit 0
- 健康检查: curl http://127.0.0.1:3001/api/health

## 4. 常见失败
- node not found: 检查 PATH
- lockfile mismatch: 不要手改 lockfile，先确认 pnpm 版本
- port in use: Get-NetTCPConnection -LocalPort 3001`,
          output: `把文件放进仓库后，在干净目录按顺序执行。
任何一步失败都记录命令、退出码和最早错误。
另一名学习者完成后应提交同一组版本与验收结果。`,
        },
      ],
    ],
  },
  {
    name: 'Git 与可回滚开发：每次修改都有退路',
    track: 'P00 · 入门与工具链',
    minutes: 32,
    prerequisite: '完成终端与环境课程，能在项目目录执行基本命令。',
    goal: '能区分工作区、暂存区和提交，使用 diff 审查修改，并安全完成分支、撤销和回滚。',
    guidedPractice: '在空目录初始化仓库，创建 README.md，完成一次提交；修改后用 git diff、git diff --staged 检查，再创建功能分支并执行一次 git revert。',
    independentPractice: '模拟线上版本回滚：给固定提交打标签，制造一次错误提交，用反向提交恢复行为，并从 git log、git show、git describe 写出完整追溯链。',
    commonErrors: ['不查看 git status 和 diff 就直接提交，导致生成文件、调试代码和无关改动混入。', '在共享分支使用 git reset --hard 改写历史，让其他协作者无法安全同步。'],
    sourceRefs: [GIT_BOOK, 'Git Reference. https://git-scm.com/docs'],
    steps: [
      [
        '把版本控制当作状态机',
        'Git 的日常工作发生在工作区、暂存区和提交三个状态之间。工作区是当前文件，git add 把选中的内容写入暂存区，git commit 再把暂存区固化为树对象并记录父提交。先运行 git status --short --branch 看当前状态，再执行提交；提交不是“保存整个文件夹”，而是记录你明确暂存的那一份快照。',
        '先看状态，再执行写操作',
        {
          title: 'PowerShell：从空目录完成第一次提交并查看树对象',
          language: 'PowerShell',
          code: `git init
"# Demo" | Set-Content README.md
git status --short --branch
git add README.md
git commit -m "文档：初始化演示仓库"
git log --oneline --decorate -1
git cat-file -p HEAD^{tree}`,
          output: `## No commits yet on master
?? README.md
[master (root-commit) 3f1a2c7] 文档：初始化演示仓库
100644 blob 8d0e...    README.md

git status 显示文件未跟踪；commit 后 tree 对象列出 README.md 的 blob、权限和文件名。`,
        },
      ],
      [
        '提交前必须审查差异',
        'git diff 只比较工作区与暂存区，git diff --staged 比较暂存区与最后一次提交。两者含义不同：前者告诉你“还没暂存什么”，后者才是“下一次提交实际会包含什么”。提交前依次看 status、diff 和 staged diff，并用 git diff --check 检查空白错误和冲突标记。',
        '暂存前后都要审查',
        {
          title: 'PowerShell：暂存前后分别检查真实差异',
          language: 'PowerShell',
          code: `Add-Content README.md "## Usage"
git status --short
git diff
git add README.md
git diff --staged
git diff --check
git status --short`,
          output: ` M README.md
+## Usage

暂存后 git diff 为空，而 git diff --staged 显示新增的 ## Usage。
git diff --check 无输出且退出码为 0，才表示没有空白错误。`,
        },
      ],
      [
        '分支用于隔离变化',
        '分支只是指向某个提交的可移动引用，创建分支不会复制整个工作目录。功能分支从稳定基线创建，小步提交，合并前先查看 git merge-base 和双方差异。冲突不是文件坏了，而是两个提交对同一区域做了不同修改，需要人工决定最终内容并重新验证。',
        '分支隔离历史，不隔离运行环境',
        {
          title: 'PowerShell：创建功能分支并检查共同祖先',
          language: 'PowerShell',
          code: `git branch --show-current
git switch -c feature/readme
"- item" | Add-Content README.md
git add README.md
git commit -m "文档：补充使用列表"
git log --oneline --graph --decorate --all -3
git merge-base master feature/readme`,
          output: `master
Switched to branch 'feature/readme'
* 8b7a1d2 (HEAD -> feature/readme) 文档：补充使用列表
* 3f1a2c7 (master) 文档：初始化演示仓库

merge-base 返回 3f1a2c7，说明功能分支从该提交分出。`,
        },
      ],
      [
        '回滚要区分是否共享历史',
        '未推送提交可以用 reset --soft 或交互式 rebase 整理；已经推送或多人共享的提交应使用 git revert 生成一个新的反向提交。revert 保留历史并明确记录“撤销了哪次变更”，比强制改写共享分支安全。执行前先 git show 查看目标提交，确认影响范围。',
        '共享历史默认追加修复，不重写',
        {
          title: 'PowerShell：先查看错误提交，再安全反向提交',
          language: 'PowerShell',
          code: `git log --oneline -3
git show --stat HEAD
git revert HEAD --no-edit
git log --oneline -3
git status --short --branch`,
          output: `8b7a1d2 文档：补充使用列表
3f1a2c7 文档：初始化演示仓库
Revert "文档：补充使用列表"
[feature/readme 91c0f4a] Revert ...
91c0f4a Revert "文档：补充使用列表"
8b7a1d2 文档：补充使用列表
3f1a2c7 文档：初始化演示仓库`,
        },
      ],
      [
        '把提交与发布追溯连接',
        '发布必须指向不可变提交和制品。用带注释标签记录发布点，用 git describe 找到最近标签和附加提交，用 git show 查看标签对应的源码状态。部署日志、镜像 digest 和标签应互相对应，线上故障时才能从运行版本追回源码、依赖和构建记录。',
        '标签、制品和部署版本必须相互对应',
        {
          title: 'PowerShell：给可发布提交打标签并追溯',
          language: 'PowerShell',
          code: `git tag -a v0.1.0 -m "首个可发布版本"
git describe --always --dirty
git show --stat --oneline v0.1.0
git rev-parse HEAD
git status --short`,
          output: `v0.1.0
f0c2a91 文档：初始化演示仓库

git rev-parse HEAD 返回完整提交 SHA。
git status --short 无输出表示工作区干净，发布物对应提交而不是未提交修改。`,
        },
      ],
    ],
  },
  {
    name: '程序如何运行：源码、编译与进程',
    track: 'P00 · 入门与工具链',
    minutes: 30,
    prerequisite: '能使用终端和文本编辑器，理解文件与目录。',
    goal: '能说明源码经过编译或解释后如何成为进程，并区分解释器、编译器、虚拟机、标准库和操作系统。',
    guidedPractice: '分别运行一个解释型和一个编译型最小程序，用进程、版本和退出码命令观察执行结果。',
    independentPractice: '画出一个程序的启动链，从源码到可执行制品再到进程，标出每一步可能失败的位置。',
    commonErrors: ['把语言、运行时和编辑器当成同一种工具。', '只看业务异常，不看退出码和启动日志。'],
    sourceRefs: [TC39, 'OpenJDK Documentation. https://openjdk.org/'],
    steps: [
      [
        '从源码到机器指令：先看执行链',
        '源码只是 UTF-8 文本，CPU 不能直接理解变量名、缩进或 JavaScript 语法。执行链至少要经过读取文件、词法分析、语法分析、生成中间表示或字节码，再由解释器、即时编译器或虚拟机执行。编辑器只负责改文件；node、java、python 等命令才负责启动对应运行时。排查“代码为什么不运行”时，先确认当前文件被哪个解释器读取、解释器路径是什么、运行时版本是否与代码要求一致，再看语法和业务逻辑。',
        '先确认文件、解释器、运行时版本和最终进程',
        {
          title: 'PowerShell + Node.js：确认源码由谁读取并执行',
          language: 'PowerShell',
          code: `node --version
node -p "process.versions.v8"
node -p "process.execPath"
node -e "console.log(require('node:module').builtinModules.includes('fs'))"
Get-Command node | Select-Object CommandType, Source`,
          output: `v24.18.1
14.8.283.41
C:\\Program Files\\nodejs\\node.exe
true

CommandType  Source
-----------  ------
Application  C:\\Program Files\\nodejs\\node.exe

版本号因机器而异；若 Get-Command 找不到 node，故障发生在命令解析阶段，尚未进入 JavaScript 执行。`,
        },
      ],
      [
        '编译、解释与虚拟机不是三选一',
        '编译器把一种程序表示转换成另一种表示；解释器读取指令并驱动执行；虚拟机提供统一的指令集、内存模型和运行时服务。现代语言经常把三者组合起来：javac 先把 Java 源码编译成 class 字节码，java 启动 JVM 后加载并校验字节码，再由解释器和 JIT 编译器共同执行热点代码。不要用“编译型语言”或“解释型语言”给语言贴死标签，要看具体工具链和运行命令。',
        '看产物、看加载器、再看执行器',
        {
          title: 'PowerShell + JDK：从 Java 源码生成并检查字节码',
          language: 'PowerShell',
          code: `@'
public final class Main {
  public static void main(String[] args) {
    int left = 21;
    System.out.println(left * 2);
  }
}
'@ | Set-Content Main.java
javac -version
javac Main.java
java -cp . Main
javap -c -p Main`,
          output: `javac 21.0.4
42

public final class Main {
  public static void main(java.lang.String[]);
    Code:
       0: bipush        21
       2: iconst_2
       3: imul
       4: invokevirtual #7 // Method java/io/PrintStream.println:(I)V
}

源码被编译成 Main.class；java 读取的是字节码，CPU 执行的是经过 JVM 转换后的机器指令。`,
        },
      ],
      [
        '进程拥有资源和状态',
        '程序是磁盘上的代码与数据，进程是程序被操作系统加载后的一次运行实例。每个进程有自己的 PID、虚拟内存、环境变量、当前目录、标准输入输出、文件描述符和网络套接字。服务启动成功只说明进程开始监听；数据库没连上、端口被占用、权限不足或请求路径错误，都可能在启动后继续失败。排查时要同时看 PID、监听地址、父进程、环境变量和日志。',
        '把启动成功与请求成功分开验证',
        {
          title: 'PowerShell + Node.js：启动服务并核对 PID 与端口',
          language: 'PowerShell',
          code: `@'
import { createServer } from 'node:http';
const port = Number(process.env.PORT ?? 3001);
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('pid=' + process.pid + '\\n');
});
server.listen(port, '127.0.0.1', () => {
  console.log('listening=' + port);
});
'@ | Set-Content server.mjs
$env:PORT = '3001'
$server = Start-Process node -ArgumentList 'server.mjs' -PassThru
Start-Sleep -Milliseconds 500
$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen
$listener | Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id $listener.OwningProcess | Select-Object Id, ProcessName, Path
curl.exe -sS http://127.0.0.1:3001/
Stop-Process -Id $server.Id`,
          output: `LocalAddress LocalPort OwningProcess
127.0.0.1        3001         43120

Id    ProcessName Path
43120 node        C:\\Program Files\\nodejs\\node.exe

pid=43120

若没有 Listen 记录，进程可能启动失败、端口被占用或只监听了其他地址；此时查看 node server.mjs 的 stderr。`,
        },
      ],
      [
        '标准库是平台契约的一部分',
        '标准库把文件系统、网络、进程、时间和并发等操作系统能力包装成稳定 API。学习一个运行时，必须知道常用标准库模块、错误对象的 code、同步与异步接口差异，以及哪些能力依赖平台。第三方框架可以节省开发时间，但不能替代对文件不存在、权限拒绝、连接超时、编码错误等基础失败的认识。先读标准库文档，再判断是否真的需要新增依赖。',
        '先掌握错误码，再决定是否引入框架',
        {
          title: 'PowerShell + Node.js：读取文件并区分成功与 ENOENT',
          language: 'PowerShell',
          code: `@'
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve(process.argv[2] ?? 'missing.txt');
try {
  const info = await stat(target);
  const text = await readFile(target, 'utf8');
  console.log(JSON.stringify({ event: 'file-read', target, bytes: info.size, lines: text.split(/\\r?\\n/).length }));
} catch (error) {
  console.error(JSON.stringify({ event: 'file-error', target, code: error.code, message: error.message }));
  process.exitCode = 2;
}
'@ | Set-Content inspect-file.mjs
node inspect-file.mjs README.md
node inspect-file.mjs missing.txt
"missingExit=$LASTEXITCODE"`,
          output: `{"event":"file-read","target":"C:\\\\work\\\\demo\\\\README.md","bytes":128,"lines":5}
{"event":"file-error","target":"C:\\\\work\\\\demo\\\\missing.txt","code":"ENOENT","message":"ENOENT: no such file or directory, stat ..."}
missingExit=2

ENOENT 表示路径不存在；EACCES 表示权限不足；EISDIR 表示把目录当文件读取。不同 code 对应不同修复动作。`,
        },
      ],
      [
        '用退出码和日志验证运行',
        '自动化任务不能靠阅读彩色日志判断成功。进程退出码 0 表示成功，非 0 表示失败；日志负责记录时间、进程、版本、阶段、上下文和最早错误。一个可靠的启动脚本会先运行检查，再把检查结果写入固定格式日志，最后把同一个结果传给退出码。业务错误还要有稳定错误码，否则脚本只能匹配中文字符串，改一行文案就会误判。',
        '同一次检查同时产生日志证据和退出码',
        {
          title: 'PowerShell + Node.js：运行检查并保存可查询日志',
          language: 'PowerShell',
          code: `@'
const failures = [];
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) failures.push('node-major');
const record = {
  event: 'runtime-check',
  at: new Date().toISOString(),
  pid: process.pid,
  node: process.version,
  ok: failures.length === 0,
  failures
};
console.log(JSON.stringify(record));
if (failures.length > 0) {
  console.error(JSON.stringify({ event: 'runtime-failed', failures }));
  process.exitCode = 2;
}
'@ | Set-Content verify-runtime.mjs
node verify-runtime.mjs 2>> run-errors.log
$exit = $LASTEXITCODE
"exit=$exit" | Add-Content run-audit.log
Get-Content run-audit.log -Tail 3
Get-Content run-errors.log -Tail 3
exit $exit`,
          output: `{"event":"runtime-check","at":"2026-11-23T08:30:00.000Z","pid":48212,"node":"v24.18.1","ok":true,"failures":[]}
exit=0

若检查失败，stderr 会出现 "event":"runtime-failed"；自动化看到 exit=2 就停止部署，而不是从日志中猜“大概失败了”。`,
        },
      ],
    ],
  },
  {
    name: '首次 HTTP 请求：浏览器到服务端',
    track: 'P00 · 入门与工具链',
    minutes: 34,
    prerequisite: '完成终端和进程课程，能读基础日志。',
    goal: '能解释 DNS、TCP/TLS、HTTP、反向代理和应用服务的请求路径，并使用 curl 与服务器日志定位 404、超时和连接失败。',
    guidedPractice: '启动一个最小 HTTP 服务，用浏览器和 curl 访问同一路径，再分别制造错误端口、错误路径和慢响应。',
    independentPractice: '记录一次完整请求的证据链，包含 URL、状态码、响应头、服务日志和失败时的第一处异常。',
    commonErrors: ['把 DNS、端口和路由错误混在一起。', '只检查浏览器页面，不查看网络响应和服务端日志。'],
    sourceRefs: [MDN_HTTP, NODE_HTTP],
    steps: [
      [
        '请求先找到主机和端口',
        '一次 HTTP 请求在网络层至少经过名称解析、目标地址选择、TCP 连接，HTTPS 还要完成 TLS 握手，之后才发送 HTTP 文本。localhost 解析错误会表现为找不到主机；端口没有监听会直接连接失败；证书域名不匹配会在握手阶段失败；只有连接建立后，404 或 500 才说明 HTTP 已经到达服务。排查必须按阶段推进，不能一看到页面空白就改路由。',
        '用 DNS、TCP 和 HTTP 三层证据分开定位',
        {
          title: 'PowerShell：请求未启动服务时观察连接失败',
          language: 'PowerShell',
          code: `Resolve-DnsName localhost -Type A
Test-NetConnection 127.0.0.1 -Port 3001 -InformationLevel Detailed
curl.exe -v --connect-timeout 3 http://127.0.0.1:3001/api/health 2>&1
"curlExit=$LASTEXITCODE"`,
          output: `Name      Type TTL Section IPAddress
localhost A    0   Answer  127.0.0.1

ComputerName           : 127.0.0.1
RemotePort             : 3001
TcpTestSucceeded       : False

* connect to 127.0.0.1 port 3001 failed: Connection refused
curlExit=7

DNS 成功但 TCP 失败，说明问题在端口监听、防火墙或服务进程，不在域名解析。`,
        },
      ],
      [
        'HTTP 是请求与响应的契约',
        'HTTP 请求由方法、目标、协议版本、请求头和可选正文组成；响应由状态码、响应头和正文组成。GET 表示读取，POST 表示创建或触发处理，状态码表达协议结果，业务错误码表达应用语义。一个成功响应必须让客户端知道内容类型、长度或传输方式以及缓存约束；错误响应也要有稳定结构，不能把堆栈直接返回给用户。',
        '同时检查状态行、响应头和正文',
        {
          title: 'PowerShell + Node.js：启动最小 API 并观察 200 与 404',
          language: 'PowerShell',
          code: `@'
import { createServer } from 'node:http';
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': 'demo-001'
    });
    response.end(JSON.stringify({ ok: true, method: request.method, path: request.url }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'route not found' } }));
});
server.listen(3001, '127.0.0.1');
'@ | Set-Content http-contract.mjs
$server = Start-Process node -ArgumentList 'http-contract.mjs' -PassThru
Start-Sleep -Milliseconds 400
curl.exe -i http://127.0.0.1:3001/api/health
curl.exe -i http://127.0.0.1:3001/missing
Stop-Process -Id $server.Id`,
          output: `HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: demo-001

{"ok":true,"method":"GET","path":"/api/health"}

HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8

{"error":{"code":"NOT_FOUND","message":"route not found"}}

404 表明请求已到应用但没有匹配路由；若连状态行都没有，就不属于路由问题。`,
        },
      ],
      [
        '反向代理会改变排查视角',
        '生产请求通常先到 Nginx、Ingress 或云网关，再由入口转发给应用。入口可能改写 Host、路径、请求头和超时，也可能在应用之前直接返回 502、503 或 504。必须让入口生成或透传 X-Request-ID，并把同一 ID 写入入口访问日志和应用日志，才能判断请求是否到达应用、在哪个节点被拒绝。只看浏览器或只看应用日志都可能得到错误结论。',
        '入口日志与应用日志必须能被同一个 ID 串起来',
        {
          title: 'PowerShell + Nginx：保留请求 ID 并转发到本地 API',
          language: 'PowerShell',
          code: `@'
worker_processes 1;
events {}
http {
  server {
    listen 8080;
    location /api/ {
      proxy_set_header Host $host;
      proxy_set_header X-Request-ID $request_id;
      proxy_pass http://host.docker.internal:3001;
    }
  }
}
'@ | Set-Content nginx.conf
docker run --rm -d --name demo-proxy -p 8080:8080 --volume "$($pwd.Path)/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.27-alpine
Start-Sleep -Seconds 1
curl.exe -i -H "X-Request-ID: demo-001" http://127.0.0.1:8080/api/health
docker logs demo-proxy --tail 5
docker stop demo-proxy`,
          output: `HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: demo-001

{"ok":true,"method":"GET","path":"/api/health"}

172.17.0.1 - - [23/Nov/2026:08:40:00 +0000] "GET /api/health HTTP/1.1" 200

入口已记录请求；若这里没有日志，先检查端口和代理容器；有入口日志但应用无记录，再检查 upstream 地址与网络。`,
        },
      ],
      [
        '超时不是单一错误',
        '连接超时表示客户端在预算内没建立 TCP；TLS 握手超时表示证书或网络协商没完成；响应头超时表示请求已发出但服务迟迟不返回；响应体超时表示已收到响应头但正文持续过慢；请求取消表示用户、浏览器或上游主动放弃。每一层都有独立预算。把所有超时统一改成 60 秒，只会让故障暴露更晚，并占用更多连接和线程。',
        '先判断卡在连接、响应头还是响应体',
        {
          title: 'PowerShell + Node.js：观察客户端 2 秒超时与慢服务',
          language: 'PowerShell',
          code: `@'
import { createServer } from 'node:http';
const server = createServer((request, response) => {
  const delay = request.url === '/slow' ? 5000 : 0;
  setTimeout(() => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
  }, delay);
});
server.listen(3001, '127.0.0.1');
'@ | Set-Content slow-server.mjs
$server = Start-Process node -ArgumentList 'slow-server.mjs' -PassThru
Start-Sleep -Milliseconds 400
curl.exe -v --max-time 2 http://127.0.0.1:3001/slow
"timeoutExit=$LASTEXITCODE"
curl.exe -i --max-time 8 http://127.0.0.1:3001/slow
Stop-Process -Id $server.Id`,
          output: `* Operation timed out after 2001 milliseconds with 0 bytes received
timeoutExit=28

HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8

ok

退出码 28 是 curl 的客户端超时；服务端可能仍在工作，因此还要检查请求耗时、取消信号和下游超时。`,
        },
      ],
      [
        '用最小请求复现问题',
        '故障报告里的浏览器 Cookie、缓存、插件和复杂页面状态会制造干扰。先把问题压缩成固定方法、固定 URL、必要请求头和最小正文，再分别保存响应头与响应体。最小请求应在命令行可重复执行，并有唯一 requestId、状态码、耗时和失败退出码。只有别人能用同一命令得到同一现象，问题才算被稳定复现。',
        '把现象固化成命令、响应头和响应体三份证据',
        {
          title: 'PowerShell + curl：保存一套可复现的请求证据',
          language: 'PowerShell',
          code: `$requestId = 'repro-' + (Get-Date -Format 'yyyyMMddHHmmss')
curl.exe -sS -D .\\headers.txt -o .\\body.json -w "status=%{http_code} time=%{time_total}s\\n" -H "X-Request-ID: $requestId" http://127.0.0.1:3001/api/orders
"curlExit=$LASTEXITCODE"
Get-Content .\\headers.txt
Get-Content .\\body.json
Get-FileHash .\\body.json -Algorithm SHA256`,
          output: `status=401 time=0.083s
curlExit=0

HTTP/1.1 401 Unauthorized
content-type: application/json; charset=utf-8
x-request-id: repro-20261123164000

{"error":{"code":"AUTH_REQUIRED","message":"missing bearer token"}}

命令、requestId、状态码、响应头和响应体共同构成最小证据；curl 传输成功不代表业务成功，因此还要看状态码。`,
        },
      ],
    ],
  },
  {
    name: '从空目录搭建项目与 Docker 本地依赖',
    track: 'P00 · 入门与工具链',
    minutes: 42,
    prerequisite: '了解终端、Git 和一次 HTTP 请求。',
    goal: '能从空目录建立应用、测试、配置和 Docker Compose 依赖，并用一条命令让新成员启动本地环境。',
    guidedPractice: '从空目录建立最小服务和数据库容器，编写 README、环境变量示例、健康检查和启动脚本。',
    independentPractice: '删除生成器输出，按文档重新搭建目录结构，并让测试、构建和容器启动全部通过。',
    commonErrors: ['只会运行模板命令，不能解释目录和配置。', '把数据库密码写进仓库与镜像。'],
    sourceRefs: [DOCKER_DOCS, 'Twelve-Factor App. https://12factor.net/'],
    steps: [
      [
        '先定义目录和运行边界',
        '空目录里第一件事不是运行脚手架，而是决定哪些代码属于应用、哪些属于测试与迁移、哪些配置只能由环境注入、哪些文件是运行产物不能提交。推荐把 HTTP 入口、领域逻辑、外部适配器、测试、迁移、脚本和部署文件分开。目录应表达依赖方向和运行边界，让读者能一眼看出应用进程不会直接修改测试夹具，构建产物也不会混进源码。先用最小文件集把这些边界固定下来，再安装依赖。',
        '先让空目录表达边界，再让工具填充内容',
        {
          title: 'PowerShell：从空目录建立最小服务骨架',
          language: 'PowerShell',
          code: `$root = Join-Path $env:TEMP 'demo-service'
New-Item -ItemType Directory -Force $root, "$root\\src", "$root\\tests", "$root\\migrations", "$root\\scripts" | Out-Null
Set-Content "$root\\src\\server.mjs" "export const serviceName = 'demo';"
Set-Content "$root\\tests\\server.test.mjs" "import 'node:assert/strict';"
Set-Content "$root\\migrations\\.gitkeep" ""
Set-Content "$root\\.env.example" "PORT=3001"
Set-Content "$root\\package.json" '{"type":"module","packageManager":"pnpm@11.20.0"}'
Get-ChildItem $root -Force -Recurse | ForEach-Object {
  $_.FullName.Replace($root, '.')
}`,
          output: `.\\src
.\\src\\server.mjs
.\\tests
.\\tests\\server.test.mjs
.\\migrations
.\\migrations\\.gitkeep
.\\scripts
.\\package.json
.\\env.example

这些目录先定义职责；后续脚手架可以生成更多文件，但不能把源码、测试、迁移和真实配置混成一团。`,
        },
      ],
      [
        '配置从环境进入进程',
        '同一份构建制品应能部署到开发、测试和生产。数据库地址、端口、日志级别等变化项通过环境变量或配置中心注入，仓库只提交不带秘密的 .env.example。应用启动时必须校验配置类型和范围，缺失或非法值应立刻失败并输出配置键名，而不是运行到第一次查询数据库才崩溃。真实密钥不能进入 Git、镜像层、日志或错误响应。',
        '配置错误应在进程启动阶段失败',
        {
          title: 'PowerShell + Node.js：校验端口配置并保留示例文件',
          language: 'PowerShell',
          code: `@'
const rawPort = process.env.PORT ?? '3001';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(JSON.stringify({ event: 'config-invalid', key: 'PORT', value: rawPort }));
  process.exit(2);
}
console.log(JSON.stringify({
  event: 'config-ok',
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development'
}));
'@ | Set-Content config.mjs
$env:PORT = '3001'
$env:NODE_ENV = 'development'
node config.mjs
$env:PORT = 'abc'
node config.mjs
"invalidExit=$LASTEXITCODE"
Remove-Item Env:PORT`,
          output: `{"event":"config-ok","port":3001,"nodeEnv":"development"}
{"event":"config-invalid","key":"PORT","value":"abc"}
invalidExit=2

.env.example 中可以写 PORT=3001；真实 .env、生产密钥和数据库密码不得提交。`,
        },
      ],
      [
        'Docker 用来固定依赖形态',
        'Docker Compose 适合在本地启动 PostgreSQL、Redis、消息队列等有状态的开发依赖。镜像必须使用明确 tag，端口只绑定到需要的地址，数据写进命名卷，健康检查必须能回答“服务是否真的可用”。固定镜像版本减少环境漂移，固定卷名让重启后数据仍在，健康检查让脚本知道何时可以迁移。Compose 是本地开发工具，不等于生产编排；本地便利配置不能直接冒充生产部署方案。',
        '固定版本、健康检查和数据卷',
        {
          title: 'PowerShell + Docker Compose：启动带健康检查的 PostgreSQL',
          language: 'PowerShell',
          code: `@'
services:
  db:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: local-only
      POSTGRES_DB: app
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  db-data:
'@ | Set-Content compose.yaml
docker compose config --quiet
docker compose up -d db
docker compose ps db
docker compose exec db pg_isready -U app -d app
docker compose down`,
          output: `NAME             IMAGE                COMMAND                  SERVICE   STATUS
demo-db-1        postgres:16.4-alpine "docker-entrypoint.s..." db        Up (healthy)

/var/run/postgresql:5432 - accepting connections

down 保留 db-data 卷；只有明确需要清空学习数据时才使用 docker compose down -v。`,
        },
      ],
      [
        '一条命令完成首次启动',
        '首次启动脚本要按依赖顺序执行：检查工具版本，复制示例配置，安装锁定依赖，启动并等待外部服务健康，执行迁移，启动应用，最后请求健康接口。每一步失败都要立即停止，并打印当前阶段。脚本不是把五条命令塞进一行，而是把人脑中的启动顺序固化成可重复执行的流程。README 只负责解释脚本，不让新成员分别复制七八条命令。',
        '把启动顺序固化成能失败、能验收的脚本',
        {
          title: 'PowerShell：bootstrap.ps1 完成从安装到健康检查',
          language: 'PowerShell',
          code: `@'
$ErrorActionPreference = 'Stop'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
$app = Start-Process node -ArgumentList 'src/server.mjs' -PassThru
try {
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    curl.exe --fail --silent http://127.0.0.1:3001/api/health
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 250
  }
  if ($LASTEXITCODE -ne 0) { throw 'health check failed' }
} finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id }
}
'@ | Set-Content .\\scripts\\bootstrap.ps1
pnpm install
pnpm exec powershell -NoProfile -File .\\scripts\\bootstrap.ps1
"bootstrapExit=$LASTEXITCODE"`,
          output: `Scope: all 1 workspace projects
Lockfile is up to date
Container demo-db-1 Healthy
Migration 001_init applied
{"status":"ok","database":"up"}
bootstrapExit=0

在 package.json 中可增加 "bootstrap": "powershell -NoProfile -File ./scripts/bootstrap.ps1"，新成员只需执行 pnpm bootstrap。`,
        },
      ],
      [
        '删除模板后重建一次',
        '生成器只负责给出文件起点，不能替代对入口、依赖方向、配置、迁移和健康检查的理解。验证方法是换一个全新目录，从 Git 仓库克隆同一版本，只依赖 README、锁文件和脚本重建环境；记录每一步版本、耗时、端口和失败原因。如果离开原目录、IDE 缓存或手工安装的全局包就无法运行，说明尚未形成可复制工程。',
        '在全新目录按仓库内容复现整套环境',
        {
          title: 'PowerShell + Git：从新目录验证首次启动文档',
          language: 'PowerShell',
          code: `$root = Join-Path $env:TEMP ('demo-rebuild-' + [guid]::NewGuid().ToString('N'))
$source = git rev-parse --show-toplevel
git clone $source $root
Set-Location $root
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose config --quiet
docker compose up -d --wait
pnpm db:migrate
pnpm test
curl.exe --fail --silent --show-error http://127.0.0.1:3001/api/health
docker compose down`,
          output: `Cloning into 'C:\\Users\\<user>\\AppData\\Local\\Temp\\demo-rebuild-1f4c...'
Lockfile is up to date
Container demo-db-1 Healthy
Migration 001_init applied
Test Files 1 passed
{"status":"ok","database":"up"}

重建目录必须使用仓库提交、锁文件和文档；若必须复制原目录的 node_modules、.env 或容器卷才能启动，首次启动路径仍不可交付。`,
        },
      ],
    ],
  },
  {
    name: 'HTML 语义、表单与可访问性',
    track: 'P01 · HTML / CSS / 浏览器',
    minutes: 36,
    prerequisite: '完成入门路线，能在浏览器打开本地页面。',
    goal: '能用语义元素表达页面结构，构建可键盘操作、可被辅助技术理解的表单与导航。',
    guidedPractice: '把一个全部由 div 组成的页面改成 header、nav、main、section、form、label 和 button，并用键盘走完主流程。',
    independentPractice: '完成一个注册表单，包含错误提示、焦点管理、键盘提交和屏幕阅读器可读标签。',
    commonErrors: ['用 div 模拟按钮和链接。', '只用颜色表达错误状态，没有文字和关联提示。'],
    sourceRefs: [HTML_SPEC, 'WAI-ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/'],
    steps: [
      [
        '语义元素描述结构而不是外观',
        'HTML 元素的职责是表达内容角色，不是预设外观。header 表示页面或区块头部，nav 表示主要导航链接集合，main 表示文档唯一的首要内容，article 应能独立分发或理解，section 需要有主题，footer 表示尾部信息。辅助技术、浏览器阅读模式和搜索引擎会利用这些结构建立地标与阅读顺序；把全部内容写成 div 再补 role，会丢失原生行为并增加维护成本。样式应建立在语义结构之上，而不是因为想要横排或圆角就把标签改成 div。',
        '先搭文档地标，再写 CSS',
        {
          title: 'HTML + DevTools：建立并检查页面地标',
          language: 'HTML + DevTools Console',
          code: `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>语义页面</title></head>
<body>
  <header><b>订单中心</b></header>
  <nav aria-label="主导航"><a href="/orders">订单</a><a href="/account">账户</a></nav>
  <main id="main">
    <h1>待处理订单</h1>
    <article aria-labelledby="order-1001">
      <h2 id="order-1001">订单 1001</h2>
      <p>状态：待发货</p>
    </article>
  </main>
  <footer>客服时间 09:00-18:00</footer>
</body>
</html>

// 浏览器 DevTools Console
[...document.querySelectorAll('header, nav, main, article, footer')]
  .map((element) => element.tagName)`,
          output: `["HEADER", "NAV", "MAIN", "ARTICLE", "FOOTER"]

DevTools Accessibility 面板中应出现 navigation、main 等 landform。页面上应只有一个 main；article 有可读标题，nav 有 aria-label 以区分多个导航区域。`,
        },
      ],
      [
        '表单必须有可关联标签',
        'label 与 input 建立可编程关联后，点击标签文字会聚焦输入框，屏幕阅读器会读出字段名称。说明文本和错误文本通过 aria-describedby 关联，错误出现时再用 aria-live 宣告。placeholder 只是输入示例，输入后会消失，不能承担字段名称。一个字段可以没有 placeholder，但不能没有可访问名称。错误消息要说明哪个字段、什么规则、如何修复，不能只把边框变红。',
        '标签、说明、错误三件套都要关联',
        {
          title: 'HTML + DevTools：检查邮箱字段的可访问名称和错误说明',
          language: 'HTML + DevTools Console',
          code: `<form novalidate>
  <label for="email">工作邮箱</label>
  <input id="email" name="email" type="email" autocomplete="email"
         aria-describedby="email-help email-error">
  <p id="email-help">用于接收订单通知。</p>
  <p id="email-error" role="alert">请输入包含 @ 的邮箱地址。</p>
</form>

// 浏览器 DevTools Console
const email = document.querySelector('#email');
({
  label: email.labels?.[0]?.textContent.trim(),
  describedBy: email.getAttribute('aria-describedby'),
  error: document.querySelector('#email-error').textContent.trim()
})`,
          output: `{
  label: "工作邮箱",
  describedBy: "email-help email-error",
  error: "请输入包含 @ 的邮箱地址。"
}

点击“工作邮箱”应聚焦输入框；辅助技术读字段时应同时能获得“工作邮箱”和两段说明。`,
        },
      ],
      [
        '原生控件优先',
        'button、a、input、select 和 details 自带键盘、焦点、状态和辅助技术语义。需要执行动作时用 button，不跳转时不要用空 href 的 a；需要导航时用 a 和真实 href，不要用可点击 div。只有原生元素无法表达复杂组合时才使用 ARIA，而且 role、accessible name、状态和键盘行为必须一起实现。手写下拉菜单、弹窗和标签页时，最容易只复制外观而漏掉方向键、Escape、焦点限制和恢复。',
        '语义由元素行为决定，不由样式决定',
        {
          title: 'HTML + DevTools：核对按钮、链接和下拉框的原生语义',
          language: 'HTML + DevTools Console',
          code: `<button type="button" onclick="console.log('save')">保存草稿</button>
<a href="/orders">返回订单列表</a>
<label for="status">订单状态</label>
<select id="status" name="status">
  <option value="pending">待处理</option>
  <option value="shipped">已发货</option>
</select>

// 浏览器 DevTools Console
[...document.querySelectorAll('button, a, select')].map((element) => ({
  tag: element.tagName,
  name: element.textContent.trim() || element.labels?.[0]?.textContent.trim(),
  tabIndex: element.tabIndex
}))`,
          output: `[
  { tag: "BUTTON", name: "保存草稿", tabIndex: 0 },
  { tag: "A", name: "返回订单列表", tabIndex: 0 },
  { tag: "SELECT", name: "订单状态", tabIndex: 0 }
]

三者都能被 Tab 聚焦；button 用 Enter/Space 触发，链接用 Enter 导航，select 用方向键切换，这些行为不需要自己补 JavaScript。`,
        },
      ],
      [
        '导航与焦点顺序要可预测',
        '键盘焦点顺序应跟随 DOM 和阅读顺序，通常与视觉顺序一致。复杂页面可以在顶部放跳到主内容的链接，按 Tab 时先出现，按 Enter 后把焦点送到 main。main 需要 tabindex="-1" 才能通过脚本接收程序化焦点。打开对话框时应把焦点移入对话框、限制在内部并在关闭后返回触发按钮；不要用正数 tabindex 打乱全局顺序。',
        '焦点移动必须有起点、边界和归处',
        {
          title: 'HTML + DevTools：验证跳转主内容和焦点恢复',
          language: 'HTML + DevTools Console',
          code: `<a class="skip-link" href="#main">跳到主内容</a>
<header>
  <button id="open-help" type="button">帮助</button>
</header>
<main id="main" tabindex="-1">
  <h1>订单详情</h1>
</main>

// 浏览器 DevTools Console
const skip = document.querySelector('.skip-link');
skip.focus();
document.activeElement === skip;
skip.click();
document.activeElement.id`,
          output: `true
"main"

真实键盘验收：刷新页面后第一次按 Tab 应落到“跳到主内容”；按 Enter 后焦点进入 main；再按 Tab 应继续到主内容里的第一个交互元素，而不是回到页面顶部。`,
        },
      ],
      [
        '用键盘和缩放实际验收',
        '可访问性不能靠目测“看起来挺清楚”。至少完成一次只用键盘的主流程，把页面放大到 200%，再切到 320px 宽视口检查文字、按钮和错误提示是否仍可读可点。还要检查图片替代文本、重复 id、表单标签、标题层级和横向溢出。DevTools 的 Accessibility 面板能查看名称与角色，Lighthouse 可以扫基础问题，但自动检查不能替代真实键盘和窄屏操作。',
        '把常见阻断项变成可重复的检查脚本',
        {
          title: 'DevTools Console：检查标签、重复 ID、图片和横向溢出',
          language: 'DevTools Console',
          code: `(() => {
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const imagesWithoutAlt = [...document.images].filter((image) => !image.hasAttribute('alt')).length;
  const controlsWithoutName = [...document.querySelectorAll('input, select, textarea')]
    .filter((control) => !control.labels?.length && !control.getAttribute('aria-label'))
    .length;
  return {
    duplicateIds: [...new Set(duplicateIds)],
    imagesWithoutAlt,
    controlsWithoutName,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
  };
})()`,
          output: `{
  duplicateIds: [],
  imagesWithoutAlt: 0,
  controlsWithoutName: 0,
  horizontalOverflow: false
}

随后仍需人工用 Tab、Shift+Tab、Enter、Space 和 Escape 完成主流程；自动脚本通过不等于真实操作无阻断。`,
        },
      ],
    ],
  },
  {
    name: 'CSS 级联、布局与响应式',
    track: 'P01 · HTML / CSS / 浏览器',
    minutes: 42,
    prerequisite: '掌握 HTML 语义，能使用浏览器开发者工具。',
    goal: '能解释级联、继承、盒模型、Flex、Grid 和容器约束，并为桌面与移动设计稳定布局。',
    guidedPractice: '用同一个业务页面分别实现 Flex 和 Grid 布局，在 320px、768px、1024px 和 1440px 下记录断点变化。',
    independentPractice: '修复一个横向溢出页面，写出每个元素的尺寸来源、收缩规则和触控目标调整。',
    commonErrors: ['用固定宽度和大量魔法像素撑布局。', '不理解 min-width 与 minmax 导致内容溢出。'],
    sourceRefs: [CSS_SPEC, 'MDN CSS Layout. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_layout'],
    steps: [
      [
        '级联决定规则竞争',
        '同一个元素可能同时匹配浏览器默认样式、项目基础样式、组件样式和状态样式。最终值由来源与重要性、层叠层、作用域、特异性和出现顺序共同决定。样式不生效时，先在 DevTools 的 Styles 和 Computed 面板找到被划掉的声明以及最终胜出的规则，再判断是结构、层叠层还是选择器问题。反复加 !important 只会让下一次覆盖更困难，并把组件样式变成不可预测的竞争。',
        '先看哪条规则胜出，再改选择器或层级',
        {
          title: 'CSS + DevTools：观察层叠层和状态规则的胜负',
          language: 'CSS + DevTools Console',
          code: `@layer base, components;

@layer base {
  button { color: #1f2933; background: #f3f4f6; }
}

@layer components {
  .button-danger { color: #fff; background: #b42318; }
  .button-danger:hover { background: #8f1d14; }
}

// 页面按钮：<button class="button-danger">删除</button>
// DevTools Console
const button = document.querySelector('.button-danger');
({
  color: getComputedStyle(button).color,
  background: getComputedStyle(button).backgroundColor
})`,
          output: `{
  color: "rgb(255, 255, 255)",
  background: "rgb(180, 35, 24)"
}

components 层在 base 层之后，因此 .button-danger 胜出；若把 .button-danger 移到 base，最终值会不同。DevTools 中可直接看到被划掉的规则。`,
        },
      ],
      [
        '盒模型决定可用空间',
        '元素占用宽度不仅来自 width。内容盒模型中 padding 和 border 会加在声明宽度之外；border-box 把它们计入 width，更适合布局。还要考虑 margin、min-width、max-width 和内容自身的最小尺寸。百分比宽度按包含块计算，但包含块可能不是屏幕；Flex 或 Grid 子项还受轨道与收缩规则影响。排查溢出时要沿父链查看盒模型和约束，不能只看某个组件的 width。',
        '把内容、内边距、边框和包含块一起算',
        {
          title: 'CSS + DevTools：读取真实盒模型和内容宽度',
          language: 'CSS + DevTools Console',
          code: `.panel {
  box-sizing: border-box;
  width: 320px;
  padding: 24px;
  border: 1px solid #cbd5e1;
}

.panel p {
  margin: 0;
  overflow-wrap: anywhere;
}

// 页面：<section class="panel"><p>Order-2026-11-23-0000000001</p></section>
// DevTools Console
const panel = document.querySelector('.panel');
({
  borderBox: panel.getBoundingClientRect().width,
  contentBox: panel.clientWidth - 48,
  boxSizing: getComputedStyle(panel).boxSizing
})`,
          output: `{
  borderBox: 320,
  contentBox: 270,
  boxSizing: "border-box"
}

320 包含左右边框和 padding；内容可布局宽度约 270px。若删除 box-sizing，边框盒会变成 370px，窄屏更容易溢出。`,
        },
      ],
      [
        'Flex 处理一维排布',
        'Flex 适合工具栏、表单行、导航和卡片内容这类一维排布。display:flex 后，主轴由 flex-direction 决定，子项通过 flex-grow、flex-shrink 和 flex-basis 分配空间。常见问题不是“Flex 不生效”，而是子项默认 min-width:auto，长标题、代码或表格按内容最小尺寸撑破容器。需要截断的中间区域必须设置 min-width:0，关键按钮则保留 flex:0 0 auto。',
        '先确定主轴，再处理收缩和最小宽度',
        {
          title: 'CSS + DevTools：让长标题收缩、按钮保持尺寸',
          language: 'CSS + DevTools Console',
          code: `.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 520px;
  padding: 10px;
  border: 1px solid #cbd5e1;
}

.toolbar-title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar button { flex: 0 0 auto; }

// DevTools Console
const title = document.querySelector('.toolbar-title');
({
  display: getComputedStyle(title.parentElement).display,
  titleWidth: title.getBoundingClientRect().width,
  buttonWidth: document.querySelector('.toolbar button').getBoundingClientRect().width,
  overflow: title.scrollWidth > title.clientWidth
})`,
          output: `{
  display: "flex",
  titleWidth: 420,
  buttonWidth: 72,
  overflow: true
}

标题被限制在剩余空间并出现省略号，按钮不被压缩。若删除 .toolbar-title 的 min-width:0，长标题会把按钮推出容器。`,
        },
      ],
      [
        'Grid 处理二维结构',
        'Grid 适合页面骨架、卡片矩阵、表单分区和需要同时控制行列的结构。grid-template-columns 配合 minmax() 可以表达“最小可用、最大自适应”的轨道；auto-fit 与 auto-fill 决定空轨道是否折叠；gap 比 margin 更适合统一间距。移动端重排轨道时应保持 DOM 阅读顺序和键盘顺序，不要用 grid-area 把关键操作移动到视觉上首位、语义上末位。',
        '用轨道和最小最大值表达二维约束',
        {
          title: 'CSS + DevTools：建立自适应卡片网格',
          language: 'CSS + DevTools Console',
          code: `.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  max-width: 960px;
}

.card { min-width: 0; padding: 16px; border: 1px solid #cbd5e1; }

// 页面包含 4 个 <article class="card">
// DevTools Console
const grid = document.querySelector('.cards');
({
  columns: getComputedStyle(grid).gridTemplateColumns,
  cardCount: grid.children.length,
  width: grid.getBoundingClientRect().width
})`,
          output: `{
  columns: "224px 224px 224px 224px",
  cardCount: 4,
  width: 960
}

容器变窄后轨道会自动减少并保持每列至少约 220px；若用固定 300px 四列，在窄屏会横向溢出。`,
        },
      ],
      [
        '响应式由内容压力决定',
        '断点不是设备型号列表。把布局逐渐变窄，观察标题开始换行困难、工具栏按钮挤压、表格无法阅读或触控目标小于 44px 的位置，这些才是内容断点。媒体查询负责视口级重排，容器查询适合让组件按自身宽度变化。代码块、表格和长 URL 需要明确的 overflow、white-space 和 min-width 策略；不能用一个全局 overflow-x:hidden 把真实内容裁掉。',
        '用溢出、可读性和触控目标验收断点',
        {
          title: 'CSS + DevTools：在窄视口检查横向溢出',
          language: 'CSS + DevTools Console',
          code: `.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
}

.table-wrap { min-width: 0; overflow-x: auto; }

@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .layout button { min-height: 44px; }
}

// DevTools 切换设备宽度到 375px 后执行
({
  narrow: matchMedia('(max-width: 760px)').matches,
  viewport: innerWidth,
  pageWidth: document.documentElement.scrollWidth,
  overflowsPage: document.documentElement.scrollWidth > innerWidth,
  buttonHeight: document.querySelector('.layout button').getBoundingClientRect().height
})`,
          output: `{
  narrow: true,
  viewport: 375,
  pageWidth: 375,
  overflowsPage: false,
  buttonHeight: 44
}

页面本身不横向溢出；表格只在 .table-wrap 内部滚动。还要截图检查文字、焦点和固定底栏是否重叠。`,
        },
      ],
    ],
  },
  {
    name: '浏览器渲染、性能与前端安全',
    track: 'P01 · HTML / CSS / 浏览器',
    minutes: 44,
    prerequisite: '能写 HTML/CSS，并使用开发者工具查看网络和元素。',
    goal: '能沿 DOM、CSSOM、布局、绘制和合成解释页面渲染，并用 Web Vitals、网络面板和 CSP 分析性能与安全风险。',
    guidedPractice: '对一个含图片、字体和脚本的页面做性能录制，找出长任务、布局抖动和资源阻塞点。',
    independentPractice: '完成一次首屏性能整改，比较整改前后的 LCP、CLS、包体和请求数，并说明没有牺牲哪些功能。',
    commonErrors: ['只看实验室分数，不看真实用户数据。', '用 innerHTML 拼接不可信内容。'],
    sourceRefs: ['web.dev Web Vitals. https://web.dev/articles/vitals', OWASP],
    steps: [
      [
        '渲染管线决定成本位置',
        '浏览器收到 HTML 后建立 DOM，解析 CSS 建立 CSSOM，再组合成渲染树并计算布局、绘制和合成。修改 width、top、字体等几何信息通常触发布局；修改 color、box-shadow 可能只需重绘；transform 与 opacity 通常可在合成阶段处理。更隐蔽的问题是布局抖动：读取 offsetWidth 会强制浏览器立刻完成布局，紧接着写样式又让它失效，循环中反复读写会把页面拖慢。先确定问题发生在解析、布局、绘制还是合成，再选择优化手段。',
        '用一次受控实验观察强制同步布局成本',
        {
          title: 'DevTools Console：比较批量写与读写交替',
          language: 'DevTools Console',
          code: `const box = document.querySelector('.box');

const batchWrite = () => {
  const start = performance.now();
  for (let index = 0; index < 500; index += 1) {
    box.style.width = (100 + index % 20) + 'px';
  }
  return performance.now() - start;
};

const readWriteLoop = () => {
  const start = performance.now();
  for (let index = 0; index < 500; index += 1) {
    box.style.width = (100 + index % 20) + 'px';
    void box.offsetWidth;
  }
  return performance.now() - start;
};

({ batchWriteMs: batchWrite(), readWriteLoopMs: readWriteLoop() })`,
          output: `{
  batchWriteMs: 1.4,
  readWriteLoopMs: 38.9
}

数值随设备和页面复杂度变化；结论是读写交替明显更慢。真实页面还要用 Performance 面板确认 Layout、Recalculate Style 和 Paint 的耗时。`,
        },
      ],
      [
        '资源优先级影响首屏',
        '首屏需要的 HTML、关键 CSS、字体和主图会竞争带宽与主线程；首屏之外的大图、图表和非关键脚本不应抢先执行。preload 只适合明确可知且很快就会使用的高优先级资源；懒加载适合屏幕外图片和重组件。压缩、缓存和 CDN 减少传输成本，但不能解决脚本解析和布局阻塞。判断优先级要看网络瀑布、请求开始时间、传输大小、执行时间和是否影响 LCP。',
        '从请求瀑布和传输大小找阻塞点',
        {
          title: 'PowerShell + Node.js：测量关键资源的响应头与下载大小',
          language: 'PowerShell',
          code: `@'
import { createServer } from 'node:http';
const html = '<link rel="stylesheet" href="/app.css"><h1>首屏标题</h1><script type="module" src="/app.js"></script>';
const css = 'body{font-family:system-ui;margin:32px}';
const js = 'console.log("app-ready")';
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
    return;
  }
  if (request.url === '/app.css') {
    response.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'public, max-age=31536000, immutable' });
    response.end(css);
    return;
  }
  if (request.url === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable' });
    response.end(js);
    return;
  }
  response.writeHead(404).end();
});
server.listen(8080, '127.0.0.1');
'@ | Set-Content static-server.mjs
$server = Start-Process node -ArgumentList 'static-server.mjs' -PassThru
Start-Sleep -Milliseconds 400
curl.exe -sS -I http://127.0.0.1:8080/app.css
curl.exe -sS -o NUL -w "status=%{http_code} bytes=%{size_download} total=%{time_total}s\\n" http://127.0.0.1:8080/app.js
Stop-Process -Id $server.Id`,
          output: `HTTP/1.1 200 OK
content-type: text/css
cache-control: public, max-age=31536000, immutable

status=200 bytes=41 total=0.001872s

CSS 与 JS 被缓存，HTML 使用 no-store 保持入口最新。若首页图片有 2MB 且排在 CSS 前，网络面板中会出现明显竞争。`,
        },
      ],
      [
        '长任务阻塞交互',
        '浏览器主线程同时负责脚本、样式计算、布局、绘制和用户事件。单个任务超过约 50ms 就会形成 long task，期间点击、输入和滚动可能排队等待。一个大循环、同步 JSON 解析、一次性渲染上万行或大型库初始化都可能造成阻塞。任务切片、虚拟列表、Web Worker 和延迟非关键初始化可以降低单次负担。优化目标不是让主线程“完全空闲”，而是保证输入尽快得到可见反馈，并用 INP、Long Tasks 和 Performance 面板验证。',
        '先捕获长任务，再拆分主线程工作',
        {
          title: 'DevTools Console：记录长期运行任务',
          language: 'DevTools Console',
          code: `const longTasks = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTasks.push({
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      blocking: Math.round(entry.duration - 50)
    });
  }
}).observe({ type: 'longtask', buffered: true });

await new Promise((resolve) => setTimeout(resolve, 2500));
console.table(longTasks);`,
          output: `┌─────────┬───────┬──────────┬──────────┐
│ (index) │ start │ duration │ blocking │
├─────────┼───────┼──────────┼──────────┤
│ 0       │ 318   │ 186      │ 136      │
│ 1       │ 804   │ 92       │ 42       │
└─────────┴───────┴──────────┴──────────┘

blocking 表示超过 50ms 的部分。再用 Performance 面板定位到具体函数；修复后用同一路径复测，而不是只删除日志。`,
        },
      ],
      [
        '安全从不可信输入开始',
        '用户输入、URL 参数、第三方脚本、接口响应和上传文件名都不可信。把字符串拼进 innerHTML 会把文本解释成 HTML 和事件处理器，可能触发 XSS。默认用 textContent、模板框架的文本插值或 DOM API 创建元素；确实需要渲染富 HTML 时，使用维护中的清理器并限制允许的标签与属性。CSP 作为纵深防御限制脚本来源，但不能替代输出编码。认证 Cookie 还要配合 HttpOnly、Secure、SameSite 和最小权限。',
        '先做正确编码，再用 CSP 限制额外能力',
        {
          title: 'PowerShell + Node.js：转义不可信文本并返回 CSP',
          language: 'PowerShell',
          code: `@'
import { createServer } from 'node:http';
const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const userText = '<img src=x onerror=alert(1)>';
const server = createServer((request, response) => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"
  });
  response.end('<main><p>' + escapeHtml(userText) + '</p></main>');
});
server.listen(8081, '127.0.0.1');
'@ | Set-Content safe-server.mjs
$server = Start-Process node -ArgumentList 'safe-server.mjs' -PassThru
Start-Sleep -Milliseconds 400
curl.exe -i http://127.0.0.1:8081/
Stop-Process -Id $server.Id`,
          output: `HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
content-security-policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'none'

<main><p>&lt;img src=x onerror=alert(1)&gt;</p></main>

浏览器显示原始文本而不是创建 img，事件处理器也不会执行；CSP 进一步禁止脚本来源。`,
        },
      ],
      [
        '用真实数据闭环',
        '实验室录制适合定位单一路径，真实用户数据用于确认多数用户在设备、网络和版本上的实际体验。LCP 观察主要内容何时出现，INP 观察交互到下一帧的延迟，CLS 观察布局是否突然跳动。采集时要附带页面路由、发布版本、设备类型和网络分桶，并看 p75 与长尾，不只看平均值。优化后比较同一人群和同一分位数，确认没有把成本转移到低端设备或把功能删掉。',
        '把核心指标、版本和路由一起记录',
        {
          title: 'DevTools Console：采集 LCP、CLS 与导航耗时',
          language: 'DevTools Console',
          code: `const metrics = { route: location.pathname, version: 'web-2026.11.23' };

new PerformanceObserver((list) => {
  const entries = list.getEntries();
  metrics.lcp = Math.round(entries.at(-1).startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });

new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) metrics.cls = (metrics.cls ?? 0) + entry.value;
  }
}).observe({ type: 'layout-shift', buffered: true });

await new Promise((resolve) => setTimeout(resolve, 3000));
metrics.navigation = Math.round(performance.getEntriesByType('navigation')[0].duration);
metrics;`,
          output: `{
  route: "/orders",
  version: "web-2026.11.23",
  lcp: 1840,
  cls: 0.03,
  navigation: 2260
}

单次数字只能用于定位。线上应聚合 p75，并对比发布前后的版本、路由、设备和网络；同时记录用户能否完成任务，避免只追求分数。`,
        },
      ],
    ],
  },
  {
    name: 'JavaScript 类型、作用域与闭包',
    track: 'P02 · JavaScript / TypeScript',
    minutes: 40,
    prerequisite: '掌握 HTML/CSS，能运行浏览器脚本。',
    goal: '能解释 JavaScript 的值类型、作用域链、闭包和模块边界，避免隐式转换与共享状态错误。',
    guidedPractice: '用一组输入演示原始值、对象引用、函数作用域、块级作用域和闭包状态，并预测每步输出。',
    independentPractice: '修复一个循环异步共享变量和对象浅拷贝引发的缺陷，补充边界测试并解释原因。',
    commonErrors: ['把对象赋值当成深拷贝。', '认为 var 和 let 的作用域相同。'],
    sourceRefs: [TC39, 'MDN JavaScript Guide. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide'],
    steps: [
      [
        '先区分原始值与对象引用',
        'number、string、boolean、bigint、symbol、undefined 和 null 属于原始值，赋值时复制值；对象、数组和函数保存对同一堆对象的引用。`const` 只限制变量重新绑定，不冻结对象属性。浅拷贝只复制第一层，嵌套对象仍共享；structuredClone 能复制循环引用和多种内建类型，但不能复制函数。画状态图时必须标出哪些变量指向同一个对象，否则会出现“只改了一个配置，其他模块也变了”的缺陷。',
        '对象赋值、浅拷贝和结构化克隆要分别观察',
        {
          title: 'Node.js：验证值复制、引用共享与 structuredClone',
          language: 'JavaScript',
          code: `const original = { id: 1, tags: ['new'], owner: { name: 'Ada' } };
const alias = original;
const shallow = { ...original };
const deep = structuredClone(original);

alias.tags.push('paid');
shallow.tags.push('vip');
deep.owner.name = 'Grace';

console.table([
  { view: 'original.tags', value: original.tags.join(',') },
  { view: 'shallow.tags', value: shallow.tags.join(',') },
  { view: 'deep.owner', value: deep.owner.name },
  { view: 'sameObject', value: Object.is(original, alias) }
]);`,
          output: `┌─────────┬────────────────┬────────────────┐
│ (index) │ view           │ value          │
├─────────┼────────────────┼────────────────┤
│ 0       │ original.tags  │ new,paid,vip   │
│ 1       │ shallow.tags   │ new,paid,vip   │
│ 2       │ deep.owner     │ Grace          │
│ 3       │ sameObject     │ true           │
└─────────┴────────────────┴────────────────┘

alias 与 original 是同一对象；浅拷贝仍共享 tags 数组；structuredClone 的 owner 与 tags 已独立。`,
        },
      ],
      [
        '作用域决定可见性',
        '作用域是名字能被访问的范围。var 绑定到函数作用域并会提升为 undefined；let 与 const 绑定到最近的块，在声明执行前处于暂时性死区，访问会抛 ReferenceError。提升表示名字在进入作用域时已建立，不等于值已初始化。块级作用域尤其影响 if、for、try 和 catch；同名变量出现在不同块时不是同一个绑定。读代码时要先画出作用域边界，再判断每次访问命中哪一层。',
        '名字可见、已初始化、可重新赋值是三件事',
        {
          title: 'Node.js：观察 var、let 和块级作用域',
          language: 'JavaScript',
          code: `function scopeDemo() {
  console.log('var-before', typeof valueVar);
  try {
    console.log(valueLet);
  } catch (error) {
    console.log('let-before', error.name);
  }

  if (true) {
    var valueVar = 'function-scope';
    let valueLet = 'block-scope';
    console.log('inside', valueLet);
  }

  console.log('after-var', valueVar);
  console.log('after-let', typeof valueLet);
}

scopeDemo();`,
          output: `var-before undefined
let-before ReferenceError
inside block-scope
after-var function-scope
after-let undefined

typeof 对暂时性死区中的名字并不安全；块外 typeof valueLet 只看到未声明名字。真实代码应在块顶部清楚声明并初始化。`,
        },
      ],
      [
        '闭包保存外部状态',
        '闭包是函数与其创建时词法环境的组合。内部函数不只保存当时的值，而是保存对外层绑定的引用，所以外层变量后续变化仍可见。工厂函数用每次调用的新环境隔离状态；循环中 var 只有一个共享绑定，回调常读到循环结束值。闭包适合封装私有状态、回调和缓存，但也可能延长大型对象生命周期。遇到“为什么每个回调都是最后一项”时，先找共享绑定，再改用 let 或函数参数建新绑定。',
        '闭包保存的是绑定引用，不是创建瞬间的副本',
        {
          title: 'Node.js：比较 var 与 let 的循环闭包',
          language: 'JavaScript',
          code: `function makeCounter() {
  let value = 0;
  return {
    increment: () => ++value,
    current: () => value
  };
}

const counter = makeCounter();
counter.increment();
const privateState = counter.current();

const varHandlers = [];
for (var index = 0; index < 3; index += 1) {
  varHandlers.push(() => index);
}

const letHandlers = [];
for (let item = 0; item < 3; item += 1) {
  letHandlers.push(() => item);
}

console.log({ privateState });
console.log('var', varHandlers.map((read) => read()));
console.log('let', letHandlers.map((read) => read()));`,
          output: `{ privateState: 1 }
var [ 3, 3, 3 ]
let [ 0, 1, 2 ]

var 循环只有一个 index 绑定；let 每轮创建新的 item 绑定。没有暴露 value，外部只能通过方法修改计数。`,
        },
      ],
      [
        '模块建立显式边界',
        'ES Module 使用静态 import/export 表达依赖，模块只导出希望公开的最小接口，内部变量默认不可见。依赖从导入关系进入调用图，测试也应按公开 API 编写。模块顶层可变状态会被所有导入方共享；在服务端渲染或测试并行时，这种单例会造成跨请求、跨用例污染。需要共享状态时，用显式函数参数、类实例或容器生命周期管理，而不是偷偷放在模块变量里。',
        '用导出函数保护私有状态，并验证所有导入方看到的是同一实例',
        {
          title: 'Node.js ESM：创建最小计数器模块',
          language: 'JavaScript',
          code: `// counter.mjs
let value = 0;
export const increment = () => ++value;
export const current = () => value;

// main.mjs
import { current, increment } from './counter.mjs';

console.log('start', current());
increment();
increment();
console.log('after', current());

// PowerShell
node main.mjs`,
          output: `start 0
after 2

counter.mjs 没有导出 value，外部无法直接改写。若两个请求都需要独立计数，就不能把 value 放在模块单例中，而应由调用方创建独立实例。`,
        },
      ],
      [
        '用案例验证语言语义',
        '学习语言规则最可靠的方法是“预测 → 执行 → 断言 → 解释”。先写下每个分支预期值和原因，再用 node:assert 固定边界；断言对象引用时使用 Object.is 或断言具体属性，不能只比较 JSON 字符串。测试要覆盖 NaN、-0、循环引用、浅拷贝、越界索引和闭包状态。能解释为什么输出如此，才能把一次实验迁移到真实缺陷。',
        '把容易误判的语义固化成断言',
        {
          title: 'Node.js：用 assert 固定值、引用和闭包边界',
          language: 'JavaScript',
          code: `import assert from 'node:assert/strict';

assert.equal(typeof 1, 'number');
assert.equal(typeof null, 'object');
assert.equal(Number.isNaN(NaN), true);
assert.equal(Object.is(NaN, NaN), true);
assert.equal(Object.is(-0, 0), false);

const source = { nested: { value: 1 } };
const spread = { ...source };
spread.nested.value = 9;
assert.equal(source.nested.value, 9);

const clone = structuredClone(source);
clone.nested.value = 2;
assert.equal(source.nested.value, 9);

console.log('language-boundaries: ok');`,
          output: `language-boundaries: ok

任何断言失败都会给出实际值并终止脚本。测试文件应把“为什么”写在测试名或注释中，否则下一位维护者只看到一堆常数。`,
        },
      ],
    ],
  },
  {
    name: '原型、对象与 this 调用规则',
    track: 'P02 · JavaScript / TypeScript',
    minutes: 36,
    prerequisite: '掌握作用域、闭包和对象引用。',
    goal: '能解释原型链、类语法、this 绑定和属性查找，避免在回调和事件处理中丢失上下文。',
    guidedPractice: '写一个构造函数和 class 版本，比较实例、原型、静态属性和方法查找路径。',
    independentPractice: '修复一个回调中的 this 丢失问题，分别用箭头函数、bind 和显式参数三种方式说明取舍。',
    commonErrors: ['把函数当普通变量后仍期待原对象上下文。', '直接修改内建对象原型。'],
    sourceRefs: [TC39, 'MDN Inheritance and prototype chain. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain'],
    steps: [
      [
        '属性查找沿原型链进行',
        '访问 obj.key 时，JavaScript 先查对象自身属性；找不到就读取内部 [[Prototype]]，沿原型链继续向上，直到 null。数组方法来自 Array.prototype，普通对象可调用 toString 来自 Object.prototype。方法放在原型上，所有实例共享一份函数，实例字段只保存各自状态。Object.getPrototypeOf 可查看真实链接，Object.hasOwn 可判断属性是否属于自身。画清“自身字段、原型方法、最终 null”三段，很多框架对象和调试输出就不再神秘。',
        '先看自身属性，再逐层查看原型',
        {
          title: 'Node.js：追踪对象属性和原型链',
          language: 'JavaScript',
          code: `const orderMethods = {
  total() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
};

const order = Object.create(orderMethods);
order.id = 'O-1001';
order.items = [{ price: 30 }, { price: 12 }];

console.log('total', order.total());
console.log('own-id', Object.hasOwn(order, 'id'));
console.log('own-total', Object.hasOwn(order, 'total'));
console.log('prototype-match', Object.getPrototypeOf(order) === orderMethods);
console.log('chain', orderMethods.__proto__ === Object.prototype);`,
          output: `total 42
own-id true
own-total false
prototype-match true
chain true

total 不在 order 自身，而是沿原型找到 orderMethods.total。方法中的 this 仍然是调用时的 order。`,
        },
      ],
      [
        'class 底层仍是原型机制',
        'class 提供声明式构造器、私有字段和 super 调用，但实例方法默认放在 Class.prototype，静态方法放在构造函数本身。new 创建对象并把原型指向 Class.prototype，然后执行构造器。调试框架对象时应查看实例自身字段、构造函数原型和父类原型，而不是只看类名。class 不能被当作普通函数调用，子类构造器在使用 this 前必须调用 super。理解这些约束能解释 instanceof、继承和私有字段访问。',
        '实例字段、原型方法、静态方法属于三个位置',
        {
          title: 'Node.js：检查 class 实例与原型上的成员',
          language: 'JavaScript',
          code: `class Order {
  static createDraft() {
    return new Order('draft');
  }

  #status;

  constructor(status) {
    this.#status = status;
  }

  get status() {
    return this.#status;
  }

  submit() {
    this.#status = 'submitted';
  }
}

const order = Order.createDraft();
order.submit();

console.log('status', order.status);
console.log('instance-method', Object.hasOwn(Order.prototype, 'submit'));
console.log('instance-field', Object.hasOwn(order, 'status'));
console.log('static', Object.hasOwn(Order, 'createDraft'));
console.log('instanceof', order instanceof Order);`,
          output: `status submitted
instance-method true
instance-field false
static true
instanceof true

submit 位于 Order.prototype，status 是 getter，createDraft 属于构造函数本身；私有字段 #status 只能由类内部访问。`,
        },
      ],
      [
        'this 由调用方式决定',
        '普通函数在严格模式下直接调用时 this 为 undefined；obj.method() 的方法调用把 this 指向 obj；call/apply 可以显式传入上下文，bind 返回固定上下文的新函数；箭头函数没有自己的 this，会捕获定义位置的词法 this。回调丢失上下文最常发生在 `const run = obj.method; run()` 和 `setTimeout(obj.method, 10)`。修复时要看调用点：需要稳定方法可以 bind，需要保留外层对象可以箭头函数，最清晰的业务函数通常直接传依赖参数。',
        '同一个函数因为调用方式不同会得到不同 this',
        {
          title: 'Node.js：验证方法调用、解构调用与 bind',
          language: 'JavaScript',
          code: `'use strict';

const user = {
  name: 'Ada',
  greet(prefix) {
    return prefix + this.name;
  }
};

const detached = user.greet;
const bound = user.greet.bind(user);

console.log('method', user.greet('Hi '));
try {
  console.log(detached('Hi '));
} catch (error) {
  console.log('detached', error.name);
}
console.log('bound', bound('Hi '));
console.log('call', user.greet.call({ name: 'Grace' }, 'Hello '));`,
          output: `method Hi Ada
detached TypeError
bound Hi Ada
call Hello Grace

detached 是普通函数调用，严格模式下 this 为 undefined。对象方法被提取成变量后，原本的调用点关系已经丢失。`,
        },
      ],
      [
        '继承要表达稳定关系',
        '继承适合“确实是同一种东西”并共享稳定生命周期的情况，例如不同支付方式实现同一接口。若只是为了复用几个函数，继承会把无关行为永久绑在一起，并产生脆弱基类。组合通过持有能力对象或注入函数来拼装行为，依赖方向更清楚，测试时可以替换单个能力。策略选择应看变化轴：共享协议可用继承或接口，变化的能力用组合，运行时替换用依赖注入。',
        '复用代码不等于必须建立 is-a 继承',
        {
          title: 'Node.js：用组合拼装订单通知能力',
          language: 'JavaScript',
          code: `const emailSender = {
  send(message) {
    return 'email:' + message;
  }
};

const auditLog = {
  record(message) {
    return 'audit:' + message;
  }
};

function createOrderService({ sender, logger }) {
  return {
    submit(order) {
      const message = 'submitted:' + order.id;
      logger.record(message);
      return sender.send(message);
    }
  };
}

const service = createOrderService({ sender: emailSender, logger: auditLog });
console.log(service.submit({ id: 'O-1001' }));`,
          output: `email:submitted:O-1001

服务只依赖 send 和 record 两个能力。测试可传入假发送器，生产可替换短信或消息队列，不需要改变订单服务继承树。`,
        },
      ],
      [
        '避免污染共享原型',
        '给 Object.prototype、Array.prototype 等内建原型增加可枚举属性，会出现在所有对象、所有库和所有请求中，可能改变 for...in、序列化和第三方判断。即使当前项目“只加一个方法”，依赖升级或全局环境混用也可能冲突。扩展能力应放进独立工具函数、子类、组合包装器或明确的协议实现。处理外部 JSON 时还要避免把 __proto__ 当成普通业务键，并使用 Object.create(null) 或显式白名单构造数据。',
        '把扩展放在局部，不从全局原型借能力',
        {
          title: 'Node.js：使用 null 原型对象和局部函数处理外部键',
          language: 'JavaScript',
          code: `function parseLabels(input) {
  const result = Object.create(null);
  for (const [key, value] of Object.entries(input)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof value !== 'string') continue;
    result[key] = value.slice(0, 64);
  }
  return result;
}

const labels = parseLabels(
  JSON.parse('{"team":"orders","__proto__":{"polluted":true},"count":3}')
);

console.log('labels', labels);
console.log('polluted', ({}).polluted);
console.log('null-prototype', Object.getPrototypeOf(labels) === null);`,
          output: `labels [Object: null prototype] { team: 'orders' }
polluted undefined
null-prototype true

危险键和错误类型被丢弃，结果不继承 Object.prototype。团队需要额外数组能力时，应导出独立函数，而不是修改 Array.prototype。`,
        },
      ],
    ],
  },
  {
    name: '事件循环、Promise 与异步控制流',
    track: 'P02 · JavaScript / TypeScript',
    minutes: 42,
    prerequisite: '掌握函数、回调和对象引用。',
    goal: '能解释调用栈、任务队列、微任务和 Promise 状态，写出可取消、可超时、可汇总错误的异步代码。',
    guidedPractice: '预测一组 setTimeout、Promise.then 和 await 的执行顺序，并用日志验证微任务与宏任务边界。',
    independentPractice: '实现带超时和取消信号的并发请求汇总，确保部分失败不会静默吞掉。',
    commonErrors: ['在循环中串行 await 导致无谓等待。', '忘记处理 Promise rejection。'],
    sourceRefs: ['MDN Promise. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise', 'MDN Event loop. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop'],
    steps: [
      [
        '调用栈只执行同步代码',
        'JavaScript 运行时先执行当前调用栈上的同步函数。函数返回后栈帧弹出，再处理运行时安排的回调。setTimeout 只是请求运行时在至少指定延迟后排队，并不会暂停当前代码；因此一个长时间同步循环会推迟后面的点击、计时器和渲染。排查卡顿时，先找栈中运行最久的同步任务，再区分网络等待与 CPU 阻塞。Promise 的 executor 也是立即同步执行，只有 then/await 后续才进入微任务。',
        '同步循环会推迟已经排队的计时器',
        {
          title: 'Node.js：观察同步阻塞对定时回调的影响',
          language: 'JavaScript',
          code: `const start = Date.now();

setTimeout(() => {
  console.log('timer-delay', Date.now() - start);
}, 10);

console.log('before-loop', Date.now() - start);
while (Date.now() - start < 120) {
  // 故意占用主线程
}
console.log('after-loop', Date.now() - start);`,
          output: `before-loop 0
after-loop 120
timer-delay 121

计时器目标 10ms，但主线程被同步循环占用到约 120ms，回调只能之后执行。真实代码中的大 JSON 解析、长循环和同步加密同理。`,
        },
      ],
      [
        '微任务在每轮任务后清空',
        '一次宏任务结束后，运行时会清空当前微任务队列，再继续下一个宏任务。Promise.then、catch、finally 和 queueMicrotask 都属于微任务；async 函数中 await 后面的代码也在恢复时进入微任务。微任务优先级高，能保证状态更新在下一轮任务前完成，但如果微任务不断追加新微任务，队列长时间不空，渲染和计时器仍会被饿死。分析顺序题时，逐轮画“宏任务 → 全部微任务 → 下一宏任务”。',
        '宏任务之间必须清空微任务队列',
        {
          title: 'Node.js：打印宏任务与微任务的真实顺序',
          language: 'JavaScript',
          code: `const events = [];

console.log('A');
setTimeout(() => {
  console.log('B');
  queueMicrotask(() => console.log('C'));
}, 0);
queueMicrotask(() => {
  console.log('D');
  queueMicrotask(() => console.log('E'));
});
Promise.resolve().then(() => console.log('F'));
console.log('G');

setTimeout(() => console.log('H'), 0);`,
          output: `A
G
D
F
E
B
C
H

当前同步栈 A/G 结束后清空前两个微任务 D/F；D 又排入 E，E 仍被本轮清空。之后才执行定时器 B/C，再到 H。`,
        },
      ],
      [
        'Promise 表达未来结果',
        'Promise 创建时立即执行 executor，状态从 pending 只能转为 fulfilled 或 rejected 一次。then 返回一个新 Promise，返回普通值会 fulfilled，抛异常会 rejected；catch 捕获链上前面未处理的 rejection，finally 不改变结果。await 让 async 函数暂停并把后续逻辑排入微任务，不会阻塞整个线程。每个异步分支都要有明确结局，尤其要避免忘写 return、只处理成功或吞掉 catch 后继续执行。',
        '错误会沿 Promise 链传播，直到被 catch',
        {
          title: 'Node.js：构造可预测的成功与失败链',
          language: 'JavaScript',
          code: `function parseOrder(input) {
  return Promise.resolve(input)
    .then((value) => {
      if (!value.id) throw new Error('ORDER_ID_MISSING');
      return { ...value, id: value.id.trim() };
    })
    .then((order) => ({ status: 'ready', order }))
    .catch((error) => ({ status: 'failed', code: error.message }));
}

console.log(await parseOrder({ id: ' O-1001 ' }));
console.log(await parseOrder({}));

const sequence = [];
Promise.resolve(1)
  .finally(() => sequence.push('finally'))
  .then((value) => sequence.push('then:' + value));
await new Promise((resolve) => setTimeout(resolve, 0));
console.log(sequence);`,
          output: `{ status: 'ready', order: { id: 'O-1001' } }
{ status: 'failed', code: 'ORDER_ID_MISSING' }
[ 'finally', 'then:1' ]

catch 把失败转成可检查结果。若 catch 中重新抛错，后续调用方仍会收到 rejected；finally 不接收值也不会替换原结果。`,
        },
      ],
      [
        '并发控制需要预算',
        'Promise.all 会并发启动所有任务，任务数量大时可能压垮浏览器、服务端或第三方限额。并发控制器维护固定 worker 池，从队列领取任务；每个任务还要有超时、AbortSignal 和明确错误类型。Promise.all 在第一个 rejection 时失败，allSettled 会等待全部结果，race 与 any 语义不同。业务结果对象应区分 fulfilled、rejected、timeout 和 aborted，不能把失败静默映射成 null。',
        '限制并发，并显式区分成功、失败和取消',
        {
          title: 'Node.js：实现有并发上限与取消的任务池',
          language: 'JavaScript',
          code: `async function runLimited(tasks, limit, signal) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      if (signal.aborted) {
        results[index] = { status: 'aborted' };
        continue;
      }
      try {
        results[index] = { status: 'ok', value: await tasks[index]() };
      } catch (error) {
        results[index] = { status: 'failed', code: error.message };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const tasks = [1, 2, 3, 4].map((id) => async () => {
  await new Promise((resolve) => setTimeout(resolve, id * 10));
  if (id === 3) throw new Error('UPSTREAM_' + id);
  return id;
});

console.log(await runLimited(tasks, 2, new AbortController().signal));`,
          output: `[
  { status: 'ok', value: 1 },
  { status: 'ok', value: 2 },
  { status: 'failed', code: 'UPSTREAM_3' },
  { status: 'ok', value: 4 }
]

同一时刻最多两个 worker 运行。真实请求还应把 AbortSignal 传给 fetch，并区分用户取消与超时，而不是只捕获普通异常。`,
        },
      ],
      [
        '异步逻辑也要可测试',
        '异步测试不能靠任意 sleep 等待“应该完成了”。把时间、请求和队列变成可控依赖：用假时钟推进超时，用 deferred Promise 决定何时成功或失败，用断言记录事件顺序。测试要覆盖 resolve、reject、超时、取消和部分失败，并在结束后释放定时器、监听器和连接。只有顺序和时间都由测试控制，失败才可稳定复现，不会因为 CI 机器慢一点就随机通过。',
        '用可控 Promise 验证竞态和清理顺序',
        {
          title: 'Node.js test：验证最后一次请求获胜',
          language: 'JavaScript',
          code: `import test from 'node:test';
import assert from 'node:assert/strict';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('latest request wins', async () => {
  const first = deferred();
  const second = deferred();
  let visible = '';
  let requestId = 0;

  const load = async (request) => {
    const current = ++requestId;
    const value = await request.promise;
    if (current === requestId) visible = value;
  };

  const firstRun = load(first);
  const secondRun = load(second);
  second.resolve('new');
  await secondRun;
  first.resolve('old');
  await firstRun;

  assert.equal(visible, 'new');
});`,
          output: `▶ latest request wins
✔ latest request wins
ℹ pass 1
ℹ fail 0

旧请求晚到也不会覆盖新结果。生产实现还应配合 AbortController 取消旧请求，释放网络与解析资源。`,
        },
      ],
    ],
  },
  {
    name: 'TypeScript 类型系统与企业 API 契约',
    track: 'P02 · JavaScript / TypeScript',
    minutes: 45,
    prerequisite: '掌握 JavaScript 对象、函数和模块。',
    goal: '能用类型别名、联合、泛型、收窄和运行时校验描述 API 契约，而不是只依赖编译期类型。',
    guidedPractice: '为一个订单接口定义领域类型、请求类型和错误类型，并用运行时校验器处理不可信 JSON。',
    independentPractice: '重构一个 any 泛滥的数据层，补齐联合类型、穷尽检查和边界解析，并保留兼容行为。',
    commonErrors: ['把接口响应声明成类型就认为运行时安全。', '用类型断言覆盖真实数据问题。'],
    sourceRefs: [TS_DOCS, 'TypeScript Handbook: Narrowing. https://www.typescriptlang.org/docs/handbook/2/narrowing.html'],
    steps: [
      [
        '类型是缩小非法状态的空间',
        '类型系统的价值不是给变量贴标签，而是让非法组合根本无法表达。订单状态要么是 pending、要么是 paid 或 cancelled，就可以用判别联合把各状态合法字段绑定在一起；不要用一个巨大接口把所有字段都设为可选。状态更新函数接收旧状态并返回新状态，switch 中可精确访问当前分支字段。状态空间越小，测试组合越可控，调用方也越少猜测“这个字段现在到底有没有值”。',
        '用判别联合让非法状态在编译期失败',
        {
          title: 'TypeScript：编译订单状态机',
          language: 'TypeScript',
          code: `type Order =
  | { status: 'pending'; id: string; total: number }
  | { status: 'paid'; id: string; total: number; paidAt: string }
  | { status: 'cancelled'; id: string; reason: string };

function headline(order: Order): string {
  switch (order.status) {
    case 'pending': return '待支付 ' + order.total;
    case 'paid': return '已支付于 ' + order.paidAt;
    case 'cancelled': return '已取消：' + order.reason;
  }
}

const paid: Order = { status: 'paid', id: 'O-1', total: 42, paidAt: '2026-11-23' };
console.log(headline(paid));

// 下一行应产生编译错误：pending 状态没有 paidAt
// const invalid: Order = { status: 'pending', id: 'O-2', total: 10, paidAt: 'now' };`,
          output: `$ pnpm exec tsc --noEmit --strict --target ES2022 --module NodeNext order-state.ts
（无输出，退出码 0）

取消注释最后一行后会得到类似错误：对象字面量只能指定已知属性，pending 分支不接受 paidAt。`,
        },
      ],
      [
        '泛型用于保持关系',
        '泛型让多个位置共享同一个类型参数，从而保持输入与输出关系。例如 pick 函数让返回对象的键与输入键保持一致，调用方获得精确提示；若泛型只出现一次，通常没有建立任何关系。泛型约束应尽量表达真实能力，而不是把所有参数都 extends any。复杂条件类型要有明确业务收益和错误信息，否则团队会被类型体操拖慢。先写普通函数和接口，只有重复类型关系出现时才引入泛型。',
        '泛型要连接输入和输出，而不是装饰函数',
        {
          title: 'TypeScript：保持选字段函数的键关系',
          language: 'TypeScript',
          code: `function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = source[key];
  return result;
}

const order = { id: 'O-1', total: 42, internal: 'secret' };
const publicOrder = pick(order, ['id', 'total']);

console.log(publicOrder);

// 编译错误：status 不是 order 的键
// pick(order, ['id', 'status']);`,
          output: `{ id: 'O-1', total: 42 }

返回类型是 Pick<typeof order, "id" | "total">，调用方只看到真正选中的字段。若传错键名，TypeScript 在编译期指出，不必等运行时得到 undefined。`,
        },
      ],
      [
        '控制流分析负责收窄',
        'TypeScript 会根据 typeof、in、instanceof、真假判断和判别字段收窄联合类型。自定义类型守卫返回 value is T 时，团队成员也能复用同一验证逻辑。收窄不是验证：断言 value is Order 只是在编译期相信函数，运行时仍要实际检查字段。穷尽 switch 中用 never 兜底，新增状态而忘记处理时立即编译失败。异常分支和未知输入也必须建模，不能只写理想路径。',
        '每个联合分支都要被处理和验证',
        {
          title: 'TypeScript：用 typeof、in 与 never 处理结果',
          language: 'TypeScript',
          code: `type ApiResult =
  | { kind: 'ok'; value: { id: string } }
  | { kind: 'error'; message: string }
  | { kind: 'timeout'; afterMs: number };

function assertNever(value: never): never {
  throw new Error('unhandled: ' + JSON.stringify(value));
}

function render(result: ApiResult): string {
  switch (result.kind) {
    case 'ok': return 'order:' + result.value.id;
    case 'error': return 'error:' + result.message;
    case 'timeout': return 'timeout:' + result.afterMs;
    default: return assertNever(result);
  }
}

const results: ApiResult[] = [
  { kind: 'ok', value: { id: 'O-1' } },
  { kind: 'error', message: 'DENIED' },
  { kind: 'timeout', afterMs: 3000 }
];
console.log(results.map(render));`,
          output: `[ 'order:O-1', 'error:DENIED', 'timeout:3000' ]

若新增 kind: "cancelled" 却不处理，default 中的 result 不再是 never，tsc 会报错。` +
          ' 自定义守卫也应检查完整字段，而不是只检查 kind。',
        },
      ],
      [
        '编译期不验证网络数据',
        'fetch 返回的 JSON 是 unknown 世界的数据，声明成 Order 不会让服务器遵守类型。必须逐字段验证：对象、字符串长度、数字范围、枚举值和必填关系，验证后再构造内部类型。类型断言 `as Order` 只是让编译器闭嘴，错误数据仍会进入业务层。手写解析器适合小契约，Zod、Valibot 等库适合复杂结构；无论用哪种，都要在 API 边界统一调用，并对失败返回稳定错误码。',
        '未知 JSON 先经过运行时解析，再进入领域类型',
        {
          title: 'TypeScript + Node.js：校验不可信订单 JSON',
          language: 'TypeScript + Node.js',
          code: `type Order = { id: string; total: number; status: 'pending' | 'paid' };

function parseOrder(input: unknown): Order {
  if (typeof input !== 'object' || input === null) throw new Error('ORDER_OBJECT');
  const row = input as Record<string, unknown>;
  if (typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 32) throw new Error('ORDER_ID');
  if (typeof row.total !== 'number' || !Number.isFinite(row.total) || row.total < 0) throw new Error('ORDER_TOTAL');
  if (row.status !== 'pending' && row.status !== 'paid') throw new Error('ORDER_STATUS');
  return { id: row.id, total: row.total, status: row.status };
}

for (const raw of [
  { id: 'O-1', total: 42, status: 'paid' },
  { id: '', total: 42, status: 'paid' },
  { id: 'O-2', total: -1, status: 'paid' }
]) {
  try {
    console.log(parseOrder(raw));
  } catch (error) {
    console.log('rejected', (error as Error).message);
  }
}`,
          output: `{ id: 'O-1', total: 42, status: 'paid' }
rejected ORDER_ID
rejected ORDER_TOTAL

网络层拿到的仍是 unknown。只有 parseOrder 成功返回后，业务函数才应接收 Order；错误响应应映射为稳定 API code，而不是把异常文本直接展示。`,
        },
      ],
      [
        '公开 API 类型要可演进',
        '公开类型一旦被前端、SDK、脚本或合作方使用，就变成版本契约。新增可选字段通常兼容；给必填字段增加约束、删除字段、改变联合分支或错误码语义会破坏消费者。服务端应保留旧字段一段时间并双写，客户端先兼容再切换，最后才删除。类型、OpenAPI、运行时校验和契约测试应来自同一变更。Deprecated 标记需要给出替换字段和移除版本，不能只写一句“以后别用”。',
        '用版本兼容层让新旧客户端同时工作',
        {
          title: 'TypeScript：定义 V1 与 V2 兼容订单契约',
          language: 'TypeScript',
          code: `type OrderV1 = {
  id: string;
  totalCents: number;
  status: 'pending' | 'paid';
};

type OrderV2 = OrderV1 & {
  currency: 'CNY';
  displayTotal: string;
};

function toV2(order: OrderV1, currency: 'CNY' = 'CNY'): OrderV2 {
  return {
    ...order,
    currency,
    displayTotal: '¥' + (order.totalCents / 100).toFixed(2)
  };
}

function toV1(order: OrderV2): OrderV1 {
  const { currency: _currency, displayTotal: _displayTotal, ...v1 } = order;
  return v1;
}

const legacy: OrderV1 = { id: 'O-1', totalCents: 4200, status: 'paid' };
console.log(toV2(legacy));
console.log(toV1(toV2(legacy)));`,
          output: `{
  id: 'O-1',
  totalCents: 4200,
  status: 'paid',
  currency: 'CNY',
  displayTotal: '¥42.00'
}
{ id: 'O-1', totalCents: 4200, status: 'paid' }

旧客户端继续读取 V1，新客户端使用新增字段。真正上线还需要契约测试验证两侧序列化，并在监控中确认旧字段流量降到零后再删除。`,
        },
      ],
    ],
  },
  {
    name: 'Vue 响应式原理与组合式状态',
    track: 'P03 · Vue 企业前端',
    minutes: 45,
    prerequisite: '完成 JavaScript/TypeScript 基础，能构建简单 SPA。',
    goal: '能解释 Vue 响应式依赖收集、计算属性、侦听器和副作用清理，并设计可测试的组合式状态。',
    guidedPractice: '跟踪一个 ref、computed 和 watch 的更新顺序，记录哪些依赖被读取、哪个副作用被调度。',
    independentPractice: '实现一个带请求取消、错误和加载状态的组合函数，并用单元测试覆盖竞态与卸载。',
    commonErrors: ['在 computed 中写副作用。', '异步完成不回写已卸载组件。'],
    sourceRefs: [VUE_DOCS, 'Vue Reactivity API. https://vuejs.org/api/reactivity-core.html'],
    steps: [
      [
        '响应式来自依赖读取与写入',
        '读取响应式数据时记录依赖，写入时通知相关副作用。理解这一对动作，才能解释为什么某些更新不会触发。',
        '读取建立依赖，写入触发更新',
        {
          title: 'Vue：观察 ref 依赖读取与写入触发',
          language: 'Vue SFC',
          code: `<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';

const quantity = ref(1);
const unitPrice = ref(42);
const total = computed(() => quantity.value * unitPrice.value);
const log: string[] = [];

watchEffect(() => {
  log.push('total:' + total.value);
});

quantity.value = 2;
unitPrice.value = 50;
console.log(log);
</script>`,
          output: `[ "total:42", "total:84", "total:100" ]

watchEffect 读取 total，而 total 读取 quantity 与 unitPrice，依赖链由此建立。未读取的数据写入不会触发这个 effect。`,
        },
      ],
      [
        'computed 负责派生状态',
        '计算属性应基于已有状态生成值，不应发起请求或修改外部数据。缓存依赖变化后失效，不能把它当万能事件总线。',
        '派生状态保持纯函数',
        {
          title: 'Vue Test：验证 computed 缓存与纯派生',
          language: 'TypeScript',
          code: `import { computed, ref } from 'vue';

let evaluations = 0;
const items = ref([{ price: 30 }, { price: 12 }]);
const total = computed(() => {
  evaluations += 1;
  return items.value.reduce((sum, item) => sum + item.price, 0);
});

console.log(total.value, evaluations);
console.log(total.value, evaluations);
items.value = [...items.value, { price: 8 }];
console.log(total.value, evaluations);`,
          output: `42 1
42 1
50 2

依赖未变化时复用缓存，数组替换后重新计算。computed 中不要发请求、写 ref 或记录不可控外部状态。`,
        },
      ],
      [
        'watch 用于显式副作用',
        '侦听器适合同步外部系统、日志或请求，但必须处理清理、竞态和取消。异步回调完成时要检查当前请求是否仍是最后发起者。',
        '副作用必须能停止',
        {
          title: 'Vue：用 AbortController 清理旧请求',
          language: 'TypeScript',
          code: `import { ref, watch } from 'vue';

const keyword = ref('');
const result = ref('');

watch(keyword, async (value, _old, onCleanup) => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  await new Promise((resolve) => setTimeout(resolve, value === 'slow' ? 200 : 20));
  if (controller.signal.aborted) return;
  result.value = 'result:' + value;
}, { immediate: false });

keyword.value = 'slow';
keyword.value = 'fast';`,
          output: `最终 result 为 "result:fast"

slow 请求的 cleanup 在 fast 开始前已 abort，晚到结果不会覆盖新值。真实 fetch 必须把 signal 传给网络层。`,
        },
      ],
      [
        '组合式函数封装领域状态',
        '把加载、错误、数据和操作封装成独立模块，避免组件直接管理所有细节。接口稳定后，组件只负责展示和事件。',
        '状态逻辑可独立测试',
        {
          title: 'Vue：组合函数返回只读结果与显式动作',
          language: 'TypeScript',
          code: `import { readonly, ref } from 'vue';

export function useOrderSearch(fetcher: (query: string) => Promise<string[]>) {
  const query = ref('');
  const rows = ref<string[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function search() {
    loading.value = true;
    error.value = '';
    try {
      rows.value = await fetcher(query.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'SEARCH_FAILED';
    } finally {
      loading.value = false;
    }
  }

  return { query, rows: readonly(rows), loading: readonly(loading), error: readonly(error), search };
}`,
          output: `组合函数公开 query、只读 rows/loading/error 和 search 动作；组件不能直接改 rows。测试可注入假 fetcher，无需挂载完整页面。`,
        },
      ],
      [
        '用 DevTools 与源码验证',
        '观察组件更新和依赖关系，再对照 runtime-core 调度器理解批量更新。不是看到数据变化就下结论。',
        '现象要和调度机制对上',
        {
          title: 'PowerShell + Vue DevTools：记录刷新次数与调度队列',
          language: 'PowerShell + TypeScript',
          code: `@'
import { nextTick, ref, watchEffect } from 'vue';
const count = ref(0);
let renders = 0;
watchEffect(() => {
  count.value;
  renders += 1;
});
count.value = 1;
count.value = 2;
console.log('before-tick', renders);
await nextTick();
console.log('after-tick', renders);
'@ | Set-Content scheduler-check.mjs
node scheduler-check.mjs
rg -n "queueJob|flushJobs|nextTick" node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js`,
          output: `before-tick 1
after-tick 2

同一轮两个写入只产生一次刷新记录，nextTick 后队列已清空。源码锚点可定位 queueJob、flushJobs 与 nextTick 的实现。`,
        },
      ],
    ],
  },
  {
    name: 'Vue 组件、组合式 API 与工程边界',
    track: 'P03 · Vue 企业前端',
    minutes: 40,
    prerequisite: '掌握 Vue 响应式基础。',
    goal: '能设计稳定组件接口，区分展示组件与容器组件，并用插槽、事件和依赖注入控制耦合。',
    guidedPractice: '把一个巨型页面拆成页面容器、领域组件和基础控件，列出每层输入、输出和副作用。',
    independentPractice: '为一个表单组件补齐键盘、禁用、错误和异步提交状态，并通过组件测试验证。',
    commonErrors: ['通过全局状态传递所有参数。', '子组件直接修改父组件对象。'],
    sourceRefs: [VUE_DOCS, VITE_DOCS],
    steps: [
      [
        '组件接口先于实现',
        'Props 表达稳定输入，事件表达外部动作，插槽表达可组合内容。组件不应该知道父页面太多业务细节。',
        '输入和输出要可命名',
        {
          title: 'Vue SFC：定义明确 props、emits 和 slot',
          language: 'Vue SFC',
          code: `<script setup lang="ts">
defineProps<{ title: string; disabled?: boolean }>();
const emit = defineEmits<{ save: [draft: { title: string }]; cancel: [] }>();
</script>

<template>
  <section>
    <h2>{{ title }}</h2>
    <slot name="meta" />
    <button type="button" @click="emit('cancel')">取消</button>
    <button type="button" :disabled="disabled" @click="emit('save', { title })">保存</button>
  </section>
</template>`,
          output: `父组件通过 title/disabled 输入，通过 save/cancel 接收动作，通过 meta 插槽扩展内容。子组件不能直接修改父对象。`,
        },
      ],
      [
        '展示与容器分离',
        '展示组件负责渲染与可访问性，容器组件负责请求和业务流程。这样既能测试状态，也能复用界面。',
        '让每个组件只承担一种变化',
        {
          title: 'Vue：容器请求数据，展示组件只接收状态',
          language: 'Vue SFC',
          code: `<!-- OrderPanel.vue -->
<script setup lang="ts">
defineProps<{
  state: { status: 'idle' | 'loading' | 'ready' | 'error'; rows: string[]; message?: string };
}>();
</script>
<template>
  <p v-if="state.status === 'loading'" role="status">加载中</p>
  <p v-else-if="state.status === 'error'" role="alert">{{ state.message }}</p>
  <ul v-else><li v-for="row in state.rows" :key="row">{{ row }}</li></ul>
</template>

<!-- OrderPage.vue 负责请求、取消和权限。 -->
<OrderPanel :state="state" />`,
          output: `OrderPanel 不访问 API、不读取路由，可在测试中直接传 loading/error/ready 状态；OrderPage 负责远程数据生命周期。`,
        },
      ],
      [
        '组合式 API 不是全局变量',
        '在模块顶层创建响应式状态会跨请求共享。组件状态应在组件或组合函数实例内创建，服务器端渲染尤其要避免请求间污染。',
        '状态作用域必须明确',
        {
          title: 'Vue：用工厂函数隔离每个调用方状态',
          language: 'TypeScript',
          code: `import { ref } from 'vue';

// 错误：所有请求共享同一个 user
export const sharedUser = ref<string | null>(null);

// 正确：每次调用 useUserState 都得到独立状态
export function useUserState() {
  const user = ref<string | null>(null);
  const setUser = (value: string) => { user.value = value; };
  const clear = () => { user.value = null; };
  return { user, setUser, clear };
}

const requestA = useUserState();
const requestB = useUserState();
requestA.setUser('Ada');`,
          output: `requestA.user 为 "Ada"，requestB.user 仍为 null。SSR 每个请求或组件实例应调用工厂函数，不能复用模块单例。`,
        },
      ],
      [
        '表单需要完整状态机',
        '输入、校验、提交、成功、失败和取消是不同状态。按钮禁用、错误关联和焦点移动都要与状态一致。',
        '表单不是只有 loading',
        {
          title: 'Vue：用联合状态驱动表单提交',
          language: 'TypeScript',
          code: `type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; orderId: string }
  | { kind: 'error'; message: string; retryable: boolean };

function submitButtonLabel(state: SubmitState) {
  return state.kind === 'submitting' ? '提交中' : '提交订单';
}

function errorText(state: SubmitState) {
  return state.kind === 'error' ? state.message : '';
}

const state: SubmitState = { kind: 'error', message: '网络中断', retryable: true };
console.log(submitButtonLabel(state), errorText(state), state.retryable);`,
          output: `提交订单 网络中断 true

联合状态避免 loading、error、success 同时为真。模板应让按钮 disabled 只在 submitting，错误通过 aria-describedby 关联到字段或摘要。`,
        },
      ],
      [
        '用测试锁定组件契约',
        '测试应该验证用户可见行为和事件，不依赖内部 class 或实现细节。组件拆分后再测更容易定位失败。',
        '组件测试从用户行为出发',
        {
          title: 'Vue Test Utils：从可见文本和 emit 断言',
          language: 'TypeScript',
          code: `import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import OrderPanel from './OrderPanel.vue';

test('shows error and disables duplicate submit', async () => {
  const wrapper = mount(OrderPanel, {
    props: { state: { status: 'error', rows: [], message: '保存失败' } }
  });
  expect(wrapper.get('[role="alert"]').text()).toContain('保存失败');

  await wrapper.setProps({ state: { status: 'loading', rows: [] } });
  expect(wrapper.get('[role="status"]').text()).toContain('加载中');
});`,
          output: `✔ shows error and disables duplicate submit

测试读取用户可见角色与文本，没有依赖内部 class。真实提交禁用还应断言 button disabled 与 emit 次数。`,
        },
      ],
    ],
  },
  {
    name: 'Vue Router、Pinia 与请求状态',
    track: 'P03 · Vue 企业前端',
    minutes: 42,
    prerequisite: '完成 Vue 组件与组合式 API。',
    goal: '能建立路由权限、页面状态和服务器数据边界，处理导航失败、刷新恢复和请求竞态。',
    guidedPractice: '实现登录后路由守卫、用户状态、列表分页和详情请求，并制造一次快速切换页面的竞态。',
    independentPractice: '重构一个将服务器数据直接放进全局 store 的页面，改为查询缓存与本地 UI 状态分离。',
    commonErrors: ['把所有服务器数据永久放进全局状态。', '路由守卫只检查登录，不检查资源权限。'],
    sourceRefs: [VUE_DOCS, 'Pinia Documentation. https://pinia.vuejs.org/'],
    steps: [
      [
        '路由描述页面地址与权限边界',
        '路径参数、查询参数和导航守卫共同决定页面上下文。守卫只负责导航决策，真正授权仍必须由服务端验证。',
        '前端守卫不替代服务端授权',
        {
          title: 'Vue Router：登录守卫与返回地址',
          language: 'TypeScript',
          code: `router.beforeEach((to) => {
  if (!to.meta.requiresAuth) return true;
  const session = useSession();
  if (session.authenticated) return true;
  return {
    name: 'login',
    query: { redirect: to.fullPath }
  };
});

router.beforeEach((to) => {
  if (to.meta.roles && !to.meta.roles.includes(useSession().role)) {
    return { name: 'forbidden' };
  }
  return true;
});`,
          output: `未登录访问 /orders/42 会跳到 /login?redirect=%2Forders%2F42。

登录成功后只可跳转站内路径。即使前端守卫放行，服务端仍必须按用户与资源检查订单归属。`,
        },
      ],
      [
        '区分服务器状态与 UI 状态',
        '远程数据有缓存、过期、重试和失效策略，UI 状态有展开、筛选和草稿。把它们混成一个巨大 store 会让生命周期失控。',
        '按数据生命周期建状态',
        {
          title: 'Pinia：只保存跨页面 UI 状态',
          language: 'TypeScript',
          code: `export const useFilters = defineStore('filters', () => {
  const pageSize = ref(20);
  const density = ref<'comfortable' | 'compact'>('comfortable');
  return { pageSize, density };
});

// 远程订单使用查询缓存
const { data, isPending, error, refetch } = useQuery({
  key: ['orders', filters.status, page],
  queryFn: ({ signal }) => api.orders({ status: filters.status, page, signal }),
  staleTime: 30_000
});`,
          output: `Pinia 保存 pageSize 与 density；订单列表由查询缓存管理加载、过期、重试和信号取消。删除页面后不必永久保留服务器副本。`,
        },
      ],
      [
        '请求竞态需要版本判断',
        '快速切换筛选条件时，旧请求可能晚于新请求返回。应取消旧请求或比较请求标识，避免旧数据覆盖新页面。',
        '最后发起不一定最后返回',
        {
          title: 'Vue：筛选切换时取消上一请求',
          language: 'TypeScript',
          code: `let controller: AbortController | null = null;

async function load(keyword: string) {
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  try {
    const response = await fetch('/api/orders?q=' + encodeURIComponent(keyword), {
      signal: current.signal
    });
    if (current !== controller) return;
    rows.value = await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    errorMessage.value = 'LOAD_FAILED';
  }
}`,
          output: `连续输入 slow、fast 时，slow 请求被 abort。即使底层忽略取消，current !== controller 也会阻止旧结果回写。`,
        },
      ],
      [
        '导航恢复要考虑刷新',
        '刷新、深链接和返回按钮都可能绕过应用内正常流程。页面应从 URL 和缓存重建状态，不能只依赖内存变量。',
        'URL 是最稳定的页面状态',
        {
          title: 'Vue Router：把筛选和分页写进 query',
          language: 'TypeScript',
          code: `const route = useRoute();
const router = useRouter();

const state = reactive({
  q: String(route.query.q ?? ''),
  status: String(route.query.status ?? 'all'),
  page: Number(route.query.page ?? 1)
});

watch(state, () => {
  router.replace({
    query: {
      q: state.q || undefined,
      status: state.status === 'all' ? undefined : state.status,
      page: state.page > 1 ? String(state.page) : undefined
    }
  });
});`,
          output: `URL 变为 /orders?q=O-1&status=paid&page=2；刷新与分享都能恢复同一筛选。返回按钮也能回到上一组 query，而不是回到内存中的默认值。`,
        },
      ],
      [
        '错误要有可恢复路径',
        '网络失败、权限失败和资源不存在需要不同界面。提供重试、返回或重新登录入口，而不是统一显示空白。',
        '错误状态也要能操作',
        {
          title: 'Vue：按 HTTP 语义渲染恢复动作',
          language: 'TypeScript',
          code: `function errorAction(status: number) {
  if (status === 401) return { label: '重新登录', route: '/login' };
  if (status === 403) return { label: '申请权限', route: '/access' };
  if (status === 404) return { label: '返回列表', route: '/orders' };
  if (status === 429 || status >= 500) return { label: '稍后重试', action: 'retry' };
  return { label: '返回首页', route: '/' };
}

console.log(errorAction(403));
console.log(errorAction(503));`,
          output: `{ label: '申请权限', route: '/access' }
{ label: '稍后重试', action: 'retry' }

错误页要保留用户输入与筛选。重试应有次数或退避限制，避免故障时无限放大流量。`,
        },
      ],
    ],
  },
  {
    name: 'Vue 源码与 Nuxt SSR 部署',
    track: 'P03 · Vue 企业前端',
    minutes: 55,
    prerequisite: '完成 Vue 响应式、组件和路由状态课程。',
    goal: '能沿 Vue runtime-core 的渲染与调度链路解释更新，并完成 Nuxt SSR/SSG 的配置、部署、监控与回滚。',
    guidedPractice: '固定 Vue 与 Nuxt 版本，定位 runtime-core 渲染器和 scheduler，再用构建产物观察 SSR 与 hydration 输出。',
    independentPractice: '部署一个 Nuxt SSR 应用，加入健康检查、日志、错误监控、缓存策略和版本回滚说明。',
    commonErrors: ['服务端与客户端访问同一浏览器全局对象。', '认为 SSR 自动解决所有 SEO 与性能问题。'],
    sourceRefs: [VUE_DOCS, NUXT_DOCS],
    steps: [
      [
        '渲染器把虚拟节点变成真实界面',
        'Vue 通过 renderer 创建、更新和卸载节点，patch 过程比较新旧结构。更新性能取决于更新范围和调度策略，不是虚拟 DOM 越少越绝对。',
        '先定位 patch，再谈性能',
        {
          title: 'PowerShell：固定版本并定位 Vue renderer 源码',
          language: 'PowerShell',
          code: `pnpm list vue
rg -n "function patch\\(|processComponent|patchElement|unmount" node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
rg -n "function baseCreateRenderer" node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js`,
          output: `vue 3.5.x

3900: const patch = (n1, n2, container, anchor = null, ...)
4210: const processComponent = (...)
4610: const patchElement = (...)
5400: const unmount = (...)

行号随版本变化；源码报告必须记录 Vue 版本、文件路径和实际函数名。`,
        },
      ],
      [
        '调度器负责批量与顺序',
        '响应式写入不会立即逐次渲染，更新任务进入队列后统一处理。理解调度能解释同一轮多个状态修改为何只看到一次结果。',
        '更新有队列和优先级',
        {
          title: 'PowerShell + Node：验证 nextTick 前的批量更新',
          language: 'PowerShell',
          code: `@'
import { nextTick, ref, watchEffect } from 'vue';
const count = ref(0);
const snapshots = [];
watchEffect(() => snapshots.push(count.value));
count.value = 1;
count.value = 2;
console.log('sync', snapshots);
await nextTick();
console.log('tick', snapshots);
'@ | Set-Content vue-scheduler.mjs
node --input-type=module vue-scheduler.mjs
rg -n "queueJob|flushJobs|Promise.resolve\\(\\).then" node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js`,
          output: `sync [ 0 ]
tick [ 0, 2 ]

同步阶段只记录旧值；刷新队列后直接看到最终值 2。源码锚点可确认 queueJob 去重与 flushJobs 清空顺序。`,
        },
      ],
      [
        'SSR 与浏览器环境不同',
        '服务端没有 window 和 document，每次请求需要独立状态。浏览器接管后 hydration 必须与服务端结构一致，否则会出现闪烁或重复请求。',
        '服务端状态不能跨请求共享',
        {
          title: 'Nuxt：请求级状态与客户端专用逻辑',
          language: 'Vue SFC',
          code: `<script setup lang="ts">
const requestId = useState('request-id', () => crypto.randomUUID());
const requestUrl = useRequestURL();
const mounted = ref(false);
onMounted(() => { mounted.value = true; });
</script>

<template>
  <main :data-request-id="requestId">
    <p>请求主机：{{ requestUrl.host }}</p>
    <ClientOnly><ChartWidget /></ClientOnly>
    <p v-if="mounted">浏览器已接管</p>
  </main>
</template>`,
          output: `服务端每次请求获得独立 request-id。hydration 前不渲染依赖 window 的 ChartWidget，挂载后再显示浏览器状态，避免结构不一致。`,
        },
      ],
      [
        '部署要区分 SSG 与 SSR',
        '静态生成产物可放 CDN，SSR 需要可运行的 Node 或边缘环境。缓存、健康检查、日志和进程资源限制都要按运行形态设计。',
        '构建形态决定部署拓扑',
        {
          title: 'Nuxt：构建 SSR 制品并检查健康接口',
          language: 'PowerShell',
          code: `@'
export default defineNuxtConfig({
  ssr: true,
  nitro: {
    preset: 'node-server'
  },
  routeRules: {
    '/': { swr: 60 },
    '/account/**': { ssr: true, cache: false }
  }
});
'@ | Set-Content nuxt.config.ts
pnpm build
node .output/server/index.mjs
curl.exe -i http://127.0.0.1:3000/api/health`,
          output: `HTTP/1.1 200 OK
content-type: application/json

{"status":"ok","uptime":42}

首页可使用 60 秒 SWR，账户页保持实时 SSR。静态 CDN 方案与 Node SSR 方案的健康检查、缓存键和扩缩容方式不同。`,
        },
      ],
      [
        '版本回滚要包含服务端状态',
        '回滚前端版本时还要检查 API 兼容、缓存和 SSR 运行时。发布记录必须包含镜像或静态包版本与配置版本。',
        '前后端兼容也是回滚条件',
        {
          title: 'PowerShell：发布清单、健康检查与回滚',
          language: 'PowerShell',
          code: `$release = [ordered]@{
  gitSha = (git rev-parse HEAD)
  image = 'registry.example/nuxt:2026.11.23-1'
  configVersion = 'cfg-42'
  apiContract = 'orders-v2'
}
$release | ConvertTo-Json | Set-Content release.json
curl.exe --fail http://127.0.0.1:3000/api/health
if ($LASTEXITCODE -ne 0) {
  docker compose pull nuxt
  docker compose up -d --no-deps nuxt
}`,
          output: `release.json 记录提交、镜像、配置和 API 契约版本。

健康检查失败时只回滚 SSR 服务，但 API 与缓存仍必须兼容旧镜像。发布后应检查 hydration 错误率和 5xx，再决定是否扩大流量。`,
        },
      ],
    ],
  },
  {
    name: 'React 组件、状态与表单',
    track: 'P04 · React 企业前端',
    minutes: 42,
    prerequisite: '完成 JavaScript/TypeScript 基础。',
    goal: '能用组件组合、受控状态和不可变更新建立可预测表单，并避免派生状态重复存储。',
    guidedPractice: '实现一个分步表单，区分本地草稿、校验结果、提交状态和服务器错误。',
    independentPractice: '重构一个多个布尔值互相冲突的组件，用联合状态和不可变更新表达完整状态机。',
    commonErrors: ['直接修改 state 中的嵌套对象。', '把可以计算的值重复保存到 state。'],
    sourceRefs: [REACT_DOCS, 'React Managing State. https://react.dev/learn/managing-state'],
    steps: [
      [
        '组件是状态与界面的映射',
        '相同输入和状态应得到稳定界面。渲染函数不应修改外部状态或发起不可控副作用，否则很难复现问题。',
        '渲染保持可预测',
        {
          title: 'React：纯渲染与事件更新',
          language: 'TSX',
          code: `function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial);

  const increment = () => {
    setCount((current) => current + 1);
    setCount((current) => current + 1);
  };

  return <button onClick={increment}>count:{count}</button>;
}

// 相同 props 与 state 必须渲染相同结果
// 不在渲染体中写 localStorage、fetch 或修改外部数组`,
          output: `点击一次后显示 count:2。

函数式更新基于最新 pending state 逐个计算。渲染本身只返回 JSX，没有外部副作用，因此可以在并发渲染中安全重试。`,
        },
      ],
      [
        '状态最小化',
        '只保存无法从现有数据计算的信息。重复保存派生值会产生多个真相，并需要额外同步逻辑。',
        '一个事实只存一处',
        {
          title: 'React：从明细计算总价，不重复存 state',
          language: 'TSX',
          code: `function OrderSummary() {
  const [items, setItems] = useState([
    { id: 'A', price: 30, quantity: 1 },
    { id: 'B', price: 12, quantity: 2 }
  ]);

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const updateQuantity = (id: string, quantity: number) => {
    setItems((current) =>
      current.map((item) => item.id === id ? { ...item, quantity } : item)
    );
  };

  return <p>total:{total}</p>;
}`,
          output: `首次渲染 total:54。修改数量后由 items 重新计算总价。

若同时保存 total state，就必须在每个增删改路径手动同步，容易产生界面与明细不一致。`,
        },
      ],
      [
        '用联合状态表达互斥流程',
        'idle、submitting、success 和 error 可以构成一个状态对象，避免 loading 与 error 同时为真的非法组合。',
        '让非法状态难以表示',
        {
          title: 'React：判别联合驱动提交按钮',
          language: 'TSX',
          code: `type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; orderId: string }
  | { kind: 'error'; message: string };

function SubmitButton({ state }: { state: SubmitState }) {
  const label = state.kind === 'submitting' ? '提交中' : '提交订单';
  return (
    <button type="button" disabled={state.kind === 'submitting'}>
      {label}
    </button>
  );
}

console.log(<SubmitButton state={{ kind: 'error', message: '保存失败' }} />);`,
          output: `error 状态仍允许重试，按钮显示“提交订单”；submitting 状态禁用重复点击。

联合类型让 loading 与 error 无法同时为真，也避免 success 状态下没有 orderId 的非法组合。`,
        },
      ],
      [
        '不可变更新保护比较',
        '更新对象和数组时创建新引用，帮助 React 判断变化。深层不可变结构要拆分更新函数，避免整棵树手工复制。',
        '更新路径必须产生新引用',
        {
          title: 'React：不可变更新嵌套订单',
          language: 'TSX',
          code: `type Order = {
  id: string;
  customer: { name: string; vip: boolean };
  items: Array<{ sku: string; quantity: number }>;
};

function markVip(order: Order): Order {
  return {
    ...order,
    customer: { ...order.customer, vip: true }
  };
}

function changeQuantity(order: Order, sku: string, quantity: number): Order {
  return {
    ...order,
    items: order.items.map((item) =>
      item.sku === sku ? { ...item, quantity } : item
    )
  };
}`,
          output: `外层 Order、被修改的 customer 或 item 获得新引用；未修改的 items 元素保持原引用。React 能沿引用判断更新范围。`,
        },
      ],
      [
        '表单错误要贴近控件',
        '校验错误要与字段关联，提交错误要给出恢复动作。异步提交要防止重复点击，并在卸载或取消时停止更新。',
        '错误和恢复路径一起设计',
        {
          title: 'React：字段错误与 aria-describedby',
          language: 'TSX',
          code: `function EmailField() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const validate = () => {
    const next = email.includes('@') ? '' : '请输入包含 @ 的邮箱';
    setError(next);
    return next === '';
  };

  return (
    <label>
      工作邮箱
      <input
        value={email}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'email-error' : undefined}
        onChange={(event) => setEmail(event.target.value)}
        onBlur={validate}
      />
      {error && <span id="email-error" role="alert">{error}</span>}
    </label>
  );
}`,
          output: `失焦后空邮箱显示“请输入包含 @ 的邮箱”，输入框标记 aria-invalid，并通过 email-error 关联说明。

提交失败还应保留输入、显示服务端错误摘要，并在请求取消或组件卸载后停止 setState。`,
        },
      ],
    ],
  },
  {
    name: 'React Hooks、渲染与副作用边界',
    track: 'P04 · React 企业前端',
    minutes: 46,
    prerequisite: '掌握 React 组件和状态。',
    goal: '能解释 Hooks 调用规则、闭包捕获、依赖数组、Effect 清理和并发渲染下的更新顺序。',
    guidedPractice: '用日志观察一次事件更新、Effect 执行、清理和依赖变化，并制造一个过期闭包问题。',
    independentPractice: '修复一个重复请求和卸载后更新的 Hook，补充测试并说明为什么没有简单删除依赖数组。',
    commonErrors: ['为消除警告而随意删除依赖。', '在 Effect 中频繁创建未清理订阅。'],
    sourceRefs: [REACT_DOCS, 'React useEffect. https://react.dev/reference/react/useEffect'],
    steps: [
      [
        'Hooks 依赖稳定调用顺序',
        'Hook 调用顺序在每次渲染中必须一致，不能在条件分支中临时调用。理解这一点才能读懂 Hook 链表和调试异常。',
        '顺序稳定是 Hook 的前提',
        {
          title: 'React + ESLint：捕获条件 Hook 调用',
          language: 'TSX',
          code: `function Profile({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [name, setName] = useState('Ada');
  }
  const [active, setActive] = useState(true);
  return active;
}

// PowerShell
pnpm exec eslint Profile.tsx`,
          output: `error  React Hook "useState" is called conditionally

每次渲染可能少调用第一个 Hook，导致后续 useState 读取错误槽位。正确做法是把 Hook 移到顶层，缺少状态时返回不同界面。`,
        },
      ],
      [
        '闭包捕获本次渲染值',
        '回调读取的是创建它的那次渲染中的值。遇到过期状态时，应使用更新函数、Effect 同步或取消机制，不要依赖偶然的最新变量。',
        '先判断值来自哪次渲染',
        {
          title: 'React：比较闭包值与函数式更新',
          language: 'TSX',
          code: `function Counter() {
  const [count, setCount] = useState(0);

  const scheduleWrong = () => {
    setTimeout(() => setCount(count + 1), 100);
  };

  const scheduleRight = () => {
    setTimeout(() => setCount((current) => current + 1), 100);
  };

  return <button onClick={() => { scheduleWrong(); scheduleRight(); }}>{count}</button>;
}`,
          output: `点击一次后通常变为 1，而不是 2。

两个回调都捕获 count:0；scheduleWrong 写 1，函数式更新随后基于最新值也写 1。连续快速更新必须使用 current => 形式。`,
        },
      ],
      [
        'Effect 同步外部系统',
        '请求、订阅和定时器都属于外部系统，需要依赖、清理和取消。能直接在事件处理时完成工作，不必放进 Effect。',
        'Effect 不是生命周期大杂烩',
        {
          title: 'React：请求取消与卸载清理',
          language: 'TSX',
          code: `function OrderDetail({ id }: { id: string }) {
  const [row, setRow] = useState<string>('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/orders/' + id, { signal: controller.signal })
      .then((response) => response.text())
      .then(setRow)
      .catch((error) => {
        if (error.name !== 'AbortError') setRow('LOAD_FAILED');
      });
    return () => controller.abort();
  }, [id]);

  return <p>{row}</p>;
}`,
          output: `id 变化时 cleanup 先终止旧请求，再启动新请求。卸载后不会继续 setRow。

依赖数组包含 id，因为请求 URL 由它决定；删除依赖会保留旧闭包并请求错误资源。`,
        },
      ],
      [
        '并发更新可能被中断',
        'React 可能暂停或丢弃部分渲染工作，渲染阶段不能产生外部副作用。保持纯渲染才能支持并发特性。',
        '渲染阶段保持纯函数',
        {
          title: 'React：渲染期副作用与正确位置',
          language: 'TSX',
          code: `function Report({ order }: { order: { id: string } }) {
  // 错误：每次渲染都写外部系统
  analytics.track('view', order.id);

  // 正确：提交后由 Effect 同步一次
  useEffect(() => {
    analytics.track('view', order.id);
  }, [order.id]);

  return <h1>订单 {order.id}</h1>;
}

// React StrictMode 开发环境可能额外执行检查，帮助暴露不纯渲染。`,
          output: `渲染函数可能执行多次或被丢弃；analytics 调用应移到提交后的 Effect。

Effect 也可能因依赖变化重跑，埋点函数仍需去重或由业务后端处理幂等。`,
        },
      ],
      [
        '用行为测试验证 Hook',
        '测试用户交互、请求和错误状态，不直接检查 Hook 内部调用顺序。竞态和清理需要可控的假时钟与假请求。',
        '测试副作用的结果',
        {
          title: 'React Testing Library：断言用户看到的结果',
          language: 'TSX',
          code: `test('keeps latest request result', async () => {
  const user = userEvent.setup();
  render(<OrderSearch search={fakeSearch} />);

  await user.type(screen.getByLabelText('搜索订单'), 'slow');
  await user.clear(screen.getByLabelText('搜索订单'));
  await user.type(screen.getByLabelText('搜索订单'), 'fast');

  expect(await screen.findByText('result:fast')).toBeVisible();
  expect(screen.queryByText('result:slow')).not.toBeInTheDocument();
  expect(fakeSearch.lastSignal?.aborted).toBe(true);
});`,
          output: `✔ keeps latest request result

测试从标签、输入和可见结果出发，同时断言旧请求已取消。没有读取 Hook 内部变量，也没有使用任意 sleep。`,
        },
      ],
    ],
  },
  {
    name: 'React Router、数据缓存与 Next.js 部署',
    track: 'P04 · React 企业前端',
    minutes: 48,
    prerequisite: '完成 React 状态与 Hooks。',
    goal: '能设计路由、查询缓存和服务端渲染边界，完成 Next.js 的构建、部署、错误监控和回滚。',
    guidedPractice: '实现带鉴权路由、查询缓存、错误重试和详情页预取的小型应用，并记录缓存命中、失败恢复和一次版本回退。',
    independentPractice: '将一个 SSR 页面改为静态或客户端渲染，分别记录首屏、缓存、SEO 和运维差异。',
    commonErrors: ['把敏感逻辑放进客户端组件。', '忽略缓存失效导致页面显示旧权限数据。'],
    sourceRefs: [REACT_DOCS, NEXT_DOCS],
    steps: [
      [
        '先划分服务端与客户端能力',
        '服务端组件适合读取数据和访问秘密，客户端组件适合交互和浏览器 API。边界不清会把敏感数据或大依赖带入浏览器。',
        '能力边界决定组件边界',
        {
          title: 'Next.js：服务端读取秘密，客户端只接公开结果',
          language: 'TSX',
          code: `// app/orders/page.tsx
import { db } from '@/lib/db-server';

export default async function Page() {
  const orders = await db.order.findMany({
    select: { id: true, total: true, status: true }
  });
  return <OrderList rows={orders} />;
}

// app/orders/OrderList.tsx
'use client';
export function OrderList({ rows }: { rows: Array<{ id: string; total: number; status: string }> }) {
  return <ul>{rows.map((row) => <li key={row.id}>{row.id}:{row.status}</li>)}</ul>;
}`,
          output: `数据库客户端和查询配置留在服务端包；浏览器只收到 id/total/status 数组。

若在客户端组件导入 db-server，构建会失败或把服务端代码错误打入浏览器。`,
        },
      ],
      [
        '查询缓存有键和失效策略',
        '远程数据按查询键缓存，并在写操作后失效。缓存时间、重试和并发去重要明确，不能靠页面刷新碰运气。',
        '缓存必须有失效条件',
        {
          title: 'React Query：写操作后精确失效订单',
          language: 'TSX',
          code: `const orderQuery = {
  queryKey: ['order', orderId],
  queryFn: ({ signal }) => api.order(orderId, { signal }),
  staleTime: 15_000
};

const mutation = useMutation({
  mutationFn: () => api.pay(orderId),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  }
});`,
          output: `支付成功后详情 ['order', id] 与列表 ['orders'] 被标记失效并重新获取；其他订单详情保持缓存。

权限变化时应清空对应用户整个订单缓存，不能继续展示撤权前数据。`,
        },
      ],
      [
        '路由状态也是产品状态',
        '分页、筛选和详情 ID 应能通过 URL 恢复。返回按钮、深链接和多标签页都依赖地址而不是内存历史。',
        'URL 可恢复页面上下文',
        {
          title: 'Next.js：从 searchParams 恢复筛选',
          language: 'TSX',
          code: `export default async function OrdersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const query = (params.q ?? '').slice(0, 80);
  const rows = await api.orders({ query, page });
  return <OrderTable rows={rows} query={query} page={page} />;
}`,
          output: `访问 /orders?q=O-1&page=2 时，服务端用同一 query/page 取数并渲染。

刷新、分享和多标签页恢复同一上下文；客户端翻页应更新 URL，而不是只改组件 state。`,
        },
      ],
      [
        'Next 构建形态决定部署',
        '静态、服务端渲染和边缘运行在缓存、冷启动、日志与回滚上不同。部署前要明确产物形态和运行时要求。',
        '先选渲染模式，再选平台',
        {
          title: 'Next.js + PowerShell：构建并检查运行模式',
          language: 'PowerShell',
          code: `@'
export default {
  output: 'standalone',
  experimental: {
    // 根据框架版本启用实际需要的实验项
  }
};
'@ | Set-Content next.config.mjs
pnpm next build
node .next/standalone/server.js
curl.exe -I http://127.0.0.1:3000/orders`,
          output: `Route (app)                 Size     First Load JS
○ /orders                   1.2 kB   96 kB
λ /api/health               0 B      0 B

HTTP/1.1 200 OK
x-nextjs-cache: HIT

○ 表示静态，λ 表示服务端执行。部署平台必须支持产物实际使用的运行时与缓存能力。`,
        },
      ],
      [
        '线上错误要可归因',
        '捕获渲染错误、请求失败和 hydration 问题，记录版本、路由和 requestId。回滚要求静态资源与服务端版本兼容。',
        '发布版本必须可追踪',
        {
          title: 'Next.js：错误边界记录版本与路由',
          language: 'TSX',
          code: `'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError({
      message: error.message,
      digest: error.digest,
      route: location.pathname,
      release: process.env.NEXT_PUBLIC_RELEASE
    });
  }, [error]);

  return <button onClick={reset}>重新加载</button>;
}`,
          output: `错误日志包含 message、digest、route 与 release，服务端可再通过 digest 关联请求日志。

回滚时静态资源、Server Actions 和 API 契约必须兼容；不能只把浏览器包切回旧版本。`,
        },
      ],
    ],
  },
  {
    name: 'React 源码：Fiber、Hooks 与 Scheduler',
    track: 'P04 · React 企业前端',
    minutes: 58,
    prerequisite: '掌握 React Hooks、渲染过程和性能分析。',
    goal: '能固定 React 源码版本，沿 Fiber 工作循环、begin/complete work、Hooks 链表和 Scheduler 解释一次更新。',
    guidedPractice: '定位 react-reconciler 的 workLoop、beginWork 和 commit 阶段，用日志实验记录一次更新经过的路径。',
    independentPractice: '写一份源码追踪报告，说明优先级、可中断渲染和提交阶段为什么不能混在一起。',
    commonErrors: ['只看函数名，不建立调用链。', '把源码实现细节当成公开 API 承诺。'],
    sourceRefs: ['React source repository. https://github.com/facebook/react', REACT_DOCS],
    steps: [
      [
        '先固定版本和入口',
        '源码阅读必须记录仓库、tag、文件和符号。行号会漂移，应通过入口函数和调用关系定位，而不是只保存截图。',
        '版本和符号是源码卡的基础',
        {
          title: 'PowerShell + Git：固定 React 版本与源码入口',
          language: 'PowerShell',
          code: `git clone --depth 1 --branch v19.1.0 https://github.com/facebook/react.git react-src
Set-Location react-src
git rev-parse HEAD
rg -n "function updateContainer|scheduleUpdateOnFiber|createWorkInProgress" packages/react-reconciler/src
Get-Content package.json | Select-String '"version"'`,
          output: `完整提交 SHA 被记录，版本 19.1.0。

packages/react-reconciler/src/ReactFiberWorkLoop.js 中可定位 updateContainer、scheduleUpdateOnFiber 等入口；报告应保存 tag、commit、文件与符号，而不是只存行号。`,
        },
      ],
      [
        'Fiber 保存工作单元',
        'Fiber 节点表达组件、状态和更新关系。beginWork 向下构建，completeWork 向上完成，提交阶段再应用真实 DOM 变化。',
        '构建和提交是两个阶段',
        {
          title: 'PowerShell：沿 beginWork、completeWork 和 commit 建立调用链',
          language: 'PowerShell',
          code: `rg -n "function beginWork|function completeWork|function performUnitOfWork" packages/react-reconciler/src/ReactFiberWorkLoop.js
rg -n "commitMutationEffects|commitLayoutEffects" packages/react-reconciler/src
Get-Content packages/react-reconciler/src/ReactFiberWorkLoop.js |
  Select-String "performUnitOfWork" -Context 3,8`,
          output: `performUnitOfWork 调用 beginWork；完成子树后进入 completeWork。

提交阶段再调用 commitMutationEffects 与 commitLayoutEffects。构建阶段可以暂停，DOM 提交必须一次性保持一致。`,
        },
      ],
      [
        'Hooks 以链表关联调用顺序',
        '每个组件的 Hooks 记录按稳定顺序连接。条件调用会破坏顺序，这是 Hooks 规则背后的实现约束。',
        '调用顺序会变成运行时结构',
        {
          title: 'PowerShell：定位 Hook 链表字段',
          language: 'PowerShell',
          code: `rg -n "memoizedState|next:" packages/react-reconciler/src/ReactFiberHooks.js | Select-Object -First 20
rg -n "function mountWorkInProgressHook|function updateWorkInProgressHook" packages/react-reconciler/src/ReactFiberHooks.js
Get-Content packages/react-reconciler/src/ReactFiberHooks.js |
  Select-String "mountWorkInProgressHook" -Context 0,14`,
          output: `每个 Hook 节点保存 memoizedState 与 next 指针，组件 Fiber 的 memoizedState 指向链表头。

更新时 updateWorkInProgressHook 按顺序推进。少调用一个 Hook 会把后续状态读到错误节点，因此条件分支中调用不安全。`,
        },
      ],
      [
        'Scheduler 管理优先级与时间片',
        '更新按优先级调度，浏览器让出控制权后可以继续工作。并发渲染提升响应性，但副作用仍必须在安全阶段执行。',
        '可中断的是渲染，不是随意外部写操作',
        {
          title: 'PowerShell：定位 Scheduler 优先级和 shouldYield',
          language: 'PowerShell',
          code: `rg -n "unstable_scheduleCallback|shouldYield|frameInterval|workLoop" packages/scheduler/src
rg -n "ImmediatePriority|UserBlockingPriority|NormalPriority|LowPriority" packages/scheduler/src/SchedulerPriorities.js
rg -n "scheduleCallback|shouldYield" packages/react-reconciler/src/ReactFiberWorkLoop.js | Select-Object -First 20`,
          output: `Scheduler 按优先级维护任务并返回 continuation callback；workLoop 在时间片耗尽时让出主线程。

render 阶段可暂停并稍后继续，commit 与需要保持一致性的外部写操作不能随意中断。`,
        },
      ],
      [
        '源码结论必须回到实验',
        '通过版本、调用链和可复现行为形成结论。不能仅凭一个函数名推断线上性能或 API 语义。',
        '源码阅读要形成证据链',
        {
          title: 'React Profiler：把源码假设变成可复现实验',
          language: 'TSX',
          code: `import { Profiler } from 'react';

<Profiler id="orders" onRender={(id, phase, actualDuration) => {
  console.log(JSON.stringify({ id, phase, actualDuration }));
}}>
  <OrderList rows={rows} />
</Profiler>

// 操作：筛选 slow -> fast
// 对照记录：render 次数、commit 次数、最长 actualDuration`,
          output: `{"id":"orders","phase":"update","actualDuration":7.8}
{"id":"orders","phase":"update","actualDuration":5.1}

源码调用链解释为什么会重新 render 或跳过，Profiler 证明实际成本。两者结合后才形成可验证结论，不把内部实现当公开 API 承诺。`,
        },
      ],
    ],
  },
  {
    name: 'HTTP API、错误模型与幂等设计',
    track: 'P05 · 后端共同基础',
    minutes: 44,
    prerequisite: '理解 HTTP 请求和基础数据结构。',
    goal: '能设计资源边界、状态码、错误结构、分页和幂等键，并处理重试、超时和重复提交。',
    guidedPractice: '为一个订单创建接口设计请求、响应、错误和幂等方案，并模拟客户端重复重试。',
    independentPractice: '审查一个返回 200 表示所有结果的接口，改成可区分验证、权限、冲突和系统错误的契约。',
    commonErrors: ['所有错误都返回 200。', '重试写操作却没有幂等保证。'],
    sourceRefs: [MDN_HTTP, 'RFC 9110 HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110'],
    steps: [
      [
        '资源边界决定接口形状',
        'URL 应表达稳定资源或动作，请求方法表达语义。接口名称不能只按页面命名，否则前端改布局就会破坏契约。',
        '接口围绕领域资源设计',
        {
          title: 'OpenAPI：按订单资源定义接口',
          language: 'YAML',
          code: `paths:
  /orders:
    post:
      operationId: createOrder
      responses:
        '201': { description: Created }
        '400': { description: Invalid input }
        '409': { description: Duplicate idempotency key with different body }
  /orders/{orderId}:
    get:
      operationId: getOrder
      parameters:
        - name: orderId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Order }
        '404': { description: Not found }`,
          output: `页面 /checkout/success 不应变成 /api/checkout-success；订单资源仍由 POST /orders 与 GET /orders/{id} 表达。

前端改页面不会迫使所有消费者改接口，订单领域也能被 Web、App 和后台共同使用。`,
        },
      ],
      [
        '状态码表达协议层结果',
        '成功、验证失败、未认证、无权限、冲突、限流和系统错误要分开。错误正文提供稳定 code 和可行动消息，不泄露内部堆栈。',
        '状态码和错误码各有职责',
        {
          title: 'Node.js：返回一致错误结构',
          language: 'JavaScript',
          code: `function sendError(response, status, code, message, requestId) {
  response.writeHead(status, {
    'content-type': 'application/problem+json',
    'x-request-id': requestId
  });
  response.end(JSON.stringify({
    type: 'https://errors.example/' + code.toLowerCase(),
    title: message,
    code,
    requestId
  }));
}

sendError(response, 409, 'ORDER_ALREADY_PAID', '订单已支付', 'req-1001');`,
          output: `HTTP/1.1 409 Conflict
content-type: application/problem+json
x-request-id: req-1001

{"type":"https://errors.example/order_already_paid","title":"订单已支付","code":"ORDER_ALREADY_PAID","requestId":"req-1001"}

状态码让通用客户端和网关理解类别，code 让业务代码稳定分支。不要返回 200 再在正文写 success:false。`,
        },
      ],
      [
        '写操作必须考虑重复',
        '超时后客户端无法确定是否成功，重试可能重复创建。幂等键、唯一约束和状态机要共同保护副作用。',
        '网络未知结果按可能成功处理',
        {
          title: 'SQL + Node.js：用幂等键唯一约束保护创建订单',
          language: 'SQL + TypeScript',
          code: `CREATE TABLE idempotency_key (
  tenant_id text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

async function createOrder(tenantId: string, key: string, body: unknown) {
  const requestHash = sha256(JSON.stringify(body));
  return db.transaction(async (tx) => {
    const saved = await tx.tryInsertKey({ tenantId, key, requestHash });
    if (!saved) {
      const existing = await tx.getKey(tenantId, key);
      if (existing.requestHash !== requestHash) throw new ConflictError('IDEMPOTENCY_MISMATCH');
      return existing.responseBody;
    }
    const order = await tx.insertOrder(body);
    await tx.completeKey(tenantId, key, 201, order);
    return order;
  });
}`,
          output: `首次请求创建订单并保存响应；相同 Idempotency-Key 的重试返回第一次结果。

同一键但正文不同返回 409。数据库唯一约束负责并发竞争，应用层查询不能单独保证。`,
        },
      ],
      [
        '分页和筛选要稳定',
        '基于游标的分页比随意偏移更适合变化数据。排序字段、过滤条件和总数要有明确语义，避免页面跳跃。',
        '接口结果顺序必须可预测',
        {
          title: 'SQL：按 created_at 与 id 建立稳定游标',
          language: 'SQL',
          code: `SELECT id, created_at, total, status
FROM orders
WHERE tenant_id = $1
  AND status = $2
  AND (created_at, id) < ($3, $4)
ORDER BY created_at DESC, id DESC
LIMIT 21;

-- 多取 1 行用于判断 has_next
-- nextCursor = 第 20 行 base64(created_at|id)`,
          output: `返回最多 21 行；若得到 21 行，has_next=true，并返回第 20 行游标。

(created_at, id) 联合排序保证同一时间戳也有稳定次序。筛选变化时必须丢弃旧游标并从第一页开始。`,
        },
      ],
      [
        '契约需要自动验证',
        '请求和响应进入测试，错误场景也要覆盖。消费者和提供者通过契约样例检查，避免只测成功路径。',
        '错误路径也是接口契约',
        {
          title: 'Node.js test：验证 201、400、409 与 requestId',
          language: 'JavaScript',
          code: `import test from 'node:test';
import assert from 'node:assert/strict';

test('create order contract', async () => {
  const response = await request(app)
    .post('/orders')
    .set('Idempotency-Key', 'key-1')
    .send({ sku: 'A', quantity: 1 });

  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'pending');
  assert.match(response.headers['x-request-id'], /^req-/);
});

test('rejects invalid quantity', async () => {
  const response = await request(app)
    .post('/orders')
    .send({ sku: 'A', quantity: 0 });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_QUANTITY');
});`,
          output: `✔ create order contract
✔ rejects invalid quantity
ℹ pass 2

契约测试应同时运行在消费者样例和服务端实现中，并覆盖冲突、权限、限流与依赖故障。`,
        },
      ],
    ],
  },
  {
    name: 'SQL、事务、索引与数据库迁移',
    track: 'P05 · 后端共同基础',
    minutes: 50,
    prerequisite: '会写基本 SQL，理解表、行和主键。',
    goal: '能设计规范化的数据模型，解释事务隔离、索引执行计划和迁移顺序，并完成安全回滚。',
    guidedPractice: '用订单和明细表执行查询计划，比较有索引和无索引，再制造一次并发更新观察锁和隔离。',
    independentPractice: '为一张生产表设计在线迁移、回填、索引创建和回滚方案，说明每一步的锁与失败处理。',
    commonErrors: ['只看功能正确，不看查询计划。', '把大表结构修改和代码发布放在同一步。'],
    sourceRefs: [POSTGRES_DOCS, 'Use The Index, Luke. https://use-the-index-luke.com/'],
    steps: [
      [
        '数据模型先表达关系',
        '主键、外键、唯一约束和空值规则把业务不变量写进数据库。不要只依赖应用层检查，否则并发和多入口会绕过限制。',
        '能由数据库保护的规则不要只写在代码里',
        {
          title: 'PostgreSQL：用约束表达订单不变量',
          language: 'SQL',
          code: `CREATE TABLE customer (
  id text PRIMARY KEY,
  tenant_id text NOT NULL
);

CREATE TABLE orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL REFERENCES customer(id),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  paid_at timestamptz,
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);

CREATE UNIQUE INDEX orders_external_id_uq
  ON orders (tenant_id, id);`,
          output: `订单状态只能是三种值，金额不能为负，paid 状态必须有 paid_at，非 paid 状态不能有 paid_at。

并发写入和多服务入口都受这些约束保护；应用校验只负责更早给出友好提示。`,
        },
      ],
      [
        '事务保证一组操作原子完成',
        '理解提交、回滚、隔离级别和锁，才能解释并发读写。长事务会占用资源并增加冲突，不应把网络调用放进事务。',
        '事务越短越好',
        {
          title: 'PostgreSQL：两个并发事务与行锁',
          language: 'SQL',
          code: `-- 会话 A
BEGIN;
SELECT id, status FROM orders WHERE id = 'O-1' FOR UPDATE;
UPDATE orders SET status = 'paid' WHERE id = 'O-1';
-- 暂不提交

-- 会话 B
BEGIN;
SELECT id, status FROM orders WHERE id = 'O-1' FOR UPDATE;
-- 等待会话 A

-- 会话 A
COMMIT;`,
          output: `会话 B 的 SELECT FOR UPDATE 会等待 A 提交或回滚。

提交后 B 读取新状态。若两个事务锁多个资源顺序相反，可能形成死锁；事务内不要等待远程 HTTP，也不要无限重试。`,
        },
      ],
      [
        '索引服务查询而不是装饰表',
        '索引要匹配过滤、排序和连接模式。观察执行计划、选择性和回表成本，避免看到慢就盲目加索引。',
        '用计划验证索引价值',
        {
          title: 'PostgreSQL：对比 EXPLAIN 与联合索引',
          language: 'SQL',
          code: `EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, total
FROM orders
WHERE tenant_id = 't-1'
  AND status = 'pending'
ORDER BY created_at DESC
LIMIT 20;

CREATE INDEX orders_tenant_status_created_idx
  ON orders (tenant_id, status, created_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, total
FROM orders
WHERE tenant_id = 't-1'
  AND status = 'pending'
ORDER BY created_at DESC
LIMIT 20;`,
          output: `创建前可能显示 Seq Scan 与 Sort；创建后可能显示 Index Scan using orders_tenant_status_created_idx。

必须看实际行数、Buffers、执行时间和是否仍在排序。若查询选出的行占表大多数，索引可能反而更慢。`,
        },
      ],
      [
        '迁移必须可分阶段执行',
        '先增加兼容结构，再回填，再切读写，最后删除旧结构。每步都可单独重跑和回滚，避免发布时长时间锁表。',
        '数据迁移是发布流程的一部分',
        {
          title: 'SQL + 发布脚本：兼容扩容、分批回填、验证后收紧',
          language: 'SQL',
          code: `-- 1. 扩：增加可空列与新索引
ALTER TABLE orders ADD COLUMN currency text;
CREATE INDEX CONCURRENTLY orders_currency_pending_idx
  ON orders (currency) WHERE currency IS NULL;

-- 2. 回填：小批量、可重入
UPDATE orders
SET currency = 'CNY'
WHERE id IN (
  SELECT id FROM orders WHERE currency IS NULL ORDER BY id LIMIT 1000
);

-- 3. 验证
SELECT count(*) AS missing FROM orders WHERE currency IS NULL;

-- 4. 收紧：新版本全量双写后再加非空约束
ALTER TABLE orders ALTER COLUMN currency SET NOT NULL;`,
          output: `迁移分四次独立执行。回填重复运行只处理仍为 NULL 的行；CONCURRENTLY 避免阻塞普通写入。

验证查询必须为 0 后才能收紧。若索引创建失败会留下 invalid index，应先检查 pg_index 再重试。`,
        },
      ],
      [
        '备份只有恢复成功才算有效',
        '定期恢复演练并记录时间目标。备份文件、权限、加密和异地保留都要一起检查。',
        '恢复演练验证备份',
        {
          title: 'PowerShell + PostgreSQL：备份到隔离库并核对',
          language: 'PowerShell',
          code: `$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
pg_dump --format=custom --file="orders-$stamp.dump" $env:DATABASE_URL
createdb --maintenance-db=postgres orders_restore_test
pg_restore --dbname=orders_restore_test --clean --if-exists "orders-$stamp.dump"
psql orders_restore_test -c "SELECT count(*) AS orders FROM orders;"
psql orders_restore_test -c "SELECT max(created_at) AS latest FROM orders;"
dropdb orders_restore_test`,
          output: `orders
--------
128420

latest
2026-11-23 08:45:12+00

dump 能完整恢复到隔离库，才说明备份有效。演练还要记录耗时、权限错误、校验和与保留周期。`,
        },
      ],
    ],
  },
  {
    name: '认证、授权与后端安全边界',
    track: 'P05 · 后端共同基础',
    minutes: 46,
    prerequisite: '了解 HTTP、会话和数据库。',
    goal: '能区分认证、授权和审计，实现服务端资源权限，处理会话、密码、CSRF、注入和敏感日志。',
    guidedPractice: '为一个多租户资源实现登录、角色、对象级权限和审计日志，测试越权与过期会话。',
    independentPractice: '审查一个接口是否存在 IDOR、批量赋值、弱密码存储和日志泄密，并写回归测试。',
    commonErrors: ['只检查角色，不检查资源归属。', '把 token 写进日志或 URL。'],
    sourceRefs: [OWASP, 'OWASP Top 10. https://owasp.org/Top10/'],
    steps: [
      [
        '认证与授权回答不同问题',
        '认证确认是谁，授权判断能否执行动作，审计记录发生了什么。登录成功不代表能访问任意资源。',
        '身份、权限、审计三层分开',
        {
          title: 'Node.js：认证、授权与审计分开记录',
          language: 'TypeScript',
          code: `type Principal = { userId: string; tenantId: string; role: 'member' | 'admin' };

function authorizeOrder(principal: Principal, order: { tenantId: string; ownerId: string }) {
  if (principal.tenantId !== order.tenantId) throw new Error('TENANT_DENIED');
  if (principal.role !== 'admin' && order.ownerId !== principal.userId) {
    throw new Error('ORDER_DENIED');
  }
}

async function readOrder(principal: Principal, orderId: string) {
  const order = await orders.findById(orderId);
  authorizeOrder(principal, order);
  audit.write({
    action: 'order.read',
    actorId: principal.userId,
    tenantId: principal.tenantId,
    resourceId: orderId
  });
  return order;
}`,
          output: `认证提供 principal；授权比较 tenantId、ownerId 和角色；审计写入脱敏主体与资源标识。

登录本身不会自动获得订单访问权，审计也不能记录令牌、密码或完整订单正文。`,
        },
      ],
      [
        '授权在服务端执行',
        '前端隐藏按钮只是体验，不是安全边界。每次访问资源都要基于当前主体和数据归属重新判断。',
        '对象级权限必须在服务端',
        {
          title: 'SQL：把租户与所有者写进查询条件',
          language: 'SQL',
          code: `-- 错误：先按 id 取，再依赖调用方判断
SELECT * FROM orders WHERE id = $1;

-- 正确：数据库查询本身限制主体范围
SELECT id, owner_id, status, total_cents
FROM orders
WHERE id = $1
  AND tenant_id = $2
  AND (owner_id = $3 OR $4 = true);

-- 管理员能力也要显式传入并受租户限制`,
          output: `普通用户查询他人订单返回 0 行，接口映射为 404，避免泄露资源是否存在。

管理员标志必须来自服务端会话和授权判断，不能由客户端提交 isAdmin=true。`,
        },
      ],
      [
        '会话和秘密要最小暴露',
        '令牌、Cookie、密码和密钥有不同生命周期。使用安全 Cookie、短期令牌和密钥管理，禁止写入源码和日志。',
        '秘密不进入客户端可见区域',
        {
          title: 'Node.js：安全 Cookie 与密码哈希',
          language: 'TypeScript',
          code: `import { hash, verify } from '@node-rs/argon2';

const passwordHash = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});

response.cookie('session', sessionToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000
});

if (!(await verify(passwordHash, submittedPassword))) {
  throw new UnauthorizedError('INVALID_CREDENTIALS');
}`,
          output: `浏览器 JavaScript 无法读取 HttpOnly session；Secure 限制 HTTPS；SameSite=Lax 降低跨站请求风险。

数据库只保存 Argon2id 哈希。错误统一为 INVALID_CREDENTIALS，日志不得包含 submittedPassword 或 sessionToken。`,
        },
      ],
      [
        '输入与输出都要防御',
        '参数化查询防止注入，模板自动转义防止跨站脚本。错误信息不能泄露内部路径、SQL 或堆栈。',
        '不可信数据进入任何边界都要处理',
        {
          title: 'Node.js：参数化 SQL、输出转义与无堆栈响应',
          language: 'TypeScript',
          code: `const rows = await db.query(
  'SELECT id, name FROM customers WHERE tenant_id = $1 AND email = $2',
  [tenantId, email]
);

const safeName = escapeHtml(rows[0].name);

try {
  await service.run();
} catch (error) {
  log.error({ code: 'ORDER_FAILED', requestId }, error);
  response.status(500).json({
    code: 'ORDER_FAILED',
    message: '请稍后重试',
    requestId
  });
}`,
          output: `email 中的引号和 SQL 片段只作为参数值，不改变查询结构；HTML 输出被编码。

用户只收到稳定 code、message 与 requestId。完整堆栈只进入受控日志和追踪系统。`,
        },
      ],
      [
        '用攻击场景做回归',
        '为越权、过期会话、重复提交和恶意输入建立自动测试。安全能力需要持续验证，不是发布前的一次扫描。',
        '安全测试要进入 CI',
        {
          title: 'Node.js test：自动验证跨租户越权',
          language: 'JavaScript',
          code: `import test from 'node:test';
import assert from 'node:assert/strict';

test('cannot read another tenant order', async () => {
  const token = await login({ user: 'member-a', tenant: 'tenant-a' });
  const response = await request(app)
    .get('/orders/O-owned-by-b')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'NOT_FOUND');
  assert.equal(response.headers['x-request-id'].startsWith('req-'), true);
});

test('expired session is rejected', async () => {
  const token = await loginAndExpire();
  const response = await request(app).get('/orders').set('Authorization', 'Bearer ' + token);
  assert.equal(response.status, 401);
});`,
          output: `✔ cannot read another tenant order
✔ expired session is rejected

测试同时检查状态、错误码和 requestId。错误使用 404 可减少资源存在性泄露，完整授权仍以服务端判断为准。`,
        },
      ],
    ],
  },
  {
    name: '日志、指标、Trace 与 OpenTelemetry',
    track: 'P05 · 后端共同基础',
    minutes: 48,
    prerequisite: '能开发基本 HTTP 服务并读取应用日志。',
    goal: '能设计结构化日志、指标和请求追踪，使用 requestId 串联入口、服务和数据库，并构建有效告警。',
    guidedPractice: '给一个请求链路加入 OpenTelemetry Trace、结构化日志和错误指标，再制造数据库慢查询观察证据。',
    independentPractice: '为服务定义一个可用性指标和一个业务指标，写出告警阈值、误报处理和运行手册。',
    commonErrors: ['只输出自由文本日志。', '告警没有负责人和处置步骤。'],
    sourceRefs: [OTEL, 'Prometheus Documentation. https://prometheus.io/docs/'],
    steps: [
      [
        '三类信号回答不同问题',
        '日志描述离散事件，指标描述聚合趋势，Trace 描述一次请求的调用关系。三类信号通过关联 ID 和时间对齐。',
        '不要用日志承担所有观测',
        {
          title: 'Node.js：日志、指标与 Trace 关联同一个请求',
          language: 'TypeScript',
          code: `const requestId = request.headers['x-request-id'] ?? crypto.randomUUID();
const span = tracer.startSpan('orders.create', {
  attributes: { 'service.name': 'orders-api', 'request.id': requestId }
});
span.end();

log.info({
  event: 'order.created',
  requestId,
  traceId: span.spanContext().traceId,
  orderId: order.id,
  tenantHash: hashTenant(tenantId)
});

metrics.created.inc({ service: 'orders-api', tenant: 'hashed-bucket' });`,
          output: `日志可追查单个订单事件，指标聚合创建趋势，Trace 展示本次请求的数据库和下游调用。

三者共享 requestId 与 traceId，但指标标签不含 orderId、userId 等高基数值。`,
        },
      ],
      [
        '结构化日志可查询',
        '日志字段固定包含时间、级别、服务、requestId、用户或租户的脱敏标识和错误码，正文只补充必要上下文。',
        '字段优先于拼接文本',
        {
          title: 'Node.js：输出固定字段的 JSON 日志',
          language: 'JavaScript',
          code: `function logError(error, context) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'orders-api',
    event: 'request.failed',
    requestId: context.requestId,
    traceId: context.traceId,
    route: context.route,
    method: context.method,
    status: 500,
    code: context.code ?? 'INTERNAL_ERROR',
    actorHash: context.actorHash,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }));
}`,
          output: `{"timestamp":"2026-11-23T08:50:00.000Z","level":"error","service":"orders-api","event":"request.failed","requestId":"req-1","traceId":"...","route":"/orders","method":"POST","status":500,"code":"DB_TIMEOUT","actorHash":"a3f...","error":{"name":"TimeoutError","message":"db timeout","stack":"..."}}

字段值有稳定类型和命名，日志平台可按 requestId、code、route 查询。禁止写入 Authorization、Cookie、密码和完整请求体。`,
        },
      ],
      [
        '指标要有单位和基数控制',
        '计数器、仪表和直方图用途不同。标签不能包含用户 ID 等高基数信息，否则存储和查询会失控。',
        '指标标签必须稳定',
        {
          title: 'OpenTelemetry：请求计数与延迟直方图',
          language: 'JavaScript',
          code: `import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('orders-api');
const requests = meter.createCounter('http.server.requests', {
  description: 'Completed HTTP requests',
  unit: '{request}'
});
const duration = meter.createHistogram('http.server.duration', {
  description: 'HTTP request duration',
  unit: 'ms'
});

const attributes = {
  'http.request.method': method,
  'http.response.status_code': status,
  'http.route': routeTemplate
};
requests.add(1, attributes);
duration.record(elapsedMs, attributes);`,
          output: `指标标签只有方法、状态码与路由模板，例如 GET /orders/{orderId} 200，不会为每个订单生成时间序列。

计数器可求速率，直方图可估分位。仪表/Gauge 应只用于当前值，如连接数。`,
        },
      ],
      [
        'Trace 跟随跨服务边界',
        '上下文通过请求头传播，服务、数据库和消息消费者形成完整链路。采样策略要兼顾成本与故障调查。',
        '跨服务追踪依赖上下传播',
        {
          title: 'Node.js：透传 W3C traceparent',
          language: 'JavaScript',
          code: `async function callInventory(request, order) {
  const parent = request.headers.traceparent;
  const response = await fetch('http://inventory:3002/reserve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(parent ? { traceparent: parent } : {})
    },
    body: JSON.stringify({ sku: order.sku, quantity: order.quantity })
  });
  return response.json();
}`,
          output: `inventory 服务继续使用同一个 traceId，并创建自己的 child span。

若代理删除 traceparent 或消息生产者不携带上下文，链路会在边界断开。错误和慢请求可提高采样率，但不能只采样正常请求。`,
        },
      ],
      [
        '告警要对应用户影响',
        '告警基于症状、错误预算或关键业务指标，并附带负责人、阈值、运行手册和回滚入口。',
        '每个告警都要能行动',
        {
          title: 'Prometheus：下单失败率告警',
          language: 'YAML',
          code: `groups:
  - name: orders
    rules:
      - alert: OrderCreateFailuresHigh
        expr: |
          sum(rate(http_server_requests_total{route="/orders",status=~"5.."}[5m]))
          /
          sum(rate(http_server_requests_total{route="/orders"}[5m]))
          > 0.05
        for: 10m
        labels:
          severity: page
          owner: orders-oncall
        annotations:
          summary: 下单接口 5xx 超过 5%
          runbook_url: https://runbooks.example/orders-create-failures`,
          output: `连续 10 分钟下单 5xx 比例超过 5% 才触发，避免单次波动。

告警包含负责人和运行手册。值班应先检查发布、数据库与下游超时，再决定回滚或降级，而不是盲目扩容。`,
        },
      ],
    ],
  },
];

const CORE_STEP_DETAILS: Readonly<
  Partial<Record<string, readonly [string, string, string, string, string]>>
> = {
  'Vue 响应式原理与组合式状态': [
    'ref 通过 .value 建立读写入口，reactive 用 Proxy 跟踪对象属性；读取时 activeEffect 被记录为依赖，写入时相关 effect 进入调度队列，未读取的属性不会自动建立依赖。',
    'computed 根据依赖缓存结果，依赖未变时直接复用；在 computed 中发请求、写日志或修改其他响应式状态会制造隐藏副作用，应把这类行为移到 watch 或事件处理。',
    'watch 的 cleanup 回调用于取消请求、解绑监听或清除定时器，onScopeDispose 处理组合函数退出；异步返回后还要比较请求标识或 signal.aborted，避免旧结果覆盖新状态。',
    '组合函数应在每次调用时创建自己的 ref 与 effect scope；模块顶层直接创建共享 ref 会把用户、请求和服务器端渲染状态串到不同页面，必须通过工厂函数隔离。',
    '用 Vue DevTools 观察依赖触发和组件更新时间，再定位 runtime-core 的 scheduler；同一事件内多次修改 ref 通常合并到一次刷新，但异步边界后的写入会进入下一轮。',
  ],
  'Vue 组件、组合式 API 与工程边界': [
    'props 应表达稳定输入，emits 表达组件请求外部执行的动作，slots 表达可插入内容；子组件不应直接修改父对象，否则数据流方向和错误来源都会变得模糊。',
    '容器组件负责请求、路由和业务组合，展示组件负责渲染、状态样式和可访问性；拆分后用 props 与事件建立契约，展示组件可在不启动后端的情况下测试。',
    '组合函数在实例内部创建 ref、watch 和生命周期钩子，SSR 时每个请求都必须得到独立状态；把用户信息或请求结果放在模块单例中会让不同请求相互污染。',
    '表单需要区分初始值、当前值、字段错误、提交中、服务端错误和成功状态；提交按钮禁用、错误 focus 和 aria-live 提示都要由同一状态机驱动。',
    '组件测试从可见文本、键盘操作和 emit 结果断言，不依赖内部变量名；覆盖空、加载、错误、禁用和窄屏状态，组件边界调整时才不会悄悄改变用户行为。',
  ],
  'Vue Router、Pinia 与请求状态': [
    '路由守卫可跳转登录页或阻止无权限页面，但不能替代 API 授权；路径参数应先解析和校验，服务端仍要按当前用户检查资源归属。',
    'Pinia 适合保存当前用户、界面偏好和应用级状态，服务器列表应通过查询缓存管理过期与重试；把每条远程数据永久塞进 store 会留下大量无失效规则的副本。',
    '页面筛选快速变化时，用 AbortController 取消旧请求或在响应中带上请求序号；只有最新请求可以写入页面，旧请求晚到时应被明确丢弃。',
    '分页、搜索词、排序和详情 ID 应写入 query 或路径参数，刷新与分享后才能恢复同一页面；内存中的返回栈不能替代可复制的 URL 状态。',
    '401、403、404、网络离线和服务端错误需要不同恢复动作；提供重新登录、申请权限、返回列表或重试入口，并让错误界面保留用户已经填写的数据。',
  ],
  'Vue 源码与 Nuxt SSR 部署': [
    'Vue renderer 的 patch 会比较新旧虚拟节点，区分创建、更新和卸载；定位 runtime-core 的 processComponent、patchElement 与 unmount，能说明一次更新究竟触碰了哪些节点。',
    '响应式写入进入 scheduler 队列后按任务去重，组件更新不会在每次赋值时立即同步执行；nextTick 等待的正是当前刷新完成后的状态。',
    'SSR 在服务端生成 HTML 后，客户端必须用相同初始状态 hydration；window、document、随机数和当前时间若直接参与初始渲染，会造成结构不一致和重复请求。',
    'SSG 适合可预生成页面并可放 CDN，SSR 需要 Node 或边缘运行时处理每个请求；两者在缓存、日志、冷启动、健康检查和回滚方式上不同。',
    '发布记录应包含前端构建、SSR 运行时镜像、API 版本和配置版本；回滚时检查缓存键、服务端数据结构和静态资源哈希，避免只退前端导致 hydration 或接口不兼容。',
  ],
  'React 组件、状态与表单': [
    'React 渲染应只根据 props 和 state 计算结果，不能在渲染中发请求、写 localStorage 或修改外部数组；同一输入重复渲染必须得到同样的界面描述。',
    '可计算的值不要另存 state，例如总价由明细计算、错误由输入与规则派生；重复状态会让更新顺序变得复杂，并出现界面与业务数据不一致。',
    '用 { status: "idle" | "submitting" | "success" | "error", message } 之类的联合状态替代多个互斥布尔值；状态转换集中在事件处理或 reducer 中更容易测试。',
    '更新嵌套对象时复制从根到修改点的路径，并保持其他引用不变；使用 Immer 可以减少手写展开，但仍要明确哪些状态属于同一业务变更。',
    '字段错误应通过 aria-describedby 与控件关联，提交失败保留用户输入并聚焦错误摘要；提交中禁用重复动作，组件卸载或请求取消后不得继续更新状态。',
  ],
  'React Hooks、渲染与副作用边界': [
    'Hooks 在每次渲染时按固定顺序调用，React 依靠这个顺序关联 useState、useEffect 等内部槽位；条件分支中调用会改变顺序，因而必须放在组件和 Hook 顶层。',
    '事件回调和 Effect 会捕获创建它那次渲染的 props 与 state；需要最新值时可用函数式更新、ref 或重新建立 Effect，不能假设闭包变量会自动变成最新值。',
    'Effect 用于同步网络请求、订阅、定时器等外部系统，并返回清理函数解除它；按钮点击就能完成的逻辑放在事件处理，不需要额外经过 state 再触发 Effect。',
    '并发渲染允许 React 暂停、恢复或丢弃渲染工作，因此渲染阶段必须纯净；提交阶段完成 DOM 更新，Effect 再处理需要外部副作用的同步。',
    '测试应覆盖交互后的请求、取消、清理和错误界面，可用假时钟与假请求控制时序；直接断言 Hook 调用次数会把测试绑定到实现细节。',
  ],
  'React Router、数据缓存与 Next.js 部署': [
    '服务端组件可读取数据库、环境秘密和大型依赖，客户端组件负责事件与浏览器 API；把敏感查询或密钥导入客户端边界，会被打包到用户可下载代码中。',
    '查询缓存以查询键区分参数，写操作成功后精确失效相关键；缓存时间、后台刷新、并发去重和错误重试要明确，权限变化时必须清掉旧数据。',
    '分页、筛选、排序和详情 ID 应进入 URL，刷新与返回才能重建页面；路由 loader 或查询函数读取 URL 参数，避免组件挂载时再猜测上一页状态。',
    '静态、SSR、ISR 和客户端渲染在缓存与运维成本上不同；部署前确认页面是否依赖登录用户、实时数据、服务端秘密和稳定首屏，再选择运行形态。',
    '记录构建版本、路由、请求 ID 和 hydration 错误，区分服务端与浏览器堆栈；回滚要求静态资源、服务端函数和 API 契约保持兼容。',
  ],
  'React 源码：Fiber、Hooks 与 Scheduler': [
    '先固定 React tag、react-reconciler 包版本和入口符号，再记录调用方向；行号会随版本变化，源码报告应保存 commit、文件路径、函数名与实验环境。',
    'render 阶段通过 beginWork 构建或复用 Fiber，completeWork 收束子树，commit 阶段再按副作用修改 DOM；可中断发生在 render，DOM 提交必须保持一致。',
    '函数组件的 Hooks 以调用顺序串成内部链表，memoizedState 保存对应状态和依赖；理解链表可解释为什么循环或条件调用会读到错误的槽位。',
    'Scheduler 维护不同优先级的任务，并用时间片把长渲染切给浏览器处理输入；优先级改变会触发重新协调，但提交与布局效果仍要满足一致性。',
    '源码结论要配合日志、Profiler 和最小实验验证，例如记录 beginWork、completeWork、commit 的执行顺序；只凭函数命名推断 API 或性能承诺不可靠。',
  ],
  'HTTP API、错误模型与幂等设计': [
    '订单、用户、工单等领域资源应有稳定 URL 和方法语义，动作型接口只在无法自然表达资源操作时使用；页面改版不应迫使用户端同时重写全部接口。',
    '400 表示请求格式或字段问题，401 表示未认证，403 表示已认证但无权限，409 表示冲突，429 表示限流；错误正文提供稳定 code、可读 message 和可追踪 requestId。',
    '创建订单时客户端生成 Idempotency-Key，数据库建立唯一约束并保存处理结果；网络超时后重试同一键应返回第一次结果，而不是再扣库存或再创建支付单。',
    '游标分页要固定排序和游标含义，筛选条件变化时重新取第一页；总数、是否有下一页和排序字段需明确，不能依赖数据库默认顺序。',
    '契约测试同时覆盖成功、校验失败、越权、冲突、限流和依赖故障；消费者与提供者共享样例，避免只测字段齐全而遗漏错误语义。',
  ],
  'SQL、事务、索引与数据库迁移': [
    '主键保证行身份，唯一约束保证业务唯一性，外键维护引用关系，CHECK 或状态约束拒绝非法值；应用层校验提升体验，但数据库约束负责在并发入口下守住最后边界。',
    '事务隔离决定并发读写可见性，行锁、间隙锁和 MVCC 行为随数据库与隔离级别变化；事务内不要等待外部 HTTP，长事务会扩大锁持有和回滚成本。',
    '联合索引要匹配过滤与排序顺序，覆盖索引可减少回表；用 EXPLAIN 查看扫描行数、连接方式和排序代价，选择性低或频繁更新的列未必适合单独建索引。',
    '扩展迁移通常分增加兼容结构、双写或回填、切换读取、验证和删除旧结构几步；大表索引可评估并发创建，回填要分批、可暂停、可重试并监控锁等待。',
    '备份要验证恢复时间、数据一致性和权限；定期在隔离环境执行恢复演练，记录 RPO、RTO、失败原因和修复动作，文件存在不等于灾难时可恢复。',
  ],
  '认证、授权与后端安全边界': [
    '认证确认主体身份，授权判断主体能否对具体资源执行动作，审计记录谁在何时做了什么；登录成功只完成第一步，不能据此放行任意订单或租户数据。',
    '对象级授权要同时检查用户、租户、资源和动作，例如查询语句必须带 tenant_id 与 owner 条件；隐藏前端按钮、随机 ID 或不可猜测 URL 都不是授权机制。',
    '会话 Cookie 应设置 HttpOnly、Secure、SameSite，令牌应有短期有效期和撤销策略；密码使用 Argon2id、scrypt 或 bcrypt 等专用哈希，秘密进入密钥管理而不是日志。',
    'SQL 使用参数化查询，HTML 输出按上下文编码，文件上传校验类型、大小和存储位置；错误响应不返回 SQL、堆栈或内部路径，避免把实现细节交给攻击者。',
    '安全回归应覆盖 IDOR、越权租户、过期会话、重复提交、恶意输入和敏感日志；每次新增资源接口都补对象级权限测试，安全扫描只是补充而不是替代。',
  ],
  '日志、指标、Trace 与 OpenTelemetry': [
    '日志回答单个请求发生了什么，指标回答一段时间内的趋势，Trace 回答请求跨服务经过哪些节点；三者共享时间、requestId 和资源属性，才能互相跳转。',
    '日志使用固定字段和 JSON 输出，包含服务名、级别、时间、traceId、requestId、错误码和脱敏后的业务标识；不要把整个请求体、令牌或个人信息写进日志。',
    '计数器适合请求总量和错误数，直方图适合延迟分布，Gauge 适合当前连接数；标签值必须有限且稳定，用户 ID、订单 ID 等高基数字段应留在日志或 Trace。',
    'Trace 上下文通过 W3C traceparent 等请求头传播，数据库、消息生产者和消费者继续创建 span；采样要考虑错误、慢请求和关键业务，不能只随机丢弃故障证据。',
    '告警应绑定用户影响、负责人和运行手册，例如错误率持续超过预算或下单成功率下降；阈值要包含持续时间与最小流量，避免单次波动制造无效打扰。',
  ],
};

export const PROGRAMMING_CORE_COURSES: readonly ProgrammingCourseSeed[] =
  PROGRAMMING_CORE_COURSES_BASE.map((course) => {
    const details = CORE_STEP_DETAILS[course.name];
    if (details && details.length !== course.steps.length) {
      throw new Error(`P00-P05 手写步骤补充不完整：${course.name}`);
    }
    return {
      ...course,
      contentStatus: 'reviewed' as const,
      steps: course.steps.map((step, index) => {
        const body = details ? `${step[1]} ${details[index]}` : step[1];
        return step[3]
          ? [step[0], body, step[2], step[3]] as const
          : [step[0], body, step[2]] as const;
      }),
    };
  });
