/**
 * 小说推文 skill seed 防漂移测试 —— 钉住 2026-10-05 踩过坑的关键锚点。
 *
 * 背景：agent 曾把书详情 URL 自行裁剪成裸 book_id（缺 tab_type/top_tab_genre/genre），
 * 正文区永远「加载中...」，4 轮复验误判为「达人中心没有正文」。
 * 这里用静态断言（读源码剥注释，同 task-plan-file.test.ts 手法）钉死：
 *   1. 双端 seed 的书详情 URL 必须带全三个参数（缺一即回归）
 *   2. 「加载中」排障锚点存在
 *   3. DOM 速查存在（arco 体系关键选择器 + 回填抽屉「取消提交」要点）
 *   4. 回填时效规则（14 天失效）存在
 *   5. pageAgent / 小说推文主智能体步数 200（50 会把正常抓正文打满）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// 相对路径在本机 fs shim 下 cwd 不稳定，一律用测试文件自身位置锚定
const HERE = dirname(fileURLToPath(import.meta.url)); // apps/server/test

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CORE_SCHEMA = () => readFileSync('../../packages/core/src/db/schema.ts', 'utf-8');
const SERVER_DB = () => readFileSync(resolve(HERE, '../src/db.ts'), 'utf-8');
const AGENTS = () => strip(readFileSync(resolve(HERE, '../src/builtin-task-mode-agents.ts'), 'utf-8'));

const FULL_URL = 'book-detail?tab_type=2&top_tab_genre=-1&book_id=<id>&genre=0';

describe('novel-tuiwen skill seed 关键锚点（防漂移）', () => {
  it('core/server 双端 seed 的书详情 URL 都带全参数（tab_type/top_tab_genre/genre）', () => {
    for (const [name, src] of [['core/schema.ts', CORE_SCHEMA()], ['server/db.ts', SERVER_DB()]] as const) {
      expect(src, name).toContain(FULL_URL);
      // 旧写法（裸 book_id 或 ... 省略号形式）不得再出现
      expect(src, name).not.toContain('book-detail?...&book_id');
      expect(src, name).not.toContain('book-detail?book_id=');
    }
  });

  it('「加载中」排障锚点存在（缺参症状 ↔ 补全参数即恢复）', () => {
    for (const [name, src] of [['core/schema.ts', CORE_SCHEMA()], ['server/db.ts', SERVER_DB()]] as const) {
      expect(src, name).toContain('加载中');
    }
    expect(AGENTS()).toContain('加载中');
  });

  it('DOM 速查存在：arco 菜单/按钮/输入/抽屉 + 回填抽屉「取消提交」要点', () => {
    for (const [name, src] of [['core/schema.ts', CORE_SCHEMA()], ['server/db.ts', SERVER_DB()], ['agents', AGENTS()]] as const) {
      expect(src, name).toContain('arco-menu-inline-header');
      expect(src, name).toContain('arco-btn');
      expect(src, name).toContain('arco-input');
      expect(src, name).toContain('arco-drawer');
      expect(src, name).toContain('取消提交');
    }
  });

  it('回填时效规则（新别名 14 天内不回填会失效）存在', () => {
    // ★ 2026-10-08 同步：官方口径为 **14 天**（此前项目误记为 7 天，已在 SKILL 内更正）。
    //   断言仍钉住「有明确时效数字」，只把 7 改成 14。
    for (const [name, src] of [['core/schema.ts', CORE_SCHEMA()], ['server/db.ts', SERVER_DB()], ['agents', AGENTS()]] as const) {
      expect(src, name).toMatch(/14\s*天内不回填/);
      expect(src, name, '旧口径（7 天）不得再出现').not.toMatch(/7\s*天内不回填/);
    }
  });

  it('步数配置：pageAgent=200、小说推文主智能体=200（50 会腰斩正常抓正文）', () => {
    expect(SERVER_DB()).toContain("id: 'a_builtin_page_agent'");
    expect(SERVER_DB()).toMatch(/maxReActSteps: 200/);
    expect(AGENTS()).toMatch(/NOVEL_TUIWEN_AGENT_ID,[\s\S]{0,600}maxReActSteps: 200/);
    // 旧的 50 配置不得回到这两个 agent 上
    const dbSrc = SERVER_DB();
    const pageBlock = dbSrc.slice(dbSrc.indexOf("id: 'a_builtin_page_agent'"), dbSrc.indexOf("id: 'a_builtin_page_agent'") + 800);
    expect(pageBlock).not.toMatch(/maxReActSteps: 50\b/);
    const agSrc = AGENTS();
    const novelBlock = agSrc.slice(agSrc.indexOf('id: NOVEL_TUIWEN_AGENT_ID'), agSrc.indexOf('id: NOVEL_TUIWEN_AGENT_ID') + 900);
    expect(novelBlock).not.toMatch(/maxReActSteps: 50\b/);
  });
});
