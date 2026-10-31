import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';

/**
 * 宠物资源裁剪（--pets → YZ_BUILD_PETS）。
 *
 * 宠物素材是**静态 import**（webp 走 Rollup、VRM 走 publicDir），运行时过滤不解决问题：
 * 资源只要被引用就一定会 emit 进 dist。所以：
 *   1) 2D：把 packages/ui 的 pet-assets.ts 整个替换成"只 import 选中精灵图"的生成模块
 *      —— 未选的 webp 没有任何 import，Rollup 自然不会产出；
 *   2) 3D：publicDir 是整目录拷贝，构建结束（closeBundle）后删掉 dist/vrm 下未选的模型。
 *
 * YZ_BUILD_PETS 未设置 = 全量，返回 null 走原模块（行为与改动前完全一致）。
 */
const PET_ASSETS_MODULE = resolve(__dirname, '../../packages/ui/src/components/pet/pet-assets.ts');
const PET_CATALOG_FILE = resolve(__dirname, '../../packages/ui/src/assets/pet-packs/catalog.json');
const PET_PACKS_DIR = resolve(__dirname, '../../packages/ui/src/assets/pet-packs');
const PET_VRM_DIR = resolve(__dirname, '../web/public/vrm');
const DESKTOP_DIST = resolve(__dirname, 'dist');

interface PetEntry {
  id: string;
  file: string;
}

function resolvePetSelection(): { packs: PetEntry[]; vrms: PetEntry[] } | null {
  const raw = process.env.YZ_BUILD_PETS;
  if (raw === undefined) return null;
  const catalog = JSON.parse(readFileSync(PET_CATALOG_FILE, 'utf8')) as { packs?: PetEntry[]; vrms?: PetEntry[] };
  const packs = catalog.packs || [];
  const vrms = catalog.vrms || [];
  const tokens = String(raw).split(/[,\s]+/).filter(Boolean);
  if (!tokens.length) return null;
  if (tokens.includes('none')) return { packs: [], vrms: [] };

  const allIds = [...packs.map((p) => p.id), ...vrms.map((v) => v.id)];
  const unknown = tokens.filter((t) => !allIds.includes(t));
  if (unknown.length) throw new Error(`YZ_BUILD_PETS 含未知宠物: ${unknown.join(', ')}（可选: ${allIds.join(' / ')}）`);
  return { packs: packs.filter((p) => tokens.includes(p.id)), vrms: vrms.filter((v) => tokens.includes(v.id)) };
}

function petSelectionPlugin(): Plugin | null {
  const selection = resolvePetSelection();
  if (!selection) return null;
  const selectedVrmIds = selection.vrms.map((v) => v.id);

  return {
    name: 'yz-pet-selection',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?')[0].replace(/\\/g, '/');
      if (!clean.endsWith('/packages/ui/src/components/pet/pet-assets.ts')) return null;
      const imports = selection.packs
        .map((p, i) => `import __p${i} from ${JSON.stringify(resolve(PET_PACKS_DIR, p.file).replace(/\\/g, '/'))};`)
        .join('\n');
      const urls = selection.packs.map((p, i) => `${JSON.stringify(p.id)}: __p${i}`).join(', ');
      return [
        imports,
        `import __catalog from ${JSON.stringify(PET_CATALOG_FILE.replace(/\\/g, '/'))};`,
        `export const PET_PACK_URLS = { ${urls} };`,
        'export const PET_PACKS = __catalog.packs.filter((p) => Object.prototype.hasOwnProperty.call(PET_PACK_URLS, p.id));',
        `export const PET_VRM_MODELS = __catalog.vrms.filter((v) => ${JSON.stringify(selectedVrmIds)}.includes(v.id));`,
        'export const HAS_PET_ASSETS = PET_PACKS.length > 0 || PET_VRM_MODELS.length > 0;',
      ].join('\n');
    },
    closeBundle() {
      // publicDir 是整目录拷贝，Rollup 管不到 —— 构建结束后删掉未选的 VRM。
      if (!existsSync(PET_VRM_DIR) || !existsSync(DESKTOP_DIST)) return;
      const keep = new Set(selection.vrms.map((v) => v.file));
      let removed = 0;
      for (const name of readdirSync(PET_VRM_DIR)) {
        if (keep.has(name)) continue;
        const target = resolve(DESKTOP_DIST, 'vrm', name);
        if (!existsSync(target)) continue;
        rmSync(target, { recursive: true, force: true });
        removed += 1;
      }
      // 一个 3D 模型都没选：整个 dist/vrm 目录也不该留下（空目录容易被误读成"资源还在"）
      if (!keep.size) rmSync(resolve(DESKTOP_DIST, 'vrm'), { recursive: true, force: true });
      if (removed) console.log(`[pet-selection] 已从 dist/vrm 移除 ${removed} 个未选 VRM`);
    },
  };
}

const petPlugin = petSelectionPlugin();

export default defineConfig({
  plugins: [
    // ★ 必须在 vue 插件之前（enforce: 'pre'）：pet-assets.ts 要被整体替换，不能先被别的插件读过。
    ...(petPlugin ? [petPlugin] : []),
    // 关键：<webview> 是 Electron 提供的自定义元素（custom element），
    // 不在 HTML 标准标签集里，Vue 默认会尝试当组件解析 → "Failed to resolve component: webview"。
    // 注册到 isCustomElement 后编译器跳过它、走原生 createElement，渲染层才能拿到 Electron 提供的 webview 实例。
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview',
        },
      },
    }),
  ],
  resolve: {
    // 关键：packages/*/src 下有 tsc 编译残留 .js（8月24日旧产物）。Vite 默认 .js 优先于 .ts，
    // 会导致前端加载旧 .js（缺新功能导出，如 localAddDoc → SyntaxError）。让 .ts 优先。
    extensions: ['.ts', '.mjs', '.js', '.vue', '.json'],
    alias: {
      '@yan-zhi/ui': resolve(__dirname, '../../packages/ui/src'),
      '@yan-zhi/core': resolve(__dirname, '../../packages/core/src'),
      '@yan-zhi/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  // 关键：workspace 包是源码软链（非预构建 dist），默认会被 Vite 预打包进 .vite 缓存且不监听 HMR。
  // 排除后改为按需编译并监听源码，改 packages/* 后桌面前端实时热更，无需手动重启。
  optimizeDeps: {
    exclude: ['@yan-zhi/ui', '@yan-zhi/core', '@yan-zhi/shared'],
  },
  base: './',
  // 桌面端共享 web 的 public 目录（纹理图片、GeoJSON 等静态资源）
  publicDir: resolve(__dirname, '../web/public'),
  server: {
    port: 1420,
    strictPort: true,
    // 本机 chokidar 监听会静默挂掉（改 packages/ui 不触发 HMR，实测 2026-09-15）：
    // 轮询兜底，保证 packages/* 源码改动一定能被看到。
    watch: {
      usePolling: true,
      interval: 500,
      // 轮询是整棵树扫描：把不参与 HMR 的大目录排除，冷启动扫描量与常驻 CPU 都会降。
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-release/**',
        '**/release/**',
        '**/logs/**',
        '**/tmp/**',
        '**/.workbuddy/**',
        '**/.git/**',
      ],
    },
    // 代理后端 API（/api → 本机内嵌后端）
    // ★ 端口随实例：dev 实例 3002 / 生产 3001。写死 3001 会让开发实例的**相对路径**请求
    //   （未走 apiFetch 的那些，如 SSE 直连）落到正式版后端上。
    //   优先读 dev 编排器下发的 YANZHI_API_PORT。
    proxy: {
      '/api': {
        // ★★ 必须用 127.0.0.1 而不是 localhost（与 apps/web 同口径，2026-10-07）：
        //   Node 18+ 会把 localhost 优先解析到 ::1，而本机 IPv6 是黑洞 →
        //   代理 `AggregateError [ECONNREFUSED]` → 界面全部 /api 500，
        //   但直连 127.0.0.1 正常，症状极易被误判成"后端没起"。
        target: `http://127.0.0.1:${process.env.YANZHI_API_PORT || 3001}`,
        changeOrigin: true,
        // 运维控制台的交互终端走 WebSocket（/api/plugin/ops-shell/term/ws）：
        // 不开这一项，dev 下 upgrade 请求不会被转发，前端只能回退到 SSE 通道。
        ws: true,
      },
    },
  },
  // 生产构建加固：不输出 sourcemap、去掉注释与 debugger（防逆向的第一层）。
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // ★ 构建清单：scripts/verify-mode-prune.cjs 用它断言「未选模式的源模块没有产出 chunk」。
    //   清单本身就是产物的一部分（.vite/manifest.json，几 KB），不影响运行。
    manifest: true,
    // 多入口：capture.html 是远控采集窗口、rc-card.html 是被控端悬浮卡片（都与主窗口解耦）。
    // dev 由 vite 直接按文件路径服务；打包后输出 dist/*.html，主进程 loadFile 加载。
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        capture: resolve(__dirname, 'capture.html'),
        'rc-card': resolve(__dirname, 'rc-card.html'),
        // dev-only 冒烟入口：弹幕游戏五玩法渲染/交互验证（不进主界面）
        'game-harness': resolve(__dirname, 'game-harness.html'),
      },
    },
  },
});
