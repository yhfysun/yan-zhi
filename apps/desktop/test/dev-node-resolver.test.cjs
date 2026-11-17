const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

test('Node 解析器在 PATH 缺失时选择已安装的最新可用版本', { skip: process.platform !== 'win32' }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yan-zhi-node-resolver-'));
  const toolHome = path.join(temp, 'fnm');
  const binDir = path.join(temp, 'bin');
  const versions = path.join(toolHome, 'node-versions');
  const fakeNode22 = path.join(versions, 'v22.1.0', 'installation');
  const fakeNode24 = path.join(versions, 'v24.2.0', 'installation');
  const expected = path.join(fakeNode24, 'node.exe');

  try {
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(toolHome, { recursive: true });
    fs.mkdirSync(fakeNode22, { recursive: true });
    fs.mkdirSync(fakeNode24, { recursive: true });
    fs.writeFileSync(path.join(toolHome, 'fnm.exe'), '');
    fs.linkSync(process.execPath, path.join(fakeNode22, 'node.exe'));
    fs.linkSync(process.execPath, expected);

    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const env = {
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      ComSpec: process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe'),
      PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
      PATH: [
        toolHome,
        binDir,
        path.join(systemRoot, 'System32'),
        path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
      ].join(';'),
      USERPROFILE: temp,
      LOCALAPPDATA: path.join(temp, 'local'),
      APPDATA: path.join(temp, 'roaming'),
      ProgramFiles: path.join(temp, 'program-files'),
      'ProgramFiles(x86)': path.join(temp, 'program-files-x86'),
      ProgramW6432: path.join(temp, 'program-files'),
      RESOLVE_NODE_DEBUG: '1',
    };

    const resolver = path.join(ROOT, 'bin', 'resolve-node.ps1').replace(/'/g, "''");
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `& '${resolver}'`],
      { env, encoding: 'utf8', windowsHide: true },
    );

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), expected);

    const probe = path.join(temp, 'probe.cmd');
    fs.writeFileSync(
      probe,
      [
        '@echo off',
        `call "${path.join(ROOT, 'bin', 'resolve-node.bat')}"`,
        'if errorlevel 1 exit /b 1',
        'echo NODE_BIN=%NODE_BIN%',
      ].join('\r\n'),
    );
    const batch = spawnSync(env.ComSpec, ['/d', '/c', probe], {
      env,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.strictEqual(batch.status, 0, batch.stderr);
    assert.match(batch.stdout, new RegExp(`NODE_BIN=${expected.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
