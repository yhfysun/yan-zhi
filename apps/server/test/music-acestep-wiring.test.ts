/**
 * ACE-Step 本地写歌接入回归测试（2026-10-22 第二段）。
 *
 * 为什么值得测（每条对应一次实测踩到的坑）：
 *   1) **测试用错参数名** —— `generate_music` 的真实参数是 `captions`（不是 `prompt`），
 *      而 initialize_service 没有 `dit_model/lm_model/init_llm`，模型靠 `config_path` 选。
 *      名字写错不报"参数错"，而是静默走默认值 → 生成结果与预期风格不符。
 *   2) **VAE 文件名** —— diffusers 找 `diffusion_pytorch_model.safetensors`，
 *      官方权重叫 `model.safetensors` → `Model not fully initialized`（模型"加载成功"但一生成就挂）。
 *   3) **torch 必须是 CUDA 版** —— `pip install torch` 默认给 CPU 版
 *      （实测 2.14.1+cpu，`cuda.is_available()==False`），权重全对但用不了显卡。
 *   4) **torchaudio 必须与 torch 同版本** —— 2.11.0 配 2.7.1 报 WinError 127。
 *   5) **服务端参数必须固化** —— 6GB 卡上 thinking/batch_size 没关会 OOM。
 *
 * 只做源码级 + 常量级断言，不启动 Python 进程（那要好几分钟且依赖 GPU）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TOOL_CATEGORY, RESOURCE_BYTES } from '@yan-zhi/shared';

// __dirname = apps/server/test → 上两级到仓库根
const ROOT = path.resolve(__dirname, '../../..');
const SERVER = path.join(ROOT, 'apps/server/src');
const BRIDGE = path.join(ROOT, 'apps/server/vendor/acestep-bridge/bridge.py');

const bridgeSrc = readFileSync(BRIDGE, 'utf-8');
const svcSrc = readFileSync(path.join(SERVER, 'services/music-acestep.ts'), 'utf-8');
const instSrc = readFileSync(path.join(SERVER, 'services/music-acestep-install.ts'), 'utf-8');
const regSrc = readFileSync(path.join(SERVER, 'services/installer-registry.ts'), 'utf-8');
const execSrc = readFileSync(path.join(SERVER, 'mcp/api-tool-executor.ts'), 'utf-8');

describe('ACE-Step · bridge 参数必须与上游一致', () => {
  it('用 captions 而不是 prompt（实测上游签名是 captions）', () => {
    expect(bridgeSrc).toContain('"captions": prompt');
    // 反向断言：params 字典里不能有 prompt 键（返回值里的 prompt 字段是给人看的，不算）
    const paramsBlock = bridgeSrc.slice(bridgeSrc.indexOf('params = {'), bridgeSrc.indexOf('result = self._service.generate_music'));
    expect(paramsBlock).not.toContain('"prompt"');
  });

  it('initialize_service 用 config_path 而非不存在的 dit_model 参数', () => {
    expect(bridgeSrc).toContain('config_path=self.dit_model');
    expect(bridgeSrc).not.toMatch(/initialize_service\([^)]*dit_model=/s);
  });

  it('6GB 卡必须关思考模式、batch=1', () => {
    expect(bridgeSrc).toContain('"batch_size": 1');
    // thinking 在上游已并入 LM 逻辑；确认没有显式开它
    expect(bridgeSrc).not.toContain('"thinking": True');
  });

  it('audios 元素按 dict{tensor,sample_rate} 解析（上游真实结构）', () => {
    expect(bridgeSrc).toContain('isinstance(first, dict)');
    expect(bridgeSrc).toContain('sample_rate');
  });
});

describe('ACE-Step · 两个必须固化的坑', () => {
  it('坑 1：强制 VAE 留 GPU + 分小块解码', () => {
    expect(bridgeSrc).toContain('YZ_FORCE_VAE_GPU');
    expect(bridgeSrc).toContain('ACESTEP_VAE_DECODE_CHUNK_SIZE');
    // Node 侧也要传（双保险：bridge 被别的方式启动时仍生效）
    expect(svcSrc).toContain("YZ_FORCE_VAE_GPU: '1'");
    expect(svcSrc).toContain("ACESTEP_VAE_DECODE_CHUNK_SIZE: '256'");
  });

  it('坑 2：VAE 兼容文件名（diffusion_pytorch_model.safetensors）', () => {
    expect(bridgeSrc).toContain('diffusion_pytorch_model.safetensors');
    expect(instSrc).toContain('diffusion_pytorch_model.safetensors');
  });

  it('坑 3：torch 必须 CUDA 版（不能只查文件存在）', () => {
    expect(instSrc).toContain('download.pytorch.org/whl/cu128');
    expect(instSrc).toContain('cuda.is_available()');
    // 状态探测要能识别 CPU 版 torch（否则会误判"已安装"）
    expect(svcSrc).toContain('CPU 版');
  });

  it('坑 4：torchaudio 与 torch 同版本', () => {
    expect(instSrc).toContain('torchaudio==2.7.1');
  });

  it('扁平目录映射成 checkpoints 规范名', () => {
    for (const canon of ['acestep-v15-turbo', 'acestep-5Hz-lm-1.7B', 'Qwen3-Embedding-0.6B']) {
      expect(bridgeSrc, `bridge 缺映射 ${canon}`).toContain(canon);
    }
  });
});

describe('ACE-Step · 常驻进程与生命周期', () => {
  it('常驻而非每次 spawn（模型加载 40s，冷启动不可接受）', () => {
    // 模块级 child 变量 + ensureChild 幂等复用 = 常驻
    expect(svcSrc).toContain('let child: ChildProcessWithoutNullStreams | null = null');
    expect(svcSrc).toContain('function ensureChild()');
    expect(svcSrc).toContain('if (child) return child');
  });

  it('闲置自动卸载（6GB 卡常驻 5.4GB 会挤别人）', () => {
    expect(svcSrc).toContain('IDLE_UNLOAD_MS');
    expect(svcSrc).toMatch(/unref/);
  });

  it('进程退出时在途请求立即失败（不让模型干等）', () => {
    expect(svcSrc).toContain("proc.on('exit'");
    expect(svcSrc).toContain('pending.clear()');
  });

  it('有生成超时兜底', () => {
    expect(svcSrc).toContain('GENERATE_TIMEOUT_MS');
  });

  it('离线运行：不让 HF 联网探测（模型已在盘上）', () => {
    expect(svcSrc).toContain('HF_HUB_OFFLINE');
    expect(svcSrc).toContain('TRANSFORMERS_OFFLINE');
  });
});

describe('ACE-Step · 工具与安装接线', () => {
  it('music_sing 已登记分类', () => {
    expect(TOOL_CATEGORY.music_sing).toBe('media-compose');
  });

  it('music_sing 在白名单（否则模型看不见）', () => {
    const m = execSrc.match(/SUPPORTED_API_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain("'music_sing'");
  });

  it('有 music_sing 的 execute case', () => {
    expect(execSrc).toContain("case 'music_sing':");
  });

  it('acestep 已注册进 installer-registry（双通道自动获得）', () => {
    expect(regSrc).toContain('acestep: acestepInstaller');
  });

  it('体积常量已定义（确认卡要展示 8.9GB）', () => {
    expect(RESOURCE_BYTES.acestep).toBeGreaterThan(8 * 1024 ** 3);
  });

  it('未安装时给出可执行指引（而不是干失败）', () => {
    expect(execSrc).toContain('install_resource({ resource: "acestep"');
  });

  it('产物落会话交付目录（文件管理面板可见）', () => {
    expect(execSrc).toContain('resolveArtifactDirFor');
  });
});

describe('ACE-Step · 安装器幂等与容错', () => {
  it('权重齐全时不重新下载（用户要求"复用"）', () => {
    expect(instSrc).toContain('missingDirs');
    expect(instSrc).toMatch(/missingDirs\.length/);
  });

  it('依赖安装多源回退（国内优先）', () => {
    expect(instSrc).toContain('cnFirst(PIP_SOURCES)');
  });

  it('源码克隆多源回退（gh-proxy → ghfast → github）', () => {
    expect(instSrc).toContain('gh-proxy.com');
    expect(instSrc).toContain('ghfast.top');
  });

  it('断点续传：服务器忽略 Range 时截断重下', () => {
    expect(instSrc).toContain('Range');
    expect(instSrc).toContain('206');
    // 关键：append 条件必须同时要求 206 且有旧文件
    expect(instSrc).toMatch(/append = res\.status === 206 && start > 0/);
  });

  it('pip 失败后仍用探测确认结果（杀软/沙箱中断卸载不代表失败）', () => {
    expect(instSrc).toContain('probeVenv');
    expect(instSrc).toMatch(/after\.cuda/);
  });
});
