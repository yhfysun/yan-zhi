/**
 * ChatTopbar 工作目录标签守门测试（2026-10-23）。
 *
 * 背景（真踩）：欢迎页已有「工作目录」一行，但它只存在于**空会话**——
 *   一开始干活（或从顶栏开新任务）这行就消失，用户实报「新任务也要有」。
 *   现在顶栏常驻一个可点的目录标签，跟随整个任务生命周期。
 *
 * ★ 本测试钉：
 *   ① 顶栏确实渲染工作目录（folder 图标 + 路径 + 点击换目录）；
 *   ② 未设置时不显示 useChat 的 `'workspace'` 兜底值（那会让人以为真选了目录）；
 *   ③ 目录三件套必须来自 useChat —— 店铺模式按会话所属空间取目录，
 *      自己用 settings.workspaceDir 另算一份就会显示错的目录。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/components → 上溯四级到仓库根
const REPO = resolve(__dirname, '..', '..', '..', '..');
const RAW = readFileSync(resolve(REPO, 'packages/ui/src/components/chat/ChatTopbar.vue'), 'utf8');

const TEMPLATE = RAW.slice(RAW.indexOf('<template>'), RAW.lastIndexOf('</template>') + 11);
const SCRIPT = RAW.slice(RAW.lastIndexOf('</template>') + 11);

describe('ChatTopbar 工作目录标签', () => {
  it('模板渲染工作目录标签，点击打开目录选择对话框', () => {
    expect(TEMPLATE, '缺工作目录标签').toContain('conv-dir-chip');
    expect(TEMPLATE).toContain('workspaceDir');
    expect(TEMPLATE, '点击没接到目录对话框').toContain('@click="showWorkspaceDir = true"');
    expect(TEMPLATE, '缺整条路径的悬停提示').toContain(':title=');
  });

  it('未设置时给可读兜底，不把 "workspace" 假目录当成已选', () => {
    expect(TEMPLATE).toMatch(/hasWorkspaceDir\s*\?\s*workspaceDir\s*:\s*'未设置工作目录'/);
    expect(TEMPLATE, '未设置态必须有虚线边框区分').toContain("'is-empty': !hasWorkspaceDir");
  });

  it('目录三件套取自 useChat（店铺模式按空间目录，不能自己另算）', () => {
    expect(SCRIPT).toMatch(/workspaceDir,\s*hasWorkspaceDir,\s*showWorkspaceDir/);
    expect(SCRIPT, '★ 又出现本地自算的 hasWorkspaceDir（会与店铺模式口径打架）')
      .not.toMatch(/const\s+hasWorkspaceDir\s*=/);
  });
});
