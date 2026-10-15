// 场景/模板图标必须 markRaw —— 守门测试（2026-10-14，用户报 Vue 警告）。
//
// 用户原话：「[Vue warn] Vue received a Component that was made a reactive object … 这刷新后警告越来越多？」
//
// 根因：SceneDef.icon 是**组件对象**（element-plus 图标），而场景会被放进响应式状态
//   （stores/sceneConfig.ts 的 `ref<SceneDef[]>([...SCENES])` 与后端行 `rowToSceneDef`），
//   未 markRaw 时每个 icon 被 reactive() 代理；Vue 在 createVNode 里对 `isProxy(type)`
//   有专门检查（runtime-core，命中即 warn + toRaw），且**每次渲染都判、不去重** →
//   SceneCarousel 13 张卡一次渲染刷 13 条，重渲染/重挂载（刷新）再刷一批。
//
// ★ 判据照抄 Vue 自己的检查：`isProxy(被 reactive() 包过之后取出来的 icon)` 必须为 false。
//   这是行为断言而非源码文本断言——markRaw 换成 shallowRef 等其它写法也能通过，只要效果对。
import { describe, it, expect } from 'vitest';
import { reactive, isProxy } from 'vue';
import { Suitcase, VideoCamera } from '@element-plus/icons-vue';
import { SCENES, WELCOME_SCENES } from './scenes';
import { DEV_TPLS } from './devTpls';
import { resolveSceneIcon, SCENE_FALLBACK_ICON } from './sceneIcon';

/** 模拟 Vue 渲染路径：把带 icon 的对象放进响应式容器再取出来（createVNode 收到的就是它） */
const iconAsVueSeesIt = (holder: { icon: unknown }) => reactive(holder).icon;

describe('① 内置兜底场景（config/scenes.ts）', () => {
  it('★ 每个场景的 icon 经 reactive 容器取出后仍非 proxy', () => {
    for (const s of reactive([...SCENES])) {
      expect(isProxy(iconAsVueSeesIt(s)), `场景 ${s.key} 的 icon 被代理 → Vue 每次渲染都会警告`).toBe(false);
    }
  });

  it('★ 欢迎卡子集（真正渲染进轮播的那批）同样非 proxy', () => {
    expect(WELCOME_SCENES.length).toBeGreaterThan(0);
    for (const s of reactive([...WELCOME_SCENES])) {
      expect(isProxy(iconAsVueSeesIt(s)), `欢迎卡 ${s.key} 的 icon 被代理`).toBe(false);
    }
  });
});

describe('② 后端行解析出的场景（config/sceneIcon.ts）', () => {
  it('★ resolveSceneIcon 的结果（含兜底）非 proxy', () => {
    for (const name of ['Suitcase', 'VideoCamera', 'Notebook', 'Shop', 'NoSuchIcon', '', null]) {
      const icon = resolveSceneIcon(name as string | null);
      expect(isProxy(iconAsVueSeesIt({ icon })), `icon=${String(name)} 解析结果被代理`).toBe(false);
    }
    expect(isProxy(iconAsVueSeesIt({ icon: SCENE_FALLBACK_ICON }))).toBe(false);
  });
});

describe('③ 开发模式任务模板（config/devTpls.ts）', () => {
  it('★ 每个模板的 icon 非 proxy（DEV_TPLS 直接进 SceneCarousel 渲染）', () => {
    for (const t of reactive([...DEV_TPLS])) {
      expect(isProxy(iconAsVueSeesIt(t)), `模板 ${t.key} 的 icon 被代理`).toBe(false);
    }
  });
});

describe('④ markRaw 不得改变图标本体（不能克隆/换成壳）', () => {
  it('markRaw 就地打标记：仍是 element-plus 的同一个组件对象', () => {
    // markRaw 返回原对象；若实现改成 `({...icon})` 之类会破坏 <component :is> 的组件身份
    expect(SCENE_FALLBACK_ICON).toBe(Suitcase);
    expect(resolveSceneIcon('VideoCamera')).toBe(VideoCamera);
    expect(SCENES.find((s) => s.key === 'office')?.icon).toBe(Suitcase);
    expect(SCENE_FALLBACK_ICON).toBeTruthy();
  });
});