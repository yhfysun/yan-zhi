import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('Android 内置 TTS · 失败兜底与资源守卫', () => {
  it('系统引擎报错、无回调或初始化异常时必须转入内置引擎', () => {
    const java = read('native/android-tts/TtsPlugin.java');
    expect(java).toContain('SPEAK_TIMEOUT_BASE_MS');
    expect(java).toContain('activeTimeouts');
    expect(java).toContain('failSystemSpeak');
    expect(java).toMatch(/private void finish\([\s\S]{0,500}failSystemSpeak/);
    expect(java).toMatch(/catch \(Throwable e\)[\s\S]{0,400}fallbackToBundled/);
  });

  it('Sherpa 初始化与播放必须校验模型、采样率和 AudioTrack 状态', () => {
    const java = read('native/android-tts/SherpaTts.java');
    expect(java).toContain('model.length()');
    expect(java).toMatch(/tts\.sampleRate\(\)/);
    expect(java).toContain('sampleRate <= 0');
    expect(java).toContain('AudioTrack.STATE_INITIALIZED');
    expect(java).toContain('track.play()');
  });

  it('模型下载支持可达镜像、复用缓存，并在解压前创建目标目录', () => {
    const script = read('scripts/fetch-sherpa.cjs');
    expect(script).toContain('gh-proxy.com');
    expect(script).toContain('fs.mkdirSync(exDir');
    expect(script).toContain('fs.statSync(tb).size');
  });

  it('Sherpa 真相源缺失时构建必须提前失败，不能静默打出无声 APK', () => {
    const script = read('scripts/apply-native-sherpa.cjs');
    expect(script).toContain('process.exitCode = 1');
    expect(script).toMatch(/DEST_ASSETS[\s\S]{0,300}phontab/);
  });

  it('本地插件注册必须隔离异常并落盘崩溃日志，不能把 App 启动带崩', () => {
    const script = read('scripts/apply-native-tts.cjs');
    const logger = read('native/android-tts/CrashLogger.java');
    expect(script).toContain('CrashLogger.install(this)');
    expect(script).toContain('safeRegisterPlugin');
    expect(script).toContain('CrashLogger.record');
    expect(logger).toContain('setDefaultUncaughtExceptionHandler');
    expect(logger).toContain('crash.log');
  });
});
