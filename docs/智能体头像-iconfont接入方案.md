# 智能体头像 · iconfont 图标接入方案（交接给 WorkBuddy 执行）

> 交接对象：WorkBuddy（或任何有系统浏览器操作权的执行者）
> 日期：2026-10-26
> 目标仓库：`C:\Users\yhfys\Desktop\ai-assistant`，分支 `dev0.1-mobile`

---

## 一、当前状态（已经做完的部分，不要重做）

智能体头像已经整体换成彩色图标：

| 分组 id | 展示名 | 数量 | 来源 | 授权 |
|---|---|---|---|---|
| `tech` | 图标 · 3D | 74 | Microsoft Fluent Emoji | MIT |
| `flat` | 图标 · 扁平 | 32 | flat-color-icons (Icons8) | CC BY 4.0 |
| `animal` / `pixel` / `bot` / `croodle` / `three-d` / `scene` | 动物/像素/机器人/涂鸦/3D人物/摄影 | 72 | DiceBear / Lorem Picsum | MIT / Unsplash |

已接线的代码（**改动前先读这几个文件**）：

- `packages/ui/src/assets/agent-avatars/<group>/<group>-<slug>.svg` —— 素材目录，Vite `import.meta.glob` 自动收集
- `packages/ui/src/utils/agentAvatarImages.ts` —— 分组表 `AVATAR_GROUP_LABELS`、内置智能体默认头像 `AGENT_AVATAR_IMAGE_BY_ID`
- `packages/ui/src/components/AgentAvatar.vue` —— 全站唯一渲染点（6 处调用）
- `packages/ui/src/components/AgentEditDialog.vue` —— 头像选择器（按分组自动生成 tab）
- `packages/ui/src/utils/agentIcon.ts` —— 旧的单色 icon-park 图标表，**仅作历史数据解析兜底，不要删**

渲染优先级（`AgentAvatar.vue` 里实现）：用户选的图片 → 用户选的图标键 → 内置 id 彩色预设 → 内置 id 单色兜底 → 名称首字。

---

## 二、本次要做的唯一一件事

把用户自己挑的 **iconfont 图标**接成第三个彩色图标分组 `iconfont`，并可选地把内置智能体的默认头像切过去。

## 三、为什么之前的执行者没做成（重要，别重复踩）

1. iconfont 的取图接口需要登录态，匿名访问实测结果：
   - `GET  https://www.iconfont.cn/api/icon/show.json?id=<id>` → `{"code":500,"error_code":"LOGIN REQUIRED"}`
   - `GET  https://www.iconfont.cn/api/icon/getDownloadUrl.json?id=<id>&type=svg` → 同上
   - 只有搜索接口 `POST /api/icon/search.json` 匿名可用（返回元数据，不含 SVG 内容）
2. 应用内嵌的 Browser 预览面板把外链一律交给系统浏览器打开（`apps/desktop/main.cjs` 的 `shell:openExternal` / `guardNavigation`），所以面板里永远拿不到登录态。
3. 结论：**必须在系统浏览器里完成登录 + 下载，再把下载产物交给 Python/Node 脚本处理**。登录态无法跨进程复用。

---

## 四、执行步骤

### Step 0 · 前置

- 系统浏览器（Chrome / Edge）打开 `https://www.iconfont.cn/` 并登录。
- 确认 Node ≥ 20、Python 可用（脚本用 Node 即可，无需额外依赖）。
- 工作副本：`git switch dev0.1-mobile`，确保工作区干净（本方案会新增文件，不会改已有素材）。

### Step 1 · 在 iconfont 建项目并收集图标

1. 按第五节「语义映射建议」逐条搜索图标，悬停点购物车加购。
2. 右上角购物车 →「添加至项目」→ 新建项目，命名随意（如 `ai-agent-avatar`）。
3. 进项目页 → 右上「下载至本地」→ 得到 zip（一般落在 `C:\Users\yhfys\Downloads`）。

### Step 2 · 解包并提取 SVG

iconfont 的下载包有两型，先看清楚：

**A 型（含独立 SVG）**：zip 内有 `svg/` 目录或一堆 `.svg` 文件
→ 直接用，跳到 Step 3。

**B 型（只有字体 + symbol 精灵图）**：zip 内是 `iconfont.js` / `iconfont.json` / `iconfont.ttf|woff|woff2` / `demo_index.html`
→ 用下面的脚本从 `iconfont.js` 的 `<symbol>` 里抠出每个图标。

```js
// extract-iconfont.mjs
// 用法: node extract-iconfont.mjs <解包目录> <输出目录>
// 说明: iconfont.js 形如: var svgIconXml = '<svg><symbol id="xxx" viewBox="..."><path .../></symbol>...</svg>'
import fs from 'node:fs';
import path from 'node:path';

const [, , inDir, outDir] = process.argv;
const js = fs.readFileSync(path.join(inDir, 'iconfont.js'), 'utf8');

const symbols = [...js.matchAll(/<symbol\b[^>]*id="([^"]+)"[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)];
if (!symbols.length) {
  console.error('未找到 <symbol>：确认 zip 里是 B 型包，且 iconfont.js 未被压缩成一行的其他格式');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [, id, viewBox, inner] of symbols) {
  // 只保留几何元素，去掉 symbol 的填充色，改由 CSS/外层决定（单色图标）
  const body = inner.replace(/\sfill="[^"]*"/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">${body}</svg>\n`;
  const file = path.join(outDir, `${id}.svg`);
  fs.writeFileSync(file, svg, 'utf8');
}
console.log(`导出 ${symbols.length} 个图标到 ${outDir}`);
```

> `id` 通常是中文拼音或 unicode（如 `shuju` / `e600`）。中文名会被 iconfont 转成拼音，**这一步产物是机器名，Step 3 里必须人工重命名成语义 slug**。

### Step 3 · 落盘规范（严格照做，否则渲染/测试会挂）

- 目录：`packages/ui/src/assets/agent-avatars/iconfont/`
- 文件名：`iconfont-<slug>.svg`，slug 全小写字母/数字/连字符（例：`iconfont-data.svg`）
- 每个 SVG 必须满足：
  - 以 `<svg` 开头，含 `xmlns="http://www.w3.org/2000/svg"` 与 `viewBox`
  - 不含 `<?xml ... ?>` 声明、不含 `<script>`、不含外链 `xlink:href="http://..."`
  - 不存在 `undefined` 字样
- 校验命令（提交前必跑）：

```bash
node -e "
const fs=require('fs');
const d='packages/ui/src/assets/agent-avatars/iconfont';
let bad=0;
for (const f of fs.readdirSync(d)) {
  if (!f.endsWith('.svg')) continue;
  const s=fs.readFileSync(d+'/'+f,'utf8');
  if (!s.startsWith('<svg') || !s.includes('xmlns=') || !s.includes('viewBox') || /<script|<\\?xml|undefined/.test(s)) { console.log('BAD',f); bad++; }
}
console.log('bad', bad);
"
```

### Step 4 · 单色图标染色（B 型必做，A 型视情况）

`AgentAvatar.vue` 用的是 `<img src>`，**`currentColor` 在 `<img>` 里不生效**，会渲染成黑色。二选一：

- **方案 A（推荐，改动最小）**：落盘时把每个 path 的 `fill` 统一写成主色 `#6B7AE8`（项目主色，见 `packages/ui/src/styles/tokens.css` 的 `--color-primary`）。
  ```bash
  sed -i 's/fill="currentColor"/fill="#6B7AE8"/' packages/ui/src/assets/agent-avatars/iconfont/*.svg
  ```
  缺点：深色主题下主色字标对比度需自查。
- **方案 B（要 theme 自适应才做）**：不进图片分组，改为在 `agentIcon.ts` 里把 SVG 当 Vue 组件引入，用 `fill: currentColor` + 父容器 `color: var(--color-primary)`。工作量大，需改 `AgentAvatar.vue` 的渲染分支，**非必要不要选**。

### Step 5 · 注册分组

改 `packages/ui/src/utils/agentAvatarImages.ts`，在 `AVATAR_GROUP_LABELS` 里 `flat` 之后插一行（**顺序即选择器 tab 顺序**）：

```ts
export const AVATAR_GROUP_LABELS: Record<string, string> = {
  tech: '图标 · 3D',
  flat: '图标 · 扁平',
  iconfont: '图标 · iconfont',   // ← 新增
  animal: '动物',
  // …其余不动
};
```

**不需要改 `AgentAvatar.vue`、不需要改 `AgentEditDialog.vue`**：分组、tab、素材都由 glob + 标签表自动推导。

### Step 6（可选）· 内置智能体默认头像切到 iconfont

只在用户明确要求「内置那 28 个也换成 iconfont」时做。改 `AGENT_AVATAR_IMAGE_BY_ID` 的 value 为 `img:iconfont-<slug>`，key 保持不动。

### Step 7 · 测试

`packages/ui/src/utils/agentAvatarImages.test.ts` 里有两处写死的期望值，必须同步：

```ts
expect(groups.length, '应有 8 个分组').toBe(8);                       // → 9（加一组就 +1）
expect(agentAvatarGroups().map((g) => g.group))
  .toEqual(['tech','flat','animal','pixel','bot','croodle','three-d','scene']); // → 在 flat 后插入 'iconfont'
```

另外 `agentIcon.test.ts` 的「每个内置 id 都配了彩色头像预设」会自动覆盖 `AGENT_AVATAR_IMAGE_BY_ID` 的 key 有效性，不用改。

### Step 8 · 验收

```bash
cd packages/ui
npx vitest run --no-file-parallelism src/utils/agentAvatarImages.test.ts src/utils/agentIcon.test.ts
npx vue-tsc --noEmit
```

- 全绿。
- 启动应用（`pnpm dev` 或桌面端），检查三处：智能体列表头像、聊天输入框的智能体选择器、编辑弹窗「头像」tab 里出现 `图标 · iconfont` 且图标正常显示（不是黑块、不是空白、不是裂图）。
- 深色主题下再看一眼（如做了染色）。

---

## 五、语义映射建议（挑图标时照这张表搜）

| 内置智能体 id | 建议图标语义 | 现用 tech 键 |
|---|---|---|
| a_default_assistant | 星火/助手法杖 | tech-general |
| a_builtin_workflow_assistant | 循环箭头/流程节点 | tech-workflow |
| a_builtin_page_agent | 地球/浏览器窗口 | tech-browser |
| a_builtin_data_agent | 柱状图/数据库 | tech-data |
| a_builtin_ops_agent | 服务器/显示器 | tech-ops |
| a_builtin_sec_agent | 盾牌 | tech-security |
| a_builtin_sec_recon_agent | 望远镜/雷达 | tech-recon |
| a_builtin_sec_web_agent | 地球+放大镜 | tech-webscan |
| a_builtin_sec_report_agent | 剪贴板/报告单 | tech-report |
| a_builtin_code_agent | 笔记本电脑/终端 | tech-code |
| a_builtin_code_explorer | 放大镜+文件夹 | tech-code-explore |
| a_builtin_backend_dev | 文件柜/机架 | tech-backend |
| a_builtin_frontend_dev | 画笔/图层 | tech-frontend |
| a_builtin_java_agent | 咖啡杯 | tech-java |
| a_builtin_cicd_agent | 火箭/流水线 | tech-cicd |
| a_builtin_design_agent | 画框/调色板 | tech-design |
| a_builtin_ui_designer | 调色板 | tech-ui-design |
| a_builtin_storyboard_agent | 场记板 | tech-storyboard |
| a_builtin_clip_agent | 胶片 | tech-clip |
| a_builtin_publish_agent | 包裹/上传 | tech-publish |
| a_builtin_translate_agent | 字母 A 文/双语文档 | tech-translate |
| a_builtin_business_agent | 小店/收银 | tech-shop |
| a_builtin_douyin_agent | 手机/短视频 | tech-phone |
| a_builtin_novel_agent | 书堆 | tech-novel |
| a_builtin_novel_tuiwen_agent | 翻开的书 | tech-tuiwen |
| a_builtin_script_agent | 便签/剧本 | tech-script |
| a_builtin_audiobook_agent | 耳机 | tech-audiobook |
| a_builtin_dubbing_agent | 麦克风 | tech-dubbing |

选择器里另需覆盖通用语义（各挑 1 个即可）：办公、数据、图表、运维、安全、检索、设计、视频、文档、研究、客服、电商、流程、发布、智能、财务、教育、医疗、音频、图像、本地、创意。

---

## 六、风险与注意事项

1. **授权**：iconfont 上的图标是个人作者上传，商用前需在该图标详情页确认许可（很多是「可商用/署名」）。建议在 `agentAvatarImages.ts` 顶部注释里写明所用图标集的项目链接与作者，和现有的 Fluent/flat 授权说明放一起。
2. **不要删 `AGENT_ICON_LIBRARY`**：老数据 `agent.avatar` 存的是 `code`/`data` 这类旧图标键，删了会让这批智能体头像退化成名称首字。
3. **不要动数据库**：`AGENT_AVATAR_IMAGE_BY_ID` 是渲染期预设，内置智能体库里 `avatar` 依旧是空值；用户显式选过头像的永远优先。
4. **文件名唯一性**：key 形如 `img:<文件名去扩展名>` 全局唯一。iconfont 分组所有文件必须带 `iconfont-` 前缀，避免与 `animal-01` 等撞车。
5. **素材体积**：单色 SVG 每个 1–3KB，几十个图标无压力；如果塞进来的是彩色位图就放弃，改回 `<use>` 方案。

## 七、回滚

```bash
git rm -r packages/ui/src/assets/agent-avatars/iconfont
git checkout -- packages/ui/src/utils/agentAvatarImages.ts packages/ui/src/utils/agentAvatarImages.test.ts
```

回滚后系统回到「彩色 3D + 彩色扁平」两组彩色图标状态，功能完整。
