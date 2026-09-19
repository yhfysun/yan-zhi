/**
 * 打包脚本纯逻辑单测（build-all-editions.cjs / electron-build.cjs 的公共层）。
 *
 * 为什么值得测：这三件事出错代价最高，却都不容易在真机上构造验证 ——
 *   1) 产物后缀解析错 → 打出「文件名后缀与实际档位不一致」的包（后缀写 -lite、里面是 basic）；
 *   2) 旧产物目录清理失败未被识别 → electron-builder 报 ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
 *      （错误信息看不出是文件被占用），排查成本极高；
 *   3) 档位参数解析错 → 静默按兜底档出包。
 *
 * 全部用假 fs，可在裸 Node 下秒级运行，无需 Electron 运行时、不触碰真实磁盘。
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  ALL_EDITIONS,
  EDITION_CONFIG,
  SEPARATE_OUT,
  APP_OUT_DIRS,
  resolveArtifactSuffix,
  checkOutputDirReady,
  clearAppOutDirs,
  parseEditionsArgv,
  outDirForEdition,
} = require('../scripts/lib/pack-helpers.cjs');

/** 假 fs：可指定存在的路径集合，并让指定路径的 rmSync 抛错（模拟 EBUSY 被占用）。 */
function fakeFs({ existing = [], failOn = {} } = {}) {
  const have = new Set(existing);
  const removed = [];
  return {
    removed,
    existsSync: (p) => have.has(p),
    readFileSync: (p) => {
      if (!have.has(p)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return failOn.readContent !== undefined ? failOn.readContent : '{}';
    },
    rmSync: (p) => {
      if (failOn[p]) {
        const err = new Error('EBUSY: resource busy or locked');
        err.code = 'EBUSY';
        throw err;
      }
      removed.push(p);
      have.delete(p);
    },
  };
}

describe('档位配置表', () => {
  test('三档全集为 lite/basic/pro', () => {
    assert.deepStrictEqual(ALL_EDITIONS, ['lite', 'basic', 'pro']);
  });

  test('每档都能映射到一份 electron-builder 配置', () => {
    for (const e of ALL_EDITIONS) {
      assert.ok(EDITION_CONFIG[e], `${e} 缺少配置映射`);
      assert.match(EDITION_CONFIG[e], /^electron-builder\..*\.yml$/);
    }
  });

  test('★ full 与 basic 指向同一配置（历史命名差异，非笔误）', () => {
    assert.strictEqual(EDITION_CONFIG.basic, EDITION_CONFIG.pro);
  });

  test('separate 模式下每档输出目录互不相同', () => {
    const dirs = ALL_EDITIONS.map((e) => SEPARATE_OUT[e]);
    assert.strictEqual(new Set(dirs).size, dirs.length);
  });
});

describe('resolveArtifactSuffix - 产物后缀解析', () => {
  test('环境变量优先于 edition.json', () => {
    const got = resolveArtifactSuffix({
      fromEnv: '-pro',
      editionJsonPath: 'x',
      fs: fakeFs({ existing: ['x'], failOn: { readContent: '{"artifactSuffix":"-lite"}' } }),
    });
    assert.strictEqual(got, '-pro');
  });

  test('无环境变量时读 edition.json', () => {
    const got = resolveArtifactSuffix({
      editionJsonPath: 'x',
      fs: fakeFs({ existing: ['x'], failOn: { readContent: '{"artifactSuffix":"-lite"}' } }),
    });
    assert.strictEqual(got, '-lite');
  });

  test('★ edition.json 缺失时兜底 -basic（不能留空：留空会让 electron-builder 抛配置错）', () => {
    assert.strictEqual(resolveArtifactSuffix({ editionJsonPath: 'nope', fs: fakeFs() }), '-basic');
  });

  test('★ edition.json 内容损坏时兜底 -basic', () => {
    const got = resolveArtifactSuffix({
      editionJsonPath: 'x',
      fs: fakeFs({ existing: ['x'], failOn: { readContent: '{ 不是合法 json' } }),
    });
    assert.strictEqual(got, '-basic');
  });

  test('★ artifactSuffix 为空字符串时兜底 -basic（空后缀会打出无档位标识的包）', () => {
    const got = resolveArtifactSuffix({
      editionJsonPath: 'x',
      fs: fakeFs({ existing: ['x'], failOn: { readContent: '{"artifactSuffix":""}' } }),
    });
    assert.strictEqual(got, '-basic');
  });

  test('★ 兜底值不为空串（electron-builder 展开 ${env.X} 遇空/缺失会抛错）', () => {
    assert.notStrictEqual(resolveArtifactSuffix({ editionJsonPath: 'nope', fs: fakeFs() }), '');
  });
});

describe('clearAppOutDirs - 旧产物清理', () => {
  test('清掉所有存在的 appOutDir', () => {
    const existing = APP_OUT_DIRS.map((n) => path.join('/out', n));
    const fs = fakeFs({ existing });
    const r = clearAppOutDirs('/out', fs);
    assert.strictEqual(r.removed.length, APP_OUT_DIRS.length);
    assert.strictEqual(r.failed.length, 0);
  });

  test('不存在的目录不清理、也不报失败', () => {
    const r = clearAppOutDirs('/out', fakeFs());
    assert.strictEqual(r.removed.length, 0);
    assert.strictEqual(r.failed.length, 0);
  });

  test('★ 目录被占用（EBUSY）时记为失败而不是抛出（由脚本决定退出码与提示）', () => {
    const locked = path.join('/out', 'win-unpacked');
    const r = clearAppOutDirs('/out', fakeFs({ existing: [locked], failOn: { [locked]: true } }));
    assert.strictEqual(r.removed.length, 0);
    assert.strictEqual(r.failed.length, 1);
    assert.strictEqual(r.failed[0].code, 'EBUSY');
  });

  test('★ 确认覆盖 win-unpacked（同目录连续构建三档时会复用它）', () => {
    assert.ok(APP_OUT_DIRS.includes('win-unpacked'));
  });

  test('★ 确认覆盖 mac / mac-arm64（Mac 侧同样存在复用与占用问题）', () => {
    assert.ok(APP_OUT_DIRS.includes('mac'));
    assert.ok(APP_OUT_DIRS.includes('mac-arm64'));
  });

  test('清理顺序稳定：按 APP_OUT_DIRS 声明顺序', () => {
    const existing = APP_OUT_DIRS.map((n) => path.join('/out', n)).reverse();
    const fs = fakeFs({ existing });
    clearAppOutDirs('/out', fs);
    const names = fs.removed.map((p) => path.basename(p));
    assert.deepStrictEqual(names, APP_OUT_DIRS);
  });
});

describe('parseEditionsArgv - 命令行解析', () => {
  test('无参数 → 三档全出', () => {
    assert.deepStrictEqual(parseEditionsArgv([]).editions, ALL_EDITIONS);
  });

  test('指定档位 → 只出指定档', () => {
    assert.deepStrictEqual(parseEditionsArgv(['lite', 'pro']).editions, ['lite', 'pro']);
  });

  test('--separate 被识别且不当作档位名', () => {
    const r = parseEditionsArgv(['--separate']);
    assert.strictEqual(r.separate, true);
    assert.deepStrictEqual(r.editions, ALL_EDITIONS);
    assert.deepStrictEqual(r.invalid, []);
  });

  test('--separate 与档位混用', () => {
    const r = parseEditionsArgv(['lite', '--separate']);
    assert.strictEqual(r.separate, true);
    assert.deepStrictEqual(r.editions, ['lite']);
  });

  test('★ 未知档位被识别为 invalid（避免静默按兜底档出包）', () => {
    const r = parseEditionsArgv(['bogus']);
    assert.deepStrictEqual(r.invalid, ['bogus']);
  });

  test('★ 大小写敏感：LITE 不是合法档位', () => {
    assert.deepStrictEqual(parseEditionsArgv(['LITE']).invalid, ['LITE']);
  });
});

describe('outDirForEdition - 输出目录', () => {
  const repoRoot = path.resolve('/repo');

  test('★ 默认三档同目录（同目录优先：产物集中，便于交付）', () => {
    const dirs = ALL_EDITIONS.map((e) =>
      outDirForEdition(e, { separate: false, singleOut: 'dist-release', repoRoot }),
    );
    assert.strictEqual(new Set(dirs).size, 1, '三档应落在同一目录');
    assert.strictEqual(dirs[0], path.resolve(repoRoot, 'dist-release'));
  });

  test('separate 模式下三档各自独立目录', () => {
    const dirs = ALL_EDITIONS.map((e) =>
      outDirForEdition(e, { separate: true, singleOut: 'dist-release', repoRoot }),
    );
    assert.strictEqual(new Set(dirs).size, 3, 'separate 下三档应互不相同');
    for (const e of ALL_EDITIONS) {
      assert.ok(dirs.some((d) => d.endsWith(SEPARATE_OUT[e])));
    }
  });

  test('separate 模式忽略 singleOut（按档命名）', () => {
    const d = outDirForEdition('lite', { separate: true, singleOut: 'whatever', repoRoot });
    assert.ok(d.endsWith(SEPARATE_OUT.lite));
  });

  test('单档模式也不加档位后缀（安装包名已带后缀，目录无需重复）', () => {
    const d = outDirForEdition('lite', { separate: false, singleOut: 'dist-release', repoRoot });
    assert.strictEqual(path.basename(d), 'dist-release');
  });
});

describe('checkOutputDirReady - 开工前可写性探测', () => {
  test('目录不存在 → 视为就绪（首次构建）', () => {
    const r = checkOutputDirReady('/out', fakeFs());
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.blockers, []);
  });

  test('存在的旧产物可清理 → 就绪', () => {
    const existing = APP_OUT_DIRS.map((n) => path.join('/out', n));
    const r = checkOutputDirReady('/out', fakeFs({ existing }));
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.blockers, []);
  });

  test('★ 探测阶段即能识别被占用的 appOutDir（提前报错，不等到打包中途炸）', () => {
    const locked = path.join('/out', 'win-unpacked');
    const r = checkOutputDirReady('/out', fakeFs({ existing: [locked], failOn: { [locked]: true } }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blockers.length, 1);
    assert.strictEqual(r.blockers[0].code, 'EBUSY');
  });
});