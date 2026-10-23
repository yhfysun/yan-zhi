// 智能体头像解析（utils/agentIcon.ts）—— 回归测试。
//
// 语义（2026-10-23 用户拍板）：
//   1) 用户选过头像 → 一定用所选；
//   2) 内置智能体没选过 → 必须有预设图标（"内置的也要有 id"）；
//   3) 自建且没选过 → 返回 undefined，由组件显示名称首字（不做按名字猜图标）。
import { describe, it, expect } from 'vitest';
import {
  resolveAgentIcon, agentInitial, isKnownAgentIconKey,
  AGENT_ICON_BY_ID, AGENT_ICON_LIBRARY, AVATAR_KEY_PREFIX,
} from './agentIcon';

/** 内置助手 id 全量清单（与 apps/server seed 对齐；新增内置智能体时要同步补映射） */
const BUILTIN_AGENT_IDS = [
  'a_default_assistant',
  'a_builtin_page_agent',
  'a_builtin_data_agent',
  'a_builtin_ops_agent',
  'a_builtin_sec_agent',
  'a_builtin_java_agent',
  'a_builtin_cicd_agent',
  'a_builtin_code_agent',
  'a_builtin_storyboard_agent',
  'a_builtin_design_agent',
  'a_builtin_code_explorer',
  'a_builtin_backend_dev',
  'a_builtin_ui_designer',
  'a_builtin_frontend_dev',
  'a_builtin_translate_agent',
  'a_builtin_business_agent',
  'a_builtin_douyin_agent',
  // 任务模式（小说 / 推文 / 脚本 / 有声小说 / 配音 / 剪辑 / 发布）
  'a_builtin_novel_agent',
  'a_builtin_novel_tuiwen_agent',
  'a_builtin_script_agent',
  'a_builtin_audiobook_agent',
  'a_builtin_dubbing_agent',
  'a_builtin_clip_agent',
  'a_builtin_publish_agent',
];

describe('内置智能体必须全部有预设图标（漏登记 = 回落首字）', () => {
  it('清单里每个内置 id 都能命中 AGENT_ICON_BY_ID', () => {
    const missing = BUILTIN_AGENT_IDS.filter((id) => !AGENT_ICON_BY_ID[id]);
    expect(missing, '未配置图标的内置 id：' + missing.join(', ')).toEqual([]);
  });

  it('每个内置 id 都能解析出图标', () => {
    for (const id of BUILTIN_AGENT_IDS) {
      expect(resolveAgentIcon(id, null), `${id} 解析不到图标`).toBeTruthy();
    }
  });
});

describe('内置图标库 · 用户可自选图标', () => {
  it('每个选项都有唯一 key 与图标组件', () => {
    expect(AGENT_ICON_LIBRARY.length).toBeGreaterThanOrEqual(12);
    const keys = AGENT_ICON_LIBRARY.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const o of AGENT_ICON_LIBRARY) {
      expect(o.icon, `${o.key} 缺少图标组件`).toBeTruthy();
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('isKnownAgentIconKey 只认库内 key（图片 key / 脏值一律 false）', () => {
    expect(isKnownAgentIconKey('code')).toBe(true);
    expect(isKnownAgentIconKey(`${AVATAR_KEY_PREFIX}animal-01`)).toBe(false);
    expect(isKnownAgentIconKey('https://example.com/a.png')).toBe(false);
    expect(isKnownAgentIconKey('')).toBe(false);
    expect(isKnownAgentIconKey(null)).toBe(false);
  });
});

describe('resolveAgentIcon · 用户选择优先，其次内置预设，最后交给首字', () => {
  it('avatar 命中图标库 → 用用户选的（压过内置预设）', () => {
    const chosen = AGENT_ICON_LIBRARY.find((o) => o.key === 'creative')!;
    expect(resolveAgentIcon('a_builtin_data_agent', 'creative')).toBe(chosen.icon);
  });

  it('没选 avatar 的内置助手 → 用内置预设图标', () => {
    expect(resolveAgentIcon('a_builtin_data_agent', null)).toBe(AGENT_ICON_BY_ID.a_builtin_data_agent);
    expect(resolveAgentIcon('a_builtin_data_agent', '')).toBe(AGENT_ICON_BY_ID.a_builtin_data_agent);
  });

  it('★ 自建助手没选头像 → undefined（组件显示名称首字，不猜图标）', () => {
    expect(resolveAgentIcon('user-123', null)).toBeUndefined();
    expect(resolveAgentIcon('user-123', '')).toBeUndefined();
    expect(resolveAgentIcon(undefined, undefined)).toBeUndefined();
    // 历史脏值（旧头像 URL）同样忽略
    expect(resolveAgentIcon('user-123', 'https://x/y.png')).toBeUndefined();
  });

  it('图片头像 key 不参与图标解析（由 agentAvatarImages 先行处理）', () => {
    expect(resolveAgentIcon('user-123', `${AVATAR_KEY_PREFIX}animal-01`)).toBeUndefined();
  });
});

describe('agentInitial · 首字占位', () => {
  it('取首 1 字，空名回 ?', () => {
    expect(agentInitial('数据查询分析助手')).toBe('数');
    expect(agentInitial('Browser Agent')).toBe('B');
    expect(agentInitial('')).toBe('?');
    expect(agentInitial(undefined)).toBe('?');
  });

  it('按码点切，emoji 名不会被截断', () => {
    expect(agentInitial('🤖 小助手')).toBe('🤖');
  });

  it('支持取前 N 字', () => {
    expect(agentInitial('数据查询分析助手', 2)).toBe('数据');
    expect(agentInitial('短剧流水线', 2)).toBe('短剧');
  });
});
