/**
 * 四模式收尾（openspec 5h / 8b.1-8b.2 / 11.6）源码契约。
 *
 * 守护：
 *   ① 18 条岗位 skill（运维/安全/办公各 6）都在 builtinSkillDefaults + body 刷新白名单；
 *   ② 运维/安全助手 seed 挂上各自 6 条 skill；默认助理挂办公 6 条；
 *   ③ 智能体 config_json.mode 映射覆盖四模式；
 *   ④ 「云白」是 kind='palette' 的无壁纸皮肤。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DB = readFileSync(resolve(__dirname, '../src/db.ts'), 'utf8');
const SKINS = readFileSync(resolve(__dirname, '../src/plugins/skins.ts'), 'utf8');

const OPS = ['skill_ops_health_check', 'skill_ops_log_analysis', 'skill_ops_docker_ops', 'skill_ops_db_maintain', 'skill_ops_deploy_release', 'skill_ops_incident_response'];
const SEC = ['skill_sec_recon', 'skill_sec_web_probe', 'skill_sec_report', 'skill_sec_audit_review', 'skill_sec_hardening', 'skill_sec_blue_team'];
const OFFICE = ['skill_office_finance', 'skill_office_hr', 'skill_office_operation', 'skill_office_legal', 'skill_office_data_report', 'skill_office_service'];

describe('5h · 18 条岗位 skill', () => {
  it('每条都定义在 builtinSkillDefaults 里', () => {
    for (const id of [...OPS, ...SEC, ...OFFICE]) {
      expect(DB, `缺少 skill 定义: ${id}`).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('★ 全部进 body 刷新白名单（老库才能拿到新内容）', () => {
    const block = DB.match(/const SKILL_BODY_REFRESH_IDS = \[[\s\S]*?\];/);
    expect(block, '找不到 SKILL_BODY_REFRESH_IDS').toBeTruthy();
    for (const id of [...OPS, ...SEC, ...OFFICE]) {
      expect(block![0]).toContain(`'${id}'`);
    }
  });

  it('安全类 body 写明授权范围/确认；法务财务带免责声明', () => {
    for (const id of SEC) {
      const idx = DB.indexOf(`id: '${id}'`);
      expect(idx).toBeGreaterThan(0);
      const slice = DB.slice(idx, idx + 1600);
      expect(slice).toMatch(/授权/);
    }
    expect(DB.slice(DB.indexOf("id: 'skill_office_legal'"), DB.indexOf("id: 'skill_office_legal'") + 600)).toMatch(/不构成法律意见/);
    expect(DB.slice(DB.indexOf("id: 'skill_office_finance'"), DB.indexOf("id: 'skill_office_finance'") + 600)).toMatch(/不构成审计/);
  });
});

describe('5h.5–5h.7 · 智能体挂载', () => {
  it('运维/安全/默认助手分别挂上岗位 skill', () => {
    expect(DB).toMatch(/const OPS_AGENT_SKILL_IDS = \[[\s\S]*?skill_ops_incident_response/);
    expect(DB).toMatch(/const SEC_AGENT_SKILL_IDS = \[[\s\S]*?skill_sec_blue_team/);
    expect(DB).toMatch(/const DEFAULT_AGENT_SKILL_IDS = \[[\s\S]*?skill_office_service/);
    // seed 里把常量挂上去（force_sync 会覆盖旧库）
    expect(DB).toMatch(/builtin_tool_ids: JSON\.stringify\(OPS_AGENT_BUILTIN_TOOLS\),\s*skill_ids: JSON\.stringify\(OPS_AGENT_SKILL_IDS\)/);
    expect(DB).toMatch(/builtin_tool_ids: JSON\.stringify\(SEC_AGENT_BUILTIN_TOOLS\),\s*skill_ids: JSON\.stringify\(SEC_AGENT_SKILL_IDS\)/);
    expect(DB).toMatch(/skill_ids: JSON\.stringify\(DEFAULT_AGENT_SKILL_IDS\)/);
  });
});

describe('8b.1–8b.2 · 智能体模式归属', () => {
  it('四模式映射写入 config_json.mode（不新增列）', () => {
    expect(DB).toContain("a_builtin_ops_agent: 'ops'");
    expect(DB).toContain("a_builtin_cicd_agent: 'ops'");
    expect(DB).toContain("a_builtin_sec_agent: 'sec'");
    expect(DB).toContain("a_builtin_code_agent: 'dev'");
    expect(DB).toContain("a_builtin_page_agent: 'dev'");
    expect(DB).toContain("a_default_assistant: 'office'");
    expect(DB).toMatch(/mergeAgentMode\(row\.id, 'workflow'\)/);
    expect(DB).not.toMatch(/ALTER TABLE agent ADD COLUMN mode TEXT/);
  });
});

describe('11.6 · 云白皮肤', () => {
  it('kind=palette、无 wallpaper、配色与 tokens 一致', () => {
    const idx = SKINS.indexOf("id: 'skin-cloud-white'");
    expect(idx).toBeGreaterThan(0);
    const slice = SKINS.slice(idx, idx + 1200);
    expect(slice).toContain("kind: 'palette'");
    expect(slice).not.toContain('wallpaper');
    expect(slice).toContain("primary: '#4F46E5'");
    expect(slice).toContain("accent: '#7C5CFC'");
  });
});
