// 智能体「图片头像」注册表（卡通 / 动漫 / 表情 / 摄影）。
//
// 素材来源（可商用的开放授权生成内容，随包内置、离线可用）：
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
  animal: '动物',
  pixel: '像素',
  bot: '机器人',
  croodle: '涂鸦',
  'three-d': '3D',
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

/** 全部素材（测试用） */
export const AGENT_AVATAR_IMAGES: readonly AgentAvatarImage[] = IMAGES;
