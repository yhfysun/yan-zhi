// 智能体「图片头像」注册表（彩色图标 / 卡通 / 动漫 / 表情 / 摄影）。
//
// 素材来源（可商用的开放授权内容，随包内置、离线可用）：
//   · tech 组：Microsoft Fluent Emoji（MIT）—— 彩色 3D 风格图标，内置智能体默认头像
//   · flat 组：flat-color-icons by Icons8（CC BY 4.0，署名见本注释）
//   · iconfont 组：iconfont.cn（阿里巴巴矢量图标库，图标由个人作者上传）
//     —— 单色线性图标，落盘时统一 fill 为项目主色 #6B7AE8；逐枚来源（图标 id / 作者 /
//        原始名）见 docs/iconfont头像图标来源清单.md。商用前需在各图标详情页
//        确认作者授权（多数为「可商用」，部分要求署名）。
//   · DiceBear 9.x（adventurer / lorelei / fun-emoji）—— MIT 许可的生成式插画头像
//   · Lorem Picsum（Unsplash 授权摄影图）—— 256×256 缩略图
// 刻意**不内置真人明星照片**：肖像权与版权无法随应用分发，属于合规红线。
// 依赖 Vite 的 import.meta.glob 在构建期把素材变成带 hash 的静态 URL，
// 因此 Electron 打包不需要额外拷贝 public 目录。
import { AVATAR_KEY_PREFIX } from './agentIcon';

const modules = import.meta.glob('../assets/agent-avatars/*/*.{svg,jpg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface AgentAvatarImage {
  /** 存入 agent.avatar 的值，形如 `img:cartoon-01` */
  key: string;
  src: string;
  /** 分组 id（cartoon / anime / emoji / scene） */
  group: string;
}

/** 分组展示名与顺序：只列有素材的分组 */
export const AVATAR_GROUP_LABELS: Record<string, string> = {
  tech: '图标 · 3D',
  flat: '图标 · 扁平',
  iconfont: '图标 · iconfont',
  animal: '动物',
  pixel: '像素',
  bot: '机器人',
  croodle: '涂鸦',
  'three-d': '3D 人物',
  scene: '摄影',
};

const GROUP_ORDER = Object.keys(AVATAR_GROUP_LABELS);

function parseGlobPath(path: string): { group: string; name: string } | null {
  const m = path.match(/agent-avatars\/([^/]+)\/([^/]+)\.[a-z0-9]+$/i);
  return m ? { group: m[1], name: m[2] } : null;
}

const IMAGES: AgentAvatarImage[] = Object.entries(modules)
  .map(([path, src]) => {
    const parsed = parseGlobPath(path);
    if (!parsed) return null;
    return { key: `${AVATAR_KEY_PREFIX}${parsed.name}`, src, group: parsed.group };
  })
  .filter((x): x is AgentAvatarImage => !!x)
  .sort((a, b) => a.key.localeCompare(b.key, 'en'));

const BY_KEY = new Map(IMAGES.map((i) => [i.key, i.src]));

/** 按分组取素材（顺序对齐 AVATAR_GROUP_LABELS） */
export function agentAvatarGroups(): Array<{ group: string; label: string; items: AgentAvatarImage[] }> {
  return GROUP_ORDER
    .map((group) => ({
      group,
      label: AVATAR_GROUP_LABELS[group],
      items: IMAGES.filter((i) => i.group === group),
    }))
    .filter((g) => g.items.length > 0);
}

/** avatar → 图片 URL；非图片头像（图标 key / 空 / 脏值）返回 undefined */
export function resolveAgentAvatarImage(avatar?: string | null): string | undefined {
  if (!avatar || !avatar.startsWith(AVATAR_KEY_PREFIX)) return undefined;
  return BY_KEY.get(avatar);
}

/** 是否为本应用认识的图片头像 key（用于编辑弹窗回填时过滤历史脏值） */
export function isKnownAgentAvatarImage(avatar?: string | null): boolean {
  return !!resolveAgentAvatarImage(avatar);
}

/**
 * 内置智能体 id → 默认彩色头像（tech 组）。
 * ★ 与 apps/server seed 的 id 对齐；新增内置智能体时在这里补一行，
 *   否则它会回落到 agentIcon 的单色预设图标。
 */
export const AGENT_AVATAR_IMAGE_BY_ID: Record<string, string> = {
  // 日常办公 / 通用
  a_default_assistant: 'img:tech-general',
  a_builtin_workflow_assistant: 'img:tech-workflow',
  // 浏览器操作（pageAgent）
  a_builtin_page_agent: 'img:tech-browser',
  // 数据查询分析
  a_builtin_data_agent: 'img:tech-data',
  // 运维
  a_builtin_ops_agent: 'img:tech-ops',
  // 安全三件套
  a_builtin_sec_agent: 'img:tech-security',
  a_builtin_sec_recon_agent: 'img:tech-recon',
  a_builtin_sec_web_agent: 'img:tech-webscan',
  a_builtin_sec_report_agent: 'img:tech-report',
  // 代码 / 研发
  a_builtin_code_agent: 'img:tech-code',
  a_builtin_code_explorer: 'img:tech-code-explore',
  a_builtin_backend_dev: 'img:tech-backend',
  a_builtin_frontend_dev: 'img:tech-frontend',
  a_builtin_java_agent: 'img:tech-java',
  a_builtin_cicd_agent: 'img:tech-cicd',
  // 设计
  a_builtin_design_agent: 'img:tech-design',
  a_builtin_ui_designer: 'img:tech-ui-design',
  // 短剧 / 剪辑
  a_builtin_storyboard_agent: 'img:tech-storyboard',
  a_builtin_clip_agent: 'img:tech-clip',
  // 发布
  a_builtin_publish_agent: 'img:tech-publish',
  // 多语翻译
  a_builtin_translate_agent: 'img:tech-translate',
  // 小微生意经营
  a_builtin_business_agent: 'img:tech-shop',
  // 抖音运营
  a_builtin_douyin_agent: 'img:tech-phone',
  // 小说 / 推文 / 脚本 / 有声小说 / 配音
  a_builtin_novel_agent: 'img:tech-novel',
  a_builtin_novel_tuiwen_agent: 'img:tech-tuiwen',
  a_builtin_script_agent: 'img:tech-script',
  a_builtin_audiobook_agent: 'img:tech-audiobook',
  a_builtin_dubbing_agent: 'img:tech-dubbing',
};

/** 内置智能体的默认头像 URL；非内置 id 或素材缺失返回 undefined */
export function resolveAgentAvatarImageByAgentId(id?: string | null): string | undefined {
  const key = id ? AGENT_AVATAR_IMAGE_BY_ID[id] : undefined;
  return key ? BY_KEY.get(key) : undefined;
}

/** 全部素材（测试用） */
export const AGENT_AVATAR_IMAGES: readonly AgentAvatarImage[] = IMAGES;
