// 产物目录「会话 id 主规则」单测（2026-09-15 方案 A 落地）。
//
// 背景：旧命名 <YYYY-MM-DD>-<会话标题> 每次按「会话当前标题」重算 ——
// 改名后此前产物全部 404 且磁盘留孤儿；同日同标题会话共用目录互相串文件。
// 主规则改为 .yan-zhi/tasks/<conversationId>/<category>/，本文件钉死：
//   1. id 目录优先、与标题完全解耦（改名后目录不变）
//   2. 旧「日期-标题」目录只作读取回退，新写入永不落回旧目录
//   3. 无会话上下文（conversationId 缺失）时仍可归档，不散落
import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_ROOT_NAME,
  ARTIFACT_TASKS_DIR,
  ARTIFACT_CATEGORY_DIRS,
  buildArtifactRelDir,
  buildArtifactRelDirCandidates,
  joinArtifactPath,
} from '@yan-zhi/shared';

const TS = new Date(2026, 8, 15, 15, 7, 6).getTime();
const CID = 'e824e62a-e446-449b-bad8-62e86c71f510';

describe('buildArtifactRelDir 会话 id 主规则', () => {
  it('有 conversationId 时目录名就是会话 id 本身', () => {
    expect(buildArtifactRelDir({ conversationId: CID, title: '运维控制台', createdAt: TS, category: 'deliverable' })).toBe(
      `.yan-zhi/${ARTIFACT_TASKS_DIR}/${CID}/${ARTIFACT_CATEGORY_DIRS.deliverable}`,
    );
  });

  it('与会话标题完全解耦：改名前后解析到同一目录（回归：改名 404）', () => {
    const before = buildArtifactRelDir({ conversationId: CID, title: '运维控制台', createdAt: TS, category: 'deliverable' });
    const after = buildArtifactRelDir({ conversationId: CID, title: '运维平台 V2', createdAt: TS, category: 'deliverable' });
    expect(before).toBe(after);
  });

  it('与会话标题为空解耦：标题缺失不影响 id 目录', () => {
    expect(buildArtifactRelDir({ conversationId: CID, title: '', createdAt: TS, category: 'deliverable' })).toBe(
      `.yan-zhi/${ARTIFACT_TASKS_DIR}/${CID}/${ARTIFACT_CATEGORY_DIRS.deliverable}`,
    );
  });

  it('同日同标题的不同会话各归各目录（回归：目录串档）', () => {
    const a = buildArtifactRelDir({ conversationId: 'aaaa1111', title: '分析行业', createdAt: TS, category: 'intermediate' });
    const b = buildArtifactRelDir({ conversationId: 'bbbb2222', title: '分析行业', createdAt: TS, category: 'intermediate' });
    expect(a).not.toBe(b);
    expect(a).toContain('aaaa1111');
    expect(b).toContain('bbbb2222');
  });

  it('conversationId 为空白串视为无会话，退回旧命名（可归档兜底）', () => {
    const rel = buildArtifactRelDir({ conversationId: '   ', title: '临时任务', createdAt: TS, category: 'upload' });
    expect(rel).toBe(`.yan-zhi/${ARTIFACT_TASKS_DIR}/2026-09-15-临时任务/${ARTIFACT_CATEGORY_DIRS.upload}`);
  });

  it('无 conversationId 时维持旧命名（日期-标题），历史行为不变', () => {
    expect(buildArtifactRelDir({ title: '销售报表', createdAt: TS, category: 'deliverable' })).toBe(
      `.yan-zhi/${ARTIFACT_TASKS_DIR}/2026-09-15-销售报表/${ARTIFACT_CATEGORY_DIRS.deliverable}`,
    );
  });
});

describe('buildArtifactRelDirCandidates 读取侧候选', () => {
  it('首候选永远是会话 id 主目录', () => {
    const [first] = buildArtifactRelDirCandidates({ conversationId: CID, title: '运维控制台', createdAt: TS, category: 'deliverable' });
    expect(first).toBe(`.yan-zhi/${ARTIFACT_TASKS_DIR}/${CID}/${ARTIFACT_CATEGORY_DIRS.deliverable}`);
  });

  it('默认给两个候选：id 目录 + 旧日期目录（历史产物零搬运可读）', () => {
    const cands = buildArtifactRelDirCandidates({ conversationId: CID, title: '运维控制台', createdAt: TS, category: 'deliverable' });
    expect(cands).toHaveLength(2);
    expect(cands[1]).toBe(`.yan-zhi/${ARTIFACT_TASKS_DIR}/2026-09-15-运维控制台/${ARTIFACT_CATEGORY_DIRS.deliverable}`);
  });

  it('磁盘上旧目录不存在时（hasLegacyDir=false）不给回退候选', () => {
    const cands = buildArtifactRelDirCandidates({ conversationId: CID, title: '运维控制台', createdAt: TS, category: 'deliverable', hasLegacyDir: false });
    expect(cands).toHaveLength(1);
    expect(cands[0]).toContain(CID);
  });

  it('无会话上下文时只有一个候选（新旧规则同目录，不重复探测）', () => {
    const cands = buildArtifactRelDirCandidates({ title: '临时任务', createdAt: TS, category: 'upload' });
    expect(cands).toHaveLength(1);
    expect(cands[0]).toContain('2026-09-15-临时任务');
  });

  it('候选顺序：id 目录在前，旧目录在后（新写入优先命中主目录）', () => {
    const cands = buildArtifactRelDirCandidates({ conversationId: CID, title: 't', createdAt: TS, category: 'intermediate' });
    expect(cands[0].indexOf(CID)).toBeGreaterThan(-1);
    expect(cands[1].indexOf(CID)).toBe(-1);
  });
});

describe('joinArtifactPath 与 id 目录配合', () => {
  it('会话 id 作为目录段拼接无损（uuid 含连字符不产生额外分隔）', () => {
    const dir = joinArtifactPath('D:\\ws', `.yan-zhi/tasks/${CID}/deliverables`);
    expect(dir).toBe(`D:\\ws/.yan-zhi/tasks/${CID}/deliverables`);
  });

  it('根为空时返回相对 id 目录（数据根缺失降级）', () => {
    expect(joinArtifactPath('', `${ARTIFACT_ROOT_NAME}/tasks/${CID}/uploads`)).toBe(
      `${ARTIFACT_ROOT_NAME}/tasks/${CID}/uploads`,
    );
  });
});
