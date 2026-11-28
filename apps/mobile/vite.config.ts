import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cpSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * 把 apps/web/public/phonics-audio（44 个音标本音 mp3 + 第 1 课慢速拼读示范，
 * ~1MB，单一真相源在 web）同步进 mobile 的 publicDir —— vite 会随 dist 打进
 * APK assets。★ 没有它，移动端点音标/慢速拼读全部 404 静默：playLocalAudio
 * 失败回退 TTS 读例词（2026-11-16 真机实锤「点 /æ/ 发的是 tap」「慢速拼读没声音」）。
 * 产物不入库（.gitignore apps/mobile/public/），dev 与 build 的 buildStart 都会刷新。
 */
function phonicsAudioSync(): Plugin {
  const src = resolve(__dirname, '../web/public/phonics-audio');
  const dest = resolve(__dirname, 'public/phonics-audio');
  return {
    name: 'yz-sync-phonics-audio',
    buildStart() {
      if (existsSync(src)) cpSync(src, dest, { recursive: true });
    },
  };
}

/**
 * Android 正式包没有桌面桌宠能力。
 * 在模块解析层替换 pet-assets，让所有 spritesheet / VRM 的静态引用根本不进入 Rollup。
 */
function mobilePetAssetStub(): Plugin {
  const stub = resolve(__dirname, '../../packages/ui/src/components/pet/pet-assets.mobile.ts');
  return {
    name: 'yz-mobile-pet-asset-stub',
    enforce: 'pre',
    resolveId(source) {
      const cleanSource = String(source).split('?')[0].replace(/\\/g, '/');
      return /(?:^|\/)pet-assets(?:\.ts)?$/.test(cleanSource) ? stub : null;
    },
  };
}

export default defineConfig({
  plugins: [vue(), phonicsAudioSync(), mobilePetAssetStub()],
  resolve: {
    extensions: ['.ts', '.mjs', '.js', '.vue', '.json'],
    alias: {
      '@yan-zhi/ui': resolve(__dirname, '../../packages/ui/src'),
      '@yan-zhi/core': resolve(__dirname, '../../packages/core/src'),
      '@yan-zhi/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5174,
  },
});
