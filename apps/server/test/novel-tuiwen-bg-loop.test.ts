import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 小说推文成片「背景视频循环铺满」防回归测试。
 *
 * 背景（2026-10-09 实报 + 复现实证）：第1/2章成片都恰好 **108.203s**，
 * 而口播配音合计 400+s —— 视频早早结束、台词只念了 1/4，且**不报任何错**。
 *
 * 根因：compose_video.py 原用「多输入 `-stream_loop -1` + concat 滤镜」。
 *   项目自带 ffmpeg 是 **2019 版**（git-2019-10-22），该组合下 `-stream_loop`
 *   对多输入**静默失效**，输出被**最短的一条输入轨**截断。
 *   108.203s ≈ 前两段背景之和 29.429 + 78.671 = 108.100（决定性证据）。
 *
 * 附带第二个坑：`bg-ocean-evening.webm` 是**坏素材**——元数据报 14.585s/30fps，
 *   实际只解出 47 帧 = 1.6s（`File ended prematurely`）。混进列表会把背景拼短。
 *
 * 修法（本测试钉住的不变量）：
 *   ① 每段背景先归一化（scale/crop/fps/setsar + -an）成独立 clip；
 *   ② 探测每段「实际可解码时长」（-count_frames），坏素材跳过 + 告警；
 *   ③ 循环重复片段列表拼到累计 ≥ total；
 *   ④ concat demuxer（-c copy，cwd=tmp + 纯文件名）生成 bg_full.mp4；
 *   ⑤ 主命令改为**单输入** bg_full + trim=total（不再多输入 -stream_loop）。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC_PATH = path.join(
  REPO_ROOT,
  'packages/core/src/tool/builtin/python-scripts/novel_tuiwen/compose_video.py',
);
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const RUNPY = fs.readFileSync(
  path.join(REPO_ROOT, 'packages/core/src/tool/builtin/python-scripts/novel_tuiwen/run_pipeline.py'),
  'utf8',
);

/** 只取代码行（剔除注释），避免注释里提到旧写法时误判 */
const codeOnly = SRC.split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');

/** 抠出 bg_clips 分支的代码块 */
const bgBranch = SRC.match(/if bg_clips:[\s\S]*?\n    else:/)?.[0] || '';

describe('compose_video.py 背景循环实现不变量', () => {
  it('★ 背景分支不得再用「多输入 -stream_loop + concat 滤镜」（2019 版 ffmpeg 静默失效）', () => {
    // 旧写法：for p in bg_clips: cmd += ["-stream_loop","-1","-i",p]
    expect(codeOnly).not.toMatch(/for p in bg_clips:\s*\n\s*cmd \+= \["-stream_loop"/);
    // 且 bg 分支里不应再出现 concat=n= 的视频滤镜
    expect(bgBranch).not.toMatch(/concat=n=\{[^}]*\}:v=1:a=0/);
    expect(bgBranch).not.toMatch(/\[v\{i\}\]/);
  });

  it('每段背景先归一化为独立 clip（scale/crop/fps/setsar + -an 去音轨）', () => {
    expect(bgBranch).toMatch(/bgclip_\{i:02d\}\.mp4/);
    expect(bgBranch).toMatch(/force_original_aspect_ratio=increase/);
    expect(bgBranch).toMatch(/crop=\{W\}:\{H\},fps=\{FPS\},setsar=1/);
  });

  it('★ 探测每段真实可解码时长（-count_frames），坏素材告警并跳过', () => {
    expect(bgBranch).toMatch(/-count_frames/);
    expect(bgBranch).toMatch(/nb_read_frames/);
    // 有「真实时长 < 元数据时长」的坏素材判定
    expect(bgBranch).toMatch(/real < dur - 1\.0/);
    // 过短素材直接跳过
    expect(bgBranch).toMatch(/if dur < 1\.0:/);
    expect(bgBranch).toMatch(/疑似素材损坏\/截断|有效时长.*过短/);
  });

  it('循环重复片段列表拼到累计 >= 总时长 + 余量', () => {
    expect(bgBranch).toMatch(/want = total \+ 1\.0/);
    expect(bgBranch).toMatch(/while acc < want:/);
  });

  it('用 concat demuxer（-c copy，cwd=tmp + 纯文件名）生成 bg_full.mp4', () => {
    expect(bgBranch).toMatch(/"-f", "concat", "-safe", "0"/);
    expect(bgBranch).toMatch(/bglist\.txt/);
    expect(bgBranch).toMatch(/cwd=tmp/);
    // 列表内写纯文件名（不用绝对路径，老版 ffmpeg 会拼坏）
    expect(bgBranch).toMatch(/f\.write\(f"file '\{name\}'/);
  });

  it('★ 主命令改为单输入 bg_full + trim（不再多输入 -stream_loop）', () => {
    // 主命令输入顺序：-i bg_full -i audio_out
    expect(bgBranch).toMatch(/"-i", bg_full, "-i", audio_out/);
    expect(bgBranch).toMatch(/trim=duration=\{total:\.2f\},setpts=PTS-STARTPTS\[vv\]/);
    // 音频映射改为固定 1:a（单背景输入后音频是第 2 个输入）
    expect(bgBranch).toMatch(/"-map", "1:a"/);
    // 不允许再按背景段数动态索引音频
    expect(bgBranch).not.toMatch(/f"\{len\(bg_clips\)\}:a"/);
  });

  it('全部背景都不可用时显式报错（而不是静默出短片）', () => {
    expect(bgBranch).toMatch(/所有背景素材均不可用/);
  });
});

describe('ffmpeg 路径探测不变量', () => {
  it('★ find_ffmpeg 覆盖 `C:\\Program Files\\EVCapture`（本机真实路径）', () => {
    const fn = SRC.match(/def find_ffmpeg[\s\S]*?(?=\ndef )/)?.[0] || '';
    expect(fn).toContain('Program Files');
    expect(fn).toContain('EVCapture');
    // 仍保留 env 覆盖 + PATH 兜底
    expect(fn).toMatch(/os\.environ\.get\("FFMPEG"\)/);
    expect(fn).toMatch(/shutil\.which\("ffmpeg"\)/);
  });

  it('★ run_pipeline.py 同样补了 Program Files 候选 + PATH 兜底', () => {
    expect(RUNPY).toContain('Program Files');
    expect(RUNPY).toMatch(/shutil.*which\("ffmpeg"\)|which\("ffmpeg"\)/);
    expect(RUNPY).toMatch(/shutil.*which\("ffprobe"\)|which\("ffprobe"\)/);
  });

  it('probe_duration 在 ffmpeg 同目录无 ffprobe 时回退 PATH', () => {
    const fn = SRC.match(/def probe_duration[\s\S]*?(?=\ndef )/)?.[0] || '';
    expect(fn).toMatch(/shutil\.which\("ffprobe"\)/);
  });
});

describe('脚本可编译性（源码形态）', () => {
  it('compose_video.py 含合法 main 入口与 argparse', () => {
    expect(SRC).toMatch(/if __name__ == "__main__":\s*\n\s*main\(\)/);
    expect(SRC).toMatch(/ap\.add_argument\("--bg-video"/);
  });

  it('bg 分支与 else（分镜图兜底）分支并存', () => {
    expect(SRC).toMatch(/if bg_clips:/);
    expect(SRC).toMatch(/\n    else:\n/);
  });
});
