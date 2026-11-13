import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LEARNING_EDGE_VOICE = 'en-US-JennyNeural';

/** 找随包 edge-tts CLI。打包版走 resources；dev 从 apps/server 向上找 desktop 资源。 */
export function resolveBundledEdgeTts(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  resourcesPath = String((process as unknown as { resourcesPath?: string }).resourcesPath || ''),
): string | null {
  const candidates = [
    env.YZ_BUNDLED_EDGE_TTS,
    resourcesPath ? path.join(resourcesPath, 'python', 'Scripts', 'edge-tts.exe') : '',
    path.resolve(cwd, '..', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe'),
    path.resolve(cwd, 'apps', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe'),
  ].filter((item): item is string => !!String(item || '').trim());
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

/**
 * 用随包 Python edge-tts 合成英文。
 * 这条路径专门解决“Windows 只装了中文系统音色”的机器，不依赖用户另下语音包。
 */
export async function synthesizeBundledEnglishEdge(input: {
  text: string;
  outFile: string;
  exePath?: string | null;
}): Promise<{ file: string; bytes: number; voice: string } | null> {
  const exe = input.exePath || resolveBundledEdgeTts();
  if (!exe) return null;
  try {
    await execFileAsync(exe, [
      '--voice', LEARNING_EDGE_VOICE,
      '--rate=-8%',
      '--text', input.text,
      '--write-media', input.outFile,
    ], {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    const info = await stat(input.outFile);
    if (!info.isFile() || info.size <= 0) return null;
    return { file: input.outFile, bytes: info.size, voice: LEARNING_EDGE_VOICE };
  } catch {
    return null;
  }
}
