/**
 * 模式切换提示（four-mode 2b.5）守门：
 *  ① 服务端只把切换信息追加进**系统提示词**，不伪造用户消息；
 *  ② WS 与 HTTP 两条建任务路径都透传 modeSwitch（不能只修一条）；
 *  ③ 标签做长度/换行收敛，防止任意文本被当指令注入。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = (f: string) => readFileSync(resolve(__dirname, '..', 'src', f), 'utf8');

describe('模式切换提示注入', () => {
  it('系统提示词追加「模式切换」段，且说明历史消息是上下文', () => {
    const src = SRC('llm-task-manager.ts');
    expect(src).toContain('## 模式切换');
    expect(src).toContain('用户已从「');
    expect(src).toContain('不要让用户重复提供');
  });

  it('标签收敛：去换行 + 截断到 24 字', () => {
    const src = SRC('llm-task-manager.ts');
    expect(src).toMatch(/replace\(\/\[\\r\\n\]\+\/g, ' '\)/);
    expect(src).toContain('.slice(0, 24)');
  });

  it('WS 与 HTTP 两条建任务路径都透传 modeSwitch', () => {
    expect(SRC('chat-ws.ts')).toContain('modeSwitch: payload.modeSwitch');
    expect(SRC('routes/llm-tasks.ts')).toContain('modeSwitch');
  });

  it('HTTP 入口白名单化：只接受 from/to 字符串', () => {
    const src = SRC('routes/llm-tasks.ts');
    expect(src).toContain("typeof modeSwitch.from === 'string'");
    expect(src).toContain("typeof modeSwitch.to === 'string'");
  });
});
