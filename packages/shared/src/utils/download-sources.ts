// 下载源单一真相源（2026-10-22）
//
// ★★★ 为什么集中到一处：
//   在此之前每个安装器各写一套源列表：`music-sing-install.ts` 的 MODEL_MIRRORS /
//   PIP_MIRRORS、`ffmpeg-runtime.ts` 的 buildDownloadUrl、`whisper-runtime.ts` 的
//   buildModelUrls、`ytdlp-runtime.ts` 的 buildDownloadUrl —— 五处各写各的。
//   后果：① 新增一个源要改五个文件，必然漏；② 排序策略不一致（有的直连优先，
//   有的镜像优先），国内用户体验取决于运气；③ 确认卡要给用户展示"从哪儿下"，
//   五套实现没法统一展示。
//
// ★ 排序口径（用户 2026-10-22 明确）：**国内优先 → 国外 → 多点冗余**。
//   region='cn' 的全部排在 region='global' 之前，同区按数组顺序。
//   `cnFirst()` 负责这个排序，调用方不要再自己排。
//
// ★ 安全：不执行任何从网络下载的脚本。这里是纯数据，执行在各自安装器里。

export type DownloadRegion = 'cn' | 'global';

export interface DownloadSource {
  /** 稳定 id，用于进度展示与用户指定镜像 */
  id: string;
  /** 给用户看的名字（确认卡上用） */
  label: string;
  region: DownloadRegion;
  /**
   * URL 模板，支持占位符：
   *   {repo}   如 ACE-Step/Ace-Step1.5
   *   {file}   文件名
   *   {tag}    release tag
   *   {version} 版本号
   */
  url: string;
}

/** 按「国内优先、国外次之」稳定排序（同区保持原顺序）。 */
export function cnFirst<T extends { region: DownloadRegion }>(list: readonly T[]): T[] {
  return [...list].filter((s) => s.region === 'cn').concat(list.filter((s) => s.region === 'global'));
}

/** 填充 URL 模板。未提供的占位符原样保留（便于排查而不是静默拼错）。 */
export function fillUrl(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? vars[k] : m));
}

// ═══════════════════════════════════════════════════════════════════
// 模型权重（HuggingFace 系仓库）
// ═══════════════════════════════════════════════════════════════════
export const HF_MODEL_SOURCES: readonly DownloadSource[] = [
  {
    id: 'modelscope',
    label: 'ModelScope（国内）',
    region: 'cn',
    url: 'https://www.modelscope.cn/models/{repo}/resolve/master/{file}',
  },
  {
    id: 'hf-mirror',
    label: 'HF 镜像（国内）',
    region: 'cn',
    url: 'https://hf-mirror.com/{repo}/resolve/main/{file}',
  },
  {
    id: 'huggingface',
    label: 'HuggingFace（国外）',
    region: 'global',
    url: 'https://huggingface.co/{repo}/resolve/main/{file}',
  },
];

// ═══════════════════════════════════════════════════════════════════
// GitHub Release 资产（注意：直连国内常年不通，加速站是主力）
// ═══════════════════════════════════════════════════════════════════
export const GITHUB_RELEASE_SOURCES: readonly DownloadSource[] = [
  {
    id: 'gh-proxy',
    label: 'gh-proxy 加速（国内）',
    region: 'cn',
    url: 'https://gh-proxy.com/https://github.com/{repo}/releases/download/{tag}/{file}',
  },
  {
    id: 'ghfast',
    label: 'ghfast 加速（国内）',
    region: 'cn',
    url: 'https://ghfast.top/https://github.com/{repo}/releases/download/{tag}/{file}',
  },
  {
    id: 'github',
    label: 'GitHub（国外）',
    region: 'global',
    url: 'https://github.com/{repo}/releases/download/{tag}/{file}',
  },
];

// ═══════════════════════════════════════════════════════════════════
// Python 依赖
// ═══════════════════════════════════════════════════════════════════
export const PIP_SOURCES: readonly DownloadSource[] = [
  { id: 'tuna', label: '清华源（国内）', region: 'cn', url: 'https://pypi.tuna.tsinghua.edu.cn/simple' },
  { id: 'aliyun', label: '阿里源（国内）', region: 'cn', url: 'https://mirrors.aliyun.com/pypi/simple/' },
  { id: 'pypi', label: 'PyPI 官方（国外）', region: 'global', url: 'https://pypi.org/simple' },
];

// ═══════════════════════════════════════════════════════════════════
// PyTorch CUDA 轮子 —— ★ 国内镜像不全，官方源必须保留在列表里
// ═══════════════════════════════════════════════════════════════════
export const TORCH_WHEEL_SOURCES: readonly DownloadSource[] = [
  {
    id: 'sjtu',
    label: '上海交大镜像（国内）',
    region: 'cn',
    url: 'https://mirror.sjtu.edu.cn/pytorch-wheels/cu128',
  },
  {
    id: 'pytorch-official',
    label: 'PyTorch 官方（国外）',
    region: 'global',
    url: 'https://download.pytorch.org/whl/cu128',
  },
];

// ═══════════════════════════════════════════════════════════════════
// ffmpeg 静态构建（Windows/macOS/Linux 分平台，这里给 Windows 主力源）
// ═══════════════════════════════════════════════════════════════════
export const FFMPEG_SOURCES: readonly DownloadSource[] = [
  {
    id: 'gh-proxy',
    label: 'gh-proxy 加速（国内）',
    region: 'cn',
    url: 'https://gh-proxy.com/https://github.com/{repo}/releases/download/{tag}/{file}',
  },
  {
    id: 'ghfast',
    label: 'ghfast 加速（国内）',
    region: 'cn',
    url: 'https://ghfast.top/https://github.com/{repo}/releases/download/{tag}/{file}',
  },
  {
    id: 'github',
    label: 'GitHub（国外）',
    region: 'global',
    url: 'https://github.com/{repo}/releases/download/{tag}/{file}',
  },
];

// ═══════════════════════════════════════════════════════════════════
// 体积常量（确认卡展示 + 守门测试断言用；改体积这里改一处）
// ═══════════════════════════════════════════════════════════════════
export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const RESOURCE_BYTES = {
  ffmpeg: 80 * MB,
  ytdlp: 30 * MB,
  'whisper-cli': 8 * MB,
  'whisper-model-base': 142 * MB,
  'whisper-model-small': 466 * MB,
  'whisper-model-medium': 1536 * MB,
  diffsinger: 400 * MB,
  acestep: 8900 * MB,
  'tts-pack': 31 * MB,
} as const;

/** 人类可读体积（确认卡用）。 */
export function humanBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/**
 * 供守门测试遍历的全部分组。
 * ★ 为什么单独导出：测试要断言"每组第一个都是国内源"，
 *   直接遍历模块内的 readonly 常量做不到 —— 必须有一个明确的集合入口。
 *   新增下载源分组时记得加进来，否则测试覆盖不到（这条也由测试自己检查）。
 */
export const DOWNLOAD_SOURCES_FOR_TEST = {
  hfModel: HF_MODEL_SOURCES,
  githubRelease: GITHUB_RELEASE_SOURCES,
  pip: PIP_SOURCES,
  torchWheel: TORCH_WHEEL_SOURCES,
  ffmpeg: FFMPEG_SOURCES,
} as const;
