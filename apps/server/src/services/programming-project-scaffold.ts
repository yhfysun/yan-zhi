import fs from 'node:fs';
import path from 'node:path';
import { PROGRAMMING_PROJECTS, type ProgrammingProject } from '@yan-zhi/shared';
import { dataDir } from '../db.js';

export type ProgrammingScaffoldResult = {
  projectId: string;
  path: string;
  created: boolean;
  files: string[];
  nextCommands: string[];
};

function mdList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function composeFor(project: ProgrammingProject): string {
  const services: string[] = [];
  if (project.stack.some((item) => /PostgreSQL|MySQL/i.test(item))) {
    services.push(`  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-learning}
      POSTGRES_USER: \${POSTGRES_USER:-learning}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-learning}"]
      interval: 5s
      timeout: 3s
      retries: 20`);
  }
  if (project.stack.includes('Redis')) {
    services.push(`  redis:
    image: redis:7-alpine
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20`);
  }
  if (!services.length) return 'services: {}\n';
  return `name: ${project.id}\n\nservices:\n${services.join('\n')}\n\nvolumes:\n  postgres-data:\n  redis-data:\n`;
}

function checkEnvScript(): string {
  return `import { spawnSync } from 'node:child_process';

const tools = [
  ['Java', 'java', ['-version']],
  ['Python', process.platform === 'win32' ? 'python' : 'python3', ['--version']],
  ['Node.js', 'node', ['--version']],
  ['C', 'gcc', ['--version']],
  ['C++', 'g++', ['--version']],
  ['CMake', 'cmake', ['--version']],
];

for (const [label, command, args] of tools) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const output = \`\${result.stdout || ''}\${result.stderr || ''}\`.trim().split(/\\r?\\n/)[0];
  console.log(\`\${label}: \${result.status === 0 ? output : 'not found'}\`);
}
`;
}

function buildFiles(project: ProgrammingProject): Record<string, string> {
  const phaseFiles = Object.fromEntries(project.phases.map((phase) => [
    `phases/${phase.id}-${phase.mode}.md`,
    `# ${phase.id} ${phase.title}

## 目标

${phase.goal}

## 动作

${mdList(phase.actions)}

## 产物

${mdList(phase.outputs)}

## 完成检查

${phase.checkpoint}

## 对应沉浸课

${phase.courseName}
`,
  ]));
  return {
    '.yz-learning-project.json': `${JSON.stringify({
      schema: 1,
      projectId: project.id,
      projectTitle: project.title,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'README.md': `# ${project.title}

## 项目目标

${project.summary}

## 技术栈

${mdList(project.stack)}

## 运行架构

${project.architecture}

## 毕业交付

${mdList(project.deliverables)}

## 验收指标

${mdList(project.metrics)}

## 零基础推进顺序

1. 阅读 \`docs/01-requirements.md\`，先确认用户、问题和非目标。
2. 完成 \`docs/02-api-contract.md\` 和 \`docs/03-data-model.md\`，不要直接写 CRUD。
3. 按 \`phases/\` 中的阶段逐步实现，每阶段保留测试和失败记录。
4. 数据依赖使用 \`compose.yaml\` 启动，真实秘密只放本机 \`.env\`。
5. 使用 \`docs/05-runbook.md\` 完成发布、观测和回滚演练。
`,
    '.gitignore': `.env
.env.local
node_modules/
dist/
build/
target/
__pycache__/
.venv/
*.log
*.pid
data/
`,
    '.env.example': `POSTGRES_DB=learning
POSTGRES_USER=learning
POSTGRES_PASSWORD=
POSTGRES_PORT=5432
REDIS_PORT=6379
`,
    'compose.yaml': composeFor(project),
    'scripts/check-env.mjs': checkEnvScript(),
    'docs/01-requirements.md': `# 需求与范围

## 项目问题

${project.whyNow}

## 毕业能力

${mdList(project.outcomes)}

## 当前技术栈

${mdList(project.stack)}

## 非目标

- 不从生成器直接复制一个无法解释的完整业务系统。
- 不把框架、数据库或云服务当成安全边界。
- 不在未授权目标和真实生产数据上做实验。
`,
    'docs/02-api-contract.md': `# API 契约

## 契约原则

- 输入输出必须定义 schema，外部数据在边界校验。
- 列表接口默认分页，错误统一包含 code、message 和可选 details。
- 写操作定义幂等策略，未知网络结果按“可能成功”处理。
- 授权同时检查主体、动作与资源归属。

## 本项目资源

根据项目目标和阶段 03 的动作，列出资源、方法、请求、响应、错误、权限和版本演进。
`,
    'docs/03-data-model.md': `# 数据模型

记录实体、主键、唯一约束、外键、空值、状态机、租户隔离、事务、索引、迁移和回滚。

数据依赖参考 \`compose.yaml\`；密码通过本机 \`.env\` 注入，不提交真实值。
`,
    'docs/04-acceptance.md': `# 验收记录

${mdList(project.metrics)}

每个指标记录：基线、测量命令、结果、边界和回归结论。
`,
    'docs/05-runbook.md': `# 运行手册

## 启动

1. 复制 \`.env.example\` 为 \`.env\` 并填写本机值。
2. 运行 \`docker compose up -d\` 启动项目声明的基础依赖。
3. 按项目技术栈安装依赖、执行迁移并启动服务。

## 发布前

- 测试、静态检查和安全扫描通过。
- 生成不可变制品并记录版本。
- 冒烟检查、日志、指标、Trace 和告警可用。

## 故障与回滚

记录停止条件、负责人、备份、回滚命令、数据迁移回滚和恢复验证。
`,
    'docs/toolchain.md': `# 工具链与官方渠道

- Java: https://adoptium.net/temurin/releases/
- Python: https://www.python.org/downloads/
- Node.js: https://nodejs.org/en/download
- MSYS2 / GCC: https://www.msys2.org/
- LLVM / Clang: https://llvm.org/
- CMake: https://cmake.org/download/
- Docker: https://docs.docker.com/get-docker/

在言智“编程 → 综合训练 → 本机环境”中先检测，再安装或配置路径。
`,
    ...phaseFiles,
  };
}

function safeWrite(root: string, relativePath: string, content: string): string {
  const target = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error(`Refusing path escape: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

export function scaffoldProgrammingProject(projectId: string): ProgrammingScaffoldResult {
  const project = PROGRAMMING_PROJECTS.find((item) => item.id === projectId);
  if (!project) throw new Error('未知项目 ID');

  const base = path.join(dataDir, 'learning-projects');
  const target = path.join(base, project.id);
  fs.mkdirSync(base, { recursive: true });

  const manifestPath = path.join(target, '.yz-learning-project.json');
  let created = false;
  if (fs.existsSync(target)) {
    if (!fs.existsSync(manifestPath)) throw new Error(`目录已存在但不是言智训练工程：${target}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { projectId?: string };
    if (manifest.projectId !== project.id) throw new Error(`目录属于其他项目：${target}`);
  } else {
    fs.mkdirSync(target, { recursive: true });
    created = true;
  }

  const files = buildFiles(project);
  const written = Object.entries(files).map(([relativePath, content]) =>
    safeWrite(target, relativePath, content));

  const nextCommands = ['node scripts/check-env.mjs'];
  if (project.stack.some((item) => /PostgreSQL|Redis/i.test(item))) {
    nextCommands.push('copy .env.example .env', 'docker compose up -d');
  }
  if (project.stack.some((item) => /Vue|React|Next\.js|TypeScript/i.test(item))) {
    nextCommands.push('pnpm install', 'pnpm dev');
  }
  if (project.stack.some((item) => /Spring|Java/i.test(item))) {
    nextCommands.push('java -version', './mvnw test');
  }
  if (project.stack.some((item) => /Python|FastAPI|Django/i.test(item))) {
    nextCommands.push('python -m venv .venv', 'python -m pytest');
  }
  if (project.stack.some((item) => /C\+\+|STL|Asio|CMake/i.test(item))) {
    nextCommands.push('cmake -S . -B build', 'cmake --build build');
  }

  return {
    projectId: project.id,
    path: target,
    created,
    files: written.map((file) => path.relative(target, file).replaceAll(path.sep, '/')),
    nextCommands: [...new Set(nextCommands)],
  };
}
