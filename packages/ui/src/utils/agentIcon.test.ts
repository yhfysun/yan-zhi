// 助手图标解析（utils/agentIcon.ts）—— 回归测试。
//
// 为什么值得测：
//   1) 内置助手 seed 的 avatar 全是 NULL，图标完全由这张映射表决定，
//      漏一个 id 就会静默退化成「名称首字色块」，与同菜单其他项不一致；
//   2) 关键词规则有优先级（先匹配先胜），顺序改动会改变结果，
//      比如「代码编写助手」必须命中代码图标而不是被「助手」抢先；
//   3) 兜底必须稳定，否则用户自建助手会呈现随机图标。
import { describe, it, expect } from 'vitest';
import {
  resolveAgentIcon, shouldUseAgentIcon, agentInitial,
  AGENT_ICON_BY_ID, AGENT_FALLBACK_ICON,
} from './agentIcon';

/** 内置助手 id 全量清单（与 apps/server/src/db.ts 的 seed 对齐） */
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
];

describe('内置助手 id 必须全部登记图标（漏登记 = 静默退化首字块）', () => {
  it('14 个内置 id 都能命中 AGENT_ICON_BY_ID', () => {
    const missing = BUILTIN_AGENT_IDS.filter((id) => !AGENT_ICON_BY_ID[id]);
    expect(missing).toEqual([]);
  });

  it('shouldUseAgentIcon 对内置 id 恒为 true（即使名称为空）', () => {
    for (const id of BUILTIN_AGENT_IDS) {
      expect(shouldUseAgentIcon(id, '')).toBe(true);
    }
  });
});

describe('resolveAgentIcon · 按用途配语义图标', () => {
  it('数据类助手 → 数据分析图标', () => {
    expect(resolveAgentIcon('a_builtin_data_agent', '数据查询分析助手')).toBe(AGENT_ICON_BY_ID.a_builtin_data_agent);
  });

  it('运维 / 安全 / 短剧 / 设计各自区别于兜底', () => {
    for (const id of ['a_builtin_ops_agent', 'a_builtin_sec_agent', 'a_builtin_storyboard_agent', 'a_builtin_design_agent']) {
      expect(resolveAgentIcon(id, 'x')).not.toBe(AGENT_FALLBACK_ICON);
    }
  });

  it('内置 id 优先于名称关键词（id 精确命中就不再看名字）', () => {
    // 名字是「代码」类，但 id 是数据助手 → 应以 id 为准
    expect(resolveAgentIcon('a_builtin_data_agent', '代码编写助手')).toBe(AGENT_ICON_BY_ID.a_builtin_data_agent);
  });
});

describe('resolveAgentIcon · 关键词优先级（顺序即优先级）', () => {
  it('「代码编写助手」命中代码图标，不被「助手」这类万能词抢走', () => {
    const codeIcon = resolveAgentIcon('', '代码编写助手');
    const officeIcon = resolveAgentIcon('', '日常办公助手');
    expect(codeIcon).not.toBe(officeIcon);
    expect(codeIcon).not.toBe(AGENT_FALLBACK_ICON);
  });

  it('★ 万能词「助手 / 助理」不进任何规则：光叫「XX助手」应走兜底', () => {
    // 回归：曾把「助手」写进办公规则，导致「代码编写助手」「小明的助手」全变办公图标
    expect(resolveAgentIcon('', '小明的助手')).toBe(AGENT_FALLBACK_ICON);
    expect(resolveAgentIcon('', '某某助理')).toBe(AGENT_FALLBACK_ICON);
  });

  it('「浏览器操作助手」命中搜索图标（早于兜底）', () => {
    expect(resolveAgentIcon('', '浏览器操作助手')).toBe(AGENT_ICON_BY_ID.a_builtin_page_agent);
  });

  it('「安全助手」命中安全图标（早于兜底）', () => {
    expect(resolveAgentIcon('', '安全助手')).toBe(AGENT_ICON_BY_ID.a_builtin_sec_agent);
  });

  it('大小学写混排也能匹配（UI / BI / Docker）', () => {
    expect(resolveAgentIcon('', 'UI 设计助手')).not.toBe(AGENT_FALLBACK_ICON);
    expect(resolveAgentIcon('', 'Docker 运维')).toBe(AGENT_ICON_BY_ID.a_builtin_ops_agent);
  });

  it('办公类用途词仍能命中（周报 / 纪要 / 公文）', () => {
    for (const n of ['周报撰写', '会议纪要整理', '公文起草']) {
      expect(resolveAgentIcon('', n)).toBe(AGENT_ICON_BY_ID.a_default_assistant);
    }
  });
});

describe('resolveAgentIcon · 兜底稳定', () => {
  it('无法判定用途的自建助手 → 通用兜底图标', () => {
    expect(resolveAgentIcon('user-123', '小明的助手')).toBe(AGENT_FALLBACK_ICON);
    expect(resolveAgentIcon('', 'zzz-unknown')).toBe(AGENT_FALLBACK_ICON);
  });

  it('id / name 都为空时也返回兜底（不抛错）', () => {
    expect(resolveAgentIcon(undefined, undefined)).toBe(AGENT_FALLBACK_ICON);
    expect(resolveAgentIcon(null, null)).toBe(AGENT_FALLBACK_ICON);
    expect(resolveAgentIcon('', '')).toBe(AGENT_FALLBACK_ICON);
  });

  it('同一输入恒返回同一图标（纯函数）', () => {
    const a = resolveAgentIcon('a_builtin_code_agent', '代码编写助手');
    const b = resolveAgentIcon('a_builtin_code_agent', '代码编写助手');
    expect(a).toBe(b);
  });
});

describe('shouldUseAgentIcon · 名称兜底场景', () => {
  it('无内置 id 但有名称 → 用图标', () => {
    expect(shouldUseAgentIcon('user-1', '我的助手')).toBe(true);
  });

  it('无内置 id 且名称为空 / 空白 → 不用图标（调用方自行渲染 ? 占位）', () => {
    expect(shouldUseAgentIcon('user-1', '')).toBe(false);
    expect(shouldUseAgentIcon('user-1', '   ')).toBe(false);
    expect(shouldUseAgentIcon(undefined, undefined)).toBe(false);
  });
});

describe('agentInitial · 首字兜底保留原语义', () => {
  it('取首 1 字，空名回 ?', () => {
    expect(agentInitial('数据查询分析助手')).toBe('数');
    expect(agentInitial('Browser Agent')).toBe('B');
    expect(agentInitial('')).toBe('?');
    expect(agentInitial(undefined)).toBe('?');
  });

  it('支持取前 N 字（Agents 页用 2 字）', () => {
    expect(agentInitial('数据查询分析助手', 2)).toBe('数据');
    expect(agentInitial('短剧流水线', 2)).toBe('短剧');
  });
});