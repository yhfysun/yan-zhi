/**
 * 安装包扫描单测（P1）。
 *
 * 覆盖不依赖真实 APK 的部分：DEX 字符串池解析、aapt2 xmltree 文本解析、
 * asar 格式拆包、以及「伪造 APK」上的端到端降级行为（没有清单解析也不能崩）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { readDexStrings } from '../src/plugins/sec-lab-tools/scan/package/dex';
import { parseXmlTree, analyzeApk } from '../src/plugins/sec-lab-tools/scan/package/apk';
import { scanAsar, readAsar } from '../src/plugins/sec-lab-tools/scan/package/asar';
import { createPackageScanner } from '../src/plugins/sec-lab-tools/scan/package/engine';
import { runScan } from '../src/plugins/sec-lab-tools/scan/orchestrator';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

async function tmpFile(name: string, data: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yz-pkg-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  await fs.writeFile(file, data);
  return file;
}

/** 造一个只含一条字符串的最小 DEX */
function syntheticDex(value: string): Buffer {
  const buf = Buffer.alloc(0x200);
  buf.write('dex\n035\0', 0, 'ascii');
  const stringIdOff = 0x70;
  const dataOff = 0x74;
  buf.writeUInt32LE(1, 0x38);       // string_ids_size
  buf.writeUInt32LE(stringIdOff, 0x3c); // string_ids_off
  buf.writeUInt32LE(dataOff, stringIdOff); // 唯一字符串的偏移
  const bytes = Buffer.from(value, 'utf8');
  buf[dataOff] = bytes.length;      // uleb128（<128 时单字节）
  bytes.copy(buf, dataOff + 1);
  buf[dataOff + 1 + bytes.length] = 0;
  return buf;
}

function syntheticAsar(files: Record<string, string>): Buffer {
  const list: Record<string, unknown> = {};
  let offset = 0;
  const blobs: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    const b = Buffer.from(text, 'utf8');
    list[name] = { size: b.length, offset };
    offset += b.length;
    blobs.push(b);
  }
  const json = Buffer.from(JSON.stringify({ files: list }), 'utf8');
  const headerSize = 4 + json.length;
  const head = Buffer.alloc(8);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(headerSize, 4);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  return Buffer.concat([head, len, json, ...blobs]);
}

describe('DEX 字符串池', () => {
  it('读出 string_ids 指向的字符串', () => {
    const { strings } = readDexStrings(syntheticDex('sk-abcdefghijklmnopqrstuvwxyz012345'));
    expect(strings).toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
  });

  it('非 DEX 数据返回空数组而不是抛错', () => {
    expect(readDexStrings(Buffer.from('not a dex at all')).strings).toEqual([]);
  });
});

describe('aapt2 xmltree 解析', () => {
  const sample = [
    'N: android=http://schemas.android.com/apk/res/android',
    '  E: manifest (line=2)',
    '    A: package="com.yanzhi.app" (Raw: "com.yanzhi.app")',
    '    E: application (line=6)',
    '      A: http://schemas.android.com/apk/res/android:debuggable(0x0101000f)=(type 0x12)0xffffffff',
    '      A: http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=(type 0x12)0xffffffff',
    '      A: http://schemas.android.com/apk/res/android:usesCleartextTraffic(0x010104ec)=(type 0x12)0xffffffff',
    '      E: activity (line=10)',
    '        A: http://schemas.android.com/apk/res/android:name(0x01010003)="com.yanzhi.app.Main" (Raw: "com.yanzhi.app.Main")',
    '        A: http://schemas.android.com/apk/res/android:exported(0x01010010)=(type 0x12)0xffffffff',
    '      E: uses-permission (line=12)',
    '        A: http://schemas.android.com/apk/res/android:name(0x01010003)="android.permission.CAMERA" (Raw: "android.permission.CAMERA")',
  ].join('\n');

  it('提取包名、调试/明文/备份标志、导出组件与权限', () => {
    const info = parseXmlTree(sample);
    expect(info.packageName).toBe('com.yanzhi.app');
    expect(info.debuggable).toBe(true);
    expect(info.allowBackup).toBe(true);
    expect(info.cleartext).toBe(true);
    expect(info.components).toEqual([
      { type: 'activity', name: 'com.yanzhi.app.Main', exported: true, permission: undefined },
    ]);
    expect(info.permissions).toEqual(['android.permission.CAMERA']);
  });

  it('未声明的属性保持未定义/默认值', () => {
    const info = parseXmlTree([
      '  E: manifest (line=1)',
      '    A: package="a.b" (Raw: "a.b")',
      '    E: application (line=2)',
    ].join('\n'));
    expect(info.debuggable).toBe(false);
    expect(info.cleartext).toBeUndefined();
  });
});

describe('asar 拆包', () => {
  it('读出文件表并扫描打包后的 JS', async () => {
    const buf = syntheticAsar({
      'index.js': 'new BrowserWindow({ webSecurity: false });',
      'readme.txt': 'hello',
    });
    const file = await tmpFile('app.asar', buf);
    const arc = await readAsar(file);
    expect(arc.entries.map((e) => e.name)).toContain('index.js');

    const r = await scanAsar(file);
    expect(r.findings.some((f) => f.ruleId === 'electron-web-security-off')).toBe(true);
  });

  it('非 asar 文件明确报错', async () => {
    const file = await tmpFile('bad.asar', Buffer.from('not an asar file'));
    await expect(readAsar(file)).rejects.toThrow(/asar/);
  });
});

describe('APK 端到端（伪造包）', () => {
  async function fakeApk(): Promise<string> {
    const zip = new AdmZip();
    zip.addFile('AndroidManifest.xml', Buffer.from('<manifest package="com.yanzhi.app"/>'));
    zip.addFile('classes.dex', syntheticDex('sk-abcdefghijklmnopqrstuvwxyz012345'));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yz-apk-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'app-release.apk');
    zip.writeZip(file);
    return file;
  }

  it('无 aapt2 也能跑：DEX 凭据被发现，作业成功', async () => {
    const file = await fakeApk();
    const r = await analyzeApk(file);
    expect(r.findings.some((f) => f.ruleId === 'apk-cloud-credential')).toBe(true);
    expect(r.meta.entries).toBe(2);

    const job = await runScan({
      kind: 'package', target: file, profile: 'quick',
      scanners: [createPackageScanner()],
    });
    expect(job.status).toBe('done');
    expect(job.findings.some((f) => f.ruleId === 'apk-cloud-credential')).toBe(true);
    expect(job.stages.every((s) => s.status === 'done')).toBe(true);
  });

  it('无法识别的文件类型给出明确错误', async () => {
    const file = await tmpFile('notes.txt', Buffer.from('plain text'));
    const job = await runScan({
      kind: 'package', target: file, scanners: [createPackageScanner()],
    });
    expect(job.status).toBe('failed');
    expect(job.error).toContain('无法识别');
  });
});
