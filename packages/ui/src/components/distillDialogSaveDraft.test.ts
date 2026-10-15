// DistillDialog「存为草稿」契约（2026-10-15，P2-12）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，见 ctxMenuIconsMarkRaw.test.ts 说明），
//   判据一律剥注释后再匹配——注释里出现同一个词会假绿。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'DistillDialog.vue'), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');
const DLG = strip(SRC);

describe('DistillDialog 存为草稿（P2-12）', () => {
  it('结果区有「存为草稿」按钮且绑到 saveDraft', () => {
    expect(DLG, '缺少存为草稿按钮').toMatch(/@click="saveDraft"/);
    expect(DLG).toMatch(/>\s*存为草稿/);
  });

  it('saveDraft 落草稿走 distillStore.saveMdAsDraft（不进 Skill 商店）', () => {
    expect(DLG).toMatch(/distillStore\.saveMdAsDraft\(/);
  });

  it('saveDraft 不误调 saveMdAsSkill（那是「保存到 Skill 商店」的语义）', () => {
    const fn = DLG.match(/async function saveDraft\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 saveDraft 函数体').toBeTruthy();
    expect(fn![0]).not.toMatch(/saveMdAsSkill/);
  });

  it('图标真的从 element-plus 图标包 import 了（漏 import = 运行时组件未注册）', () => {
    expect(DLG).toMatch(/import\s*\{[^}]*\bDocumentAdd\b[^}]*\}\s*from\s*'@element-plus\/icons-vue'/);
  });

  it('★ 弹窗保持「一键直通」的轻量：不引入概览阶段', () => {
    // P2-12 明确要求：概览表单只在「Skill 蒸馏」页（SkillDistill.vue），不搬进聊天弹窗
    expect(DLG).not.toMatch(/generateOverview|distillFromOverview|overviewFromMd|技能概览/);
  });
});
