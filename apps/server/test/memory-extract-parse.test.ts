/**
 * parseExtractedItems —— 抽取类 LLM 输出的 JSON 解析（2026-10-14 实报回归）。
 *
 * ★ 修的是什么：记忆抽取会**静默丢数据**，日志只留一行「模型输出无法解析为条目」。
 *   取回当时原始输出，两条已知成因：
 *   ① **Windows 路径漏转义反斜杠**（`"…C:\Users\yhfys\…"`）→ JSON 字符串里的 `\U` 是非法
 *      转义 → `JSON.parse` 必抛，而"抠数组再 parse"的兜底抠的是同一份非法 JSON，一起抛；
 *   ② 包装键只认 `items`，模型回 `{"facts":[…]}` 时 0 条（条目多时 800 maxTokens 截断亦同果）。
 *   本测试把两条成因都钉住，并守住"宽容修复不得误伤合法 JSON"这条底线。
 */
import { describe, it, expect } from 'vitest';
import { parseExtractedItems } from '../src/services/memory-service.js';

const BS = String.fromCharCode(92); // 单个反斜杠，避免转义地狱

describe('parseExtractedItems 抽取输出解析', () => {
  it('基线：纯数组', () => {
    const r = parseExtractedItems('[{"type":"agent","content":"用户用 Windows"}]');
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe('用户用 Windows');
  });

  it('既有行为：{"items":[…]} 包装对象', () => {
    const r = parseExtractedItems('{"items":[{"type":"daily","content":"A"},{"type":"daily","content":"B"}]}');
    expect(r.map((x) => x.content)).toEqual(['A', 'B']);
  });

  it('既有行为：单对象 {"type","content"}（json_object 模式下模型常这么回）', () => {
    const r = parseExtractedItems('{"type":"session","content":"本会话结论"}');
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe('本会话结论');
  });

  it('★ 成因①：Windows 路径漏转义反斜杠的非法 JSON 也能解析出来', () => {
    // ★ 真实失败样本形态（2026-10-14 16:02:36 服务端日志）——把日志里那段原样搬来
    const realBad =
      '{"facts":[{"type":"agent","content":"用户运营抖音小说推文账号，项目根目录 C:'
      + `${BS}Users${BS}yhfys${BS}Desktop${BS}小说推文${BS}第一本"}]}`;
    // 先证明这份输入**确实是非法 JSON**（否则本测试是空转）
    expect(() => JSON.parse(realBad), '样本必须是非法 JSON，否则测不到点子上').toThrow();
    const r = parseExtractedItems(realBad);
    expect(r, '★ 旧实现丢成 0 条 —— 本次记忆就是这么没的').toHaveLength(1);
    expect(r[0].type).toBe('agent');
    // 路径内容必须原样保留（路径一改就不可恢复）
    expect(r[0].content).toContain(`C:${BS}Users${BS}yhfys`);
  });

  it('★ 成因②：{"facts":[…]} 包装键（此前只认 items，被静默丢成 0 条）', () => {
    const r = parseExtractedItems('{"facts":[{"type":"agent","content":"用户运营抖音账号"}]}');
    expect(r, '★ 旧实现丢成 0 条').toHaveLength(1);
    expect(r[0].content).toBe('用户运营抖音账号');
  });

  it('★ 底线：宽容修复**不得**误伤合法 JSON（合法的反斜杠转义必须保持原语义）', () => {
    // 合法 JSON：content 里是「字面反斜杠+n」与一个真正的换行转义
    const ok = '[{"type":"daily","content":"a\\\\nb 字面反斜杠与 \\n 换行"}]';
    const r = parseExtractedItems(ok);
    expect(r).toHaveLength(1);
    // 若把"修复"无条件套上去，这里会变成两个反斜杠 —— 本断言就是防它
    expect(r[0].content).toBe('a\\nb 字面反斜杠与 \n 换行');
  });

  it('空 / 垃圾输入返回空数组，不抛', () => {
    for (const bad of ['', '   ', '抱歉，我无法完成', '{"a":1}', 'null', '{坏了']) {
      expect(parseExtractedItems(bad), `输入 ${JSON.stringify(bad)}`).toEqual([]);
    }
  });

  it('截断的 JSON（maxTokens 截断形态）返回空数组而非抛出', () => {
    // 截断是另一条已知丢数据路径：解析器不该崩，但调用方须留 WARN（已改，见 llm-task-manager）
    const truncated = '[{"type":"agent","content":"用户运营抖音小说推文账号，主要作品线为悬疑/民间故事题材（如「骨债阴阳」「';
    expect(() => parseExtractedItems(truncated)).not.toThrow();
    expect(parseExtractedItems(truncated)).toEqual([]);
  });
});
