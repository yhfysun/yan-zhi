const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  parseArgs,
  sanitizeName,
  resolvePackageIdentity,
  assertLinuxX64,
  renderStartScript,
  renderEnvExample,
  renderReadme,
} = require('../../../scripts/package-server-linux.cjs');

describe('Linux 纯后端发布包', () => {
  test('默认包含 Web 和 Node，并生成 tar.gz', () => {
    const opts = parseArgs([]);
    assert.strictEqual(opts.withWeb, true);
    assert.strictEqual(opts.withNode, true);
    assert.strictEqual(opts.withPython, true);
    assert.strictEqual(opts.archive, true);
    assert.match(path.basename(opts.outRoot), /linux-x64/);
  });

  test('支持关闭 Web/Node、复用构建和自定义输出目录', () => {
    const opts = parseArgs([
      '--no-web',
      '--no-node',
      '--no-python',
      '--skip-build',
      '--no-archive',
      '--out=/tmp/out',
      '--stage-dir=/tmp/stage',
      '--name=test-server',
    ]);
    assert.strictEqual(opts.withWeb, false);
    assert.strictEqual(opts.withNode, false);
    assert.strictEqual(opts.withPython, false);
    assert.strictEqual(opts.skipBuild, true);
    assert.strictEqual(opts.archive, false);
    assert.strictEqual(opts.outRoot, path.resolve('/tmp/out'));
    assert.strictEqual(opts.stageDir, path.resolve('/tmp/stage'));
    assert.strictEqual(opts.name, 'test-server');
  });

  test('包名过滤路径与 shell 特殊字符', () => {
    assert.strictEqual(sanitizeName('  yan zhi/../x  '), 'yan-zhi-..-x');
    const id = resolvePackageIdentity({ name: '', version: '1.2.3', platform: 'linux', arch: 'x64' });
    assert.strictEqual(id.base, 'yan-zhi-server-linux-x64');
    assert.strictEqual(id.archiveName, 'yan-zhi-server-linux-x64.tar.gz');
  });

  test('非 Linux x64 直接拒绝，避免产出不可运行的包', () => {
    assert.throws(() => assertLinuxX64('win32', 'x64'), /必须在 Linux x64/);
    assert.doesNotThrow(() => assertLinuxX64('linux', 'x64'));
  });

  test('start.sh 自带 Node、托管 Web、自动生成 JWT', () => {
    const text = renderStartScript();
    assert.match(text, /runtime\/node\/bin\/node/);
    assert.match(text, /WEB_DIST=.*ROOT.*web/);
    assert.match(text, /DATA_DIR\/\.jwt-secret/);
    assert.match(text, /exec "\$NODE_BIN" dist\/apps\/server\/src\/index\.js/);
  });

  test('配置模板和 README 包含可执行步骤', () => {
    assert.match(renderEnvExample(), /YZ_AUTH_MODE=multi/);
    const readme = renderReadme({
      base: 'yan-zhi-server-linux-x64-1.2.3',
      version: '1.2.3',
      withPython: true,
    });
    assert.match(readme, /tar -xzf yan-zhi-server-linux-x64-1\.2\.3\.tar\.gz/);
    assert.match(readme, /\.\/start\.sh/);
    assert.match(readme, /http:\/\/服务器IP:3001/);
    assert.match(readme, /内置 Linux Python/);
  });
});
