// TTS 程序层 —— 系统语音引擎（Windows：WinRT OneCore + SAPI 兜底 / macOS say），零依赖离线可用。
//
// 为什么 win 上优先 WinRT 而非 SAPI：**两者看到的音色完全不同**。
// 经典 System.Speech（SAPI5）只认 HKLM\SOFTWARE\Microsoft\Speech\Voices，
// 而 Win10/11 的中文音色装在 HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices —— 分属不同 API。
// 实测本机：SAPI 只有 1 个中文音色（Huihui Desktop），OneCore 有 3 个（Huihui 女 / Yaoyao 女 / Kangkang 男），
// 且 SAPI 连 SelectVoice('Microsoft Kangkang') 都会直接抛「未安装匹配的语音」。
// → 枚举与合成都必须走 WinRT，SAPI 仅作 WinRT 不可用时的兜底。
//
// 编码陷阱（本机踩过两次）：PowerShell 脚本里混入非 ASCII（中文音色名）会因编码错乱炸掉；
// 另注意 PS 5.1 不能 await WinRT 异步，须用 AsTask 反射桥接。
// 因此：脚本本体强制 ASCII，中文经 UTF-8 文件传入，泛型标记 IAsyncOperation`1 用 [char]96 拼出（反引号在脚本里会被吃）。
import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** WinRT 合成脚本（Windows 10/11 现代语音，含 OneCore 多音色）。必须纯 ASCII。 */
export function buildWinRtScript(): string {
  return [
    'param([string]$Out, [string]$Wav, [string]$TextFile, [string]$Voice, [int]$Rate)',
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null',
    '[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime] | Out-Null',
    '[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null',
    // PS 5.1 不能直接 await IAsyncOperation：用 AsTask 泛型桥接。
    // 泛型名含反引号，在脚本里会被当转义符 → 用 [char]96 拼
    '$genName = "IAsyncOperation" + [char]96 + "1"',
    '$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq $genName })[0]',
    'function Await($op, $type) {',
    '  $m = $asTaskGeneric.MakeGenericMethod($type)',
    '  $task = $m.Invoke($null, @($op))',
    '  $task.Wait(-1) | Out-Null',
    '  $task.Result',
    '}',
    '$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices',
    '$lines = @()',
    'if ($Out -ne "") {',
    '  foreach ($v in $all) { $lines += ($v.Id + " || " + $v.DisplayName + " | " + $v.Language + " | " + $v.Gender) }',
    '  [System.IO.File]::WriteAllText($Out, ($lines -join [char]13 + [char]10), (New-Object System.Text.UTF8Encoding($false)))',
    '  return',
    '}',
    // 选音色：优先精确匹配 Id/DisplayName，其次语言前缀，最后默认
    '$picked = $null',
    'if ($Voice -ne "") {',
    '  $picked = $all | Where-Object { $_.Id -eq $Voice -or $_.DisplayName -eq $Voice } | Select-Object -First 1',
    '  if (-not $picked) { $picked = $all | Where-Object { $_.DisplayName -like ("*" + $Voice + "*") } | Select-Object -First 1 }',
    '}',
    'if (-not $picked) { $picked = $all | Where-Object { $_.Language -like "zh*" } | Select-Object -First 1 }',
    'if (-not $picked) { $picked = $all | Select-Object -First 1 }',
    'if (-not $picked) { throw "no voice available" }',
    '$syn = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer',
    '$syn.Voice = $picked',
    // 语速在 Options 子对象里（不是合成器直接属性，直接赋值会抛 PropertyAssignment）
    // 语速是附加项，设置失败不应让整次合成失败
    'try {',
    '  $rate = 1.0 + ($Rate / 10.0)',
    '  if ($rate -lt 0.5) { $rate = 0.5 }',
    '  if ($rate -gt 3.0) { $rate = 3.0 }',
    '  $syn.Options.SpeakingRate = $rate',
    '} catch { }',
    '$text = Get-Content -Raw -Encoding UTF8 $TextFile',
    '$stream = Await ($syn.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])',
    '$size = [uint32]$stream.Size',
    '$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))',
    'Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null',
    '$bytes = New-Object byte[] $size',
    '$reader.ReadBytes($bytes)',
    '[System.IO.File]::WriteAllBytes($Wav, $bytes)',
  ].join('\r\n');
}

/** 生成 SAPI 合成脚本（仅作 WinRT 不可用时的兜底）。必须保持纯 ASCII。 */
export function buildSapiScript(): string {
  return [
    'param(',
    '  [string]$Out,',
    '  [string]$Text,',
    '  [string]$Voice,',
    '  [int]$Rate',
    ')',
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Speech | Out-Null',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try {',
    '  if ($Voice -ne "") {',
    '    try { $s.SelectVoice($Voice) } catch { }',
    '  } else {',
    '    $zh = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture -like "zh*" } | Select-Object -First 1',
    '    if ($zh) { try { $s.SelectVoice($zh.VoiceInfo.Name) } catch { } }',
    '  }',
    '  $s.Rate = $Rate',
    '  $s.SetOutputToWaveFile($Out)',
    '  $t = Get-Content -Raw -Encoding UTF8 $Text',
    '  $s.Speak($t)',
    '} finally { $s.Dispose() }',
  ].join('\r\n');
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`${err.message}${stderr ? ` | ${String(stderr).slice(0, 200)}` : ''}`));
      else resolve();
    });
  });
}

/**
 * 从角色名推断期望性别 —— 纯函数。
 * 中文短剧的角色名通常自带性别线索，用关键词猜最省事：用户不必手写音色表就能拿到「男主男声、女主女声」。
 * 识别不出时返回 ''（交给轮转分配）。
 */
export function inferRoleGender(roleName: string): 'Male' | 'Female' | '' {
  const n = String(roleName || '');
  if (!n) return '';
  // 女性线索（先判女，避免「女王」「女侠」被后面的「王」「侠」等词干扰）
  if (/女|妈|母|姐|妹|婆|姨|婶|嫂|姑|妃|后|娘|娜|丽|婉|婷|妍|茜|瑶|涵|薇|蕾|琳|婴儿女/.test(n)) return 'Female';
  // 男性线索
  if (/男|爸|父|哥|弟|爷|叔|伯|舅|公|王|帝|侠|郎|军|司令|老板|战士|汉子|少年|青年/.test(n)) return 'Male';
  return '';
}

/**
 * 从音色列表里为角色挑合适音色 —— 纯函数，便于单测。
 *
 * 分配优先级：① 角色名能推断性别 → 从同性别音色池里挑（男女声区分的关键）
 *            ② 推断不出 → 从中文音色池轮转（保证不同角色尽量不同声）
 *            ③ 中文池为空 → 退到全部音色
 * 同一角色（同名）恒定返回同一音色（存在 assigned 里）。
 */
export function pickVoiceForRole(
  voices: Array<{ name: string; culture: string; gender?: string }>,
  roleName: string,
  assigned: Map<string, string>,
  preferCulture = 'zh',
): string | undefined {
  const existing = assigned.get(roleName);
  if (existing) return existing;
  if (!voices.length) return undefined;

  const preferPool = voices.filter((v) => String(v.culture || '').toLowerCase().startsWith(preferCulture));
  const basePool = preferPool.length ? preferPool : voices;

  // ① 按推断性别筛选（WinRT 音色自带 Gender，这是「男女老少」能区分开的前提）
  const wantGender = inferRoleGender(roleName);
  let pool = basePool;
  if (wantGender) {
    const byGender = basePool.filter((v) => String(v.gender || '').toLowerCase() === wantGender.toLowerCase());
    // 同性别音色已被占满时不再强求（否则多角色会全部撞到同一个）
    const free = byGender.filter((v) => ![...assigned.values()].includes(v.name));
    if (free.length) pool = free;
    else if (byGender.length) pool = byGender;
  }

  // ② 优先挑还没被占用的（音色够时保证每个角色声音不同）
  const unused = pool.filter((v) => ![...assigned.values()].includes(v.name));
  const finalPool = unused.length ? unused : pool;

  const chosen = finalPool[assigned.size % finalPool.length].name;
  assigned.set(roleName, chosen);
  return chosen;
}

/**
 * 描述本机音色容量 —— 纯函数。用于在「角色数 > 可用音色数」时给出明确提示，
 * 避免用户以为多角色已生效、实际所有角色同一个声音。
 */
export function describeVoiceCapacity(
  voices: Array<{ name: string; culture: string; gender?: string }>,
  roleCount: number,
  preferCulture = 'zh',
): { distinctVoices: number; adequate: boolean; note: string; maleVoices: number; femaleVoices: number } {
  const preferred = voices.filter((v) => String(v.culture || '').toLowerCase().startsWith(preferCulture));
  const pool = preferred.length ? preferred : voices;
  const distinct = pool.length;
  const male = pool.filter((v) => String(v.gender || '').toLowerCase() === 'male').length;
  const female = pool.filter((v) => String(v.gender || '').toLowerCase() === 'female').length;
  const genderNote = male && female ? `（含 ${male} 个男声、${female} 个女声）` : '';

  if (distinct === 0) {
    return { distinctVoices: 0, adequate: false, maleVoices: 0, femaleVoices: 0, note: '本机没有可用语音音色，配音将失败。' };
  }
  if (roleCount > distinct) {
    return {
      distinctVoices: distinct, adequate: false, maleVoices: male, femaleVoices: female,
      note: `本机有 ${distinct} 个${preferred.length ? '中文' : ''}音色${genderNote}，${roleCount} 个角色会有声音重复。` +
        '如需更丰富的声音：① 在系统「设置 → 时间和语言 → 语音」里添加更多语音包；② 配置支持 /v1/audio/speech 的模型层 TTS。',
    };
  }
  return {
    distinctVoices: distinct, adequate: true, maleVoices: male, femaleVoices: female,
    note: `本机可用 ${distinct} 个${preferred.length ? '中文' : ''}音色${genderNote}，可满足 ${roleCount} 个角色的区分需求。`,
  };
}

export interface SystemTtsResult {
  file: string;
  /** winrt = Windows OneCore（音色全，推荐）；sapi = 经典 SAPI（老系统兜底）；say = macOS */
  engine: 'winrt' | 'sapi' | 'say';
  bytes: number;
}

/**
 * 列出系统语音引擎已安装的音色。
 *
 * Windows：优先 WinRT（能拿到 OneCore 的完整中文音色集，含男女），
 * 失败或为空时回落 SAPI（老系统只有 SAPI）。**两者音色集不同，务必以 WinRT 为准**。
 * 返回 null = 当前平台无可用引擎（Linux）；空数组 = 引擎在但没装音色。
 * 音色名含中文 → 结果经 UTF-8 文件回传，脚本保持 ASCII。
 */
export async function listSystemVoices(): Promise<Array<{ name: string; culture: string; gender: string }> | null> {
  const platform = process.platform;
  if (platform === 'win32') {
    // 1) WinRT：本机实测能列出 3 个中文音色（SAPI 只有 1 个）
    try {
      const outFile = path.join(tmpdir(), `yz-voices-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
      const scriptFile = path.join(tmpdir(), 'yz-voices-winrt.ps1');
      await fsp.writeFile(scriptFile, buildWinRtScript(), 'ascii');
      try {
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', scriptFile, '-Out', outFile, '-Wav', '', '-TextFile', '', '-Voice', '', '-Rate', '0'], 60000);
        const raw = await fsp.readFile(outFile, 'utf8');
        const voices = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
          // 格式：<Id> || <DisplayName> | <Language> | <Gender>
          const [idPart, rest] = line.split('||').map((s) => s.trim());
          const parts = (rest || '').split('|').map((s) => s.trim());
          return { name: parts[0] || idPart, id: idPart, culture: parts[1] || '', gender: parts[2] || '' };
        }).filter((v) => v.name);
        if (voices.length) return voices;
      } finally {
        try { await fsp.unlink(outFile); } catch { /* 清理失败无碍 */ }
      }
    } catch (e) {
      console.warn('[tts] WinRT 枚举失败，回落 SAPI:', e instanceof Error ? e.message : String(e));
    }
    // 2) SAPI 兜底（老系统 / WinRT 不可用时）
    try {
      const outFile = path.join(tmpdir(), `yz-sapi-voices-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
      const scriptFile = path.join(tmpdir(), 'yz-voices-sapi.ps1');
      const script = [
        'param([string]$Out)',
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.Speech | Out-Null',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        'try {',
        '  $rows = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {',
        '    $i = $_.VoiceInfo',
        '    [pscustomobject]@{ name = $i.Name; culture = $i.Culture.Name; gender = $i.Gender.ToString() }',
        '  }',
        '  $json = ConvertTo-Json -InputObject @($rows) -Compress',
        '  [System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))',
        '} finally { $s.Dispose() }',
      ].join('\r\n');
      await fsp.writeFile(scriptFile, script, 'ascii');
      try {
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile, '-Out', outFile], 60000);
        const raw = await fsp.readFile(outFile, 'utf8');
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr
          .filter((v: any) => v && v.name)
          .map((v: any) => ({ name: String(v.name), culture: String(v.culture || ''), gender: String(v.gender || '') }));
      } finally {
        try { await fsp.unlink(outFile); } catch { /* 清理失败无碍 */ }
      }
    } catch (e) {
      throw new Error(`WinRT 与 SAPI 枚举均失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (platform === 'darwin') {
    // say -v '?' 输出形如：Ting-Ting            zh_CN    # 您好，我叫Ting-Ting
    const list = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/say', ['-v', '?'], { timeout: 30000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
    });
    return list
      .split('\n')
      .map((l) => /^(.+?)\s{2,}(\S+)\s*/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ name: m[1].trim(), culture: m[2], gender: '' }));
  }
  return null;
}

/**
 * 用系统语音引擎把文本合成 wav。
 * 返回 null = 当前系统没有可用引擎（Linux）；抛错 = 引擎存在但执行失败。
 */
export async function systemSpeak(
  text: string,
  opts: { voice?: string; rate?: number; outFile: string } ,
): Promise<SystemTtsResult | null> {
  const platform = process.platform;
  if (platform === 'win32') {
    // 文本经 UTF-8 临时文件传入，避开命令行编码；脚本固定 ASCII
    const textFile = path.join(tmpdir(), `yz-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    await fsp.writeFile(textFile, text, 'utf8');
    const rate = String(Math.max(-10, Math.min(10, Math.round(opts.rate ?? 0))));

    // 1) WinRT 优先：能用到 OneCore 的完整中文音色集（含男声 Kangkang），SAPI 看不到这些
    const winrtScript = path.join(tmpdir(), 'yz-tts-winrt.ps1');
    try {
      await fsp.writeFile(winrtScript, buildWinRtScript(), 'ascii');
      await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', winrtScript,
        '-Out', '', '-Wav', opts.outFile, '-TextFile', textFile,
        '-Voice', opts.voice || '', '-Rate', rate,
      ], 300000);
      const st = await fsp.stat(opts.outFile);
      if (st.size > 0) return { file: opts.outFile, engine: 'winrt', bytes: st.size };
      throw new Error('WinRT 产出为空');
    } catch (e) {
      // 不静默：带上原因再回落 SAPI（老系统/OneCore 缺失时就靠这条路）
      console.warn(`[tts] WinRT 合成失败，回落 SAPI：${e instanceof Error ? e.message : String(e)}`);
    }

    // 2) SAPI 兜底
    const sapiScript = path.join(tmpdir(), 'yz-tts.ps1');
    await fsp.writeFile(sapiScript, buildSapiScript(), 'ascii');
    try {
      await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', sapiScript,
        '-Out', opts.outFile,
        '-Text', textFile,
        '-Voice', opts.voice || '',
        '-Rate', rate,
      ], 300000);
    } finally {
      try { await fsp.unlink(textFile); } catch { /* 临时文件清理失败不影响结果 */ }
    }
    const st = await fsp.stat(opts.outFile);
    return { file: opts.outFile, engine: 'sapi', bytes: st.size };
  }
  if (platform === 'darwin') {
    const args = ['-o', opts.outFile, '--data-format=LEI16@22050'];
    if (opts.voice) args.push('-v', opts.voice);
    args.push(text);
    await run('/usr/bin/say', args, 300000);
    const st = await fsp.stat(opts.outFile);
    return { file: opts.outFile, engine: 'say', bytes: st.size };
  }
  return null;
}
