// 决定性实验：用**安装版/本地编译产物**对真实生产库会话跑发送前清洗，
// 判断存量坏历史（老会话里落库的空参）是否仍在污染模型上下文。
//
// 用法: node tools/exp-legacy-context.cjs
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'apps', 'server', 'dist', 'packages', 'core', 'src');

const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', '_conv_hist.json'), 'utf8'));

function isEmptyArgs(s) {
  return String(s ?? '').trim() === '' || String(s ?? '').trim() === '{}' || s === 'null';
}

(async () => {
  const mod = await import(pathToFileURL(path.join(CORE, 'llm', 'client.js')).href);
  const LlmClient = mod.LlmClient;
  if (!LlmClient) throw new Error('LlmClient 未导出');
  const client = new LlmClient({ id: 'p', apiUrl: 'http://x' }, { modelId: 'm' });

  // 内部 Message 形态（toolCalls / toolCallId）—— 模拟后端从库里读出来
  const toInternal = (m) =>
    m.role === 'assistant' && m.tool_calls
      ? {
          role: 'assistant',
          content: m.content,
          toolCalls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            toolName: tc.function?.name,
            arguments: tc.function?.arguments,
          })),
        }
      : m.role === 'tool'
        ? { role: 'tool', content: m.content, toolCallId: m.tool_call_id }
        : { role: m.role, content: m.content };

  console.log('=== 用编译产物跑真实坏历史（发送前清洗）===\n');
  for (const [cid, raw] of Object.entries(hist)) {
    // 统计原始库里的空参
    let rawCalls = 0, rawEmpty = 0;
    for (const m of raw) {
      for (const tc of m.tool_calls || []) {
        rawCalls++;
        if (isEmptyArgs(tc.function?.arguments)) rawEmpty++;
      }
    }

    const internal = raw.map(toInternal);
    // 走真实链路
    const mapped = internal.map((m) => client.toApiMessage(m));
    const sent = client.sanitizeToolMessages(mapped, true);

    let sentCalls = 0, sentEmpty = 0, sentEmptySamples = [];
    for (const m of sent) {
      for (const tc of m.tool_calls || []) {
        sentCalls++;
        if (isEmptyArgs(tc.function?.arguments)) {
          sentEmpty++;
          if (sentEmptySamples.length < 3)
            sentEmptySamples.push(`${tc.function?.name} ${tc.function?.arguments}`);
        }
      }
    }
    console.log(`会话 ${cid}:`);
    console.log(`  库内       : 调用 ${rawCalls}  空参 ${rawEmpty} (${pct(rawEmpty, rawCalls)})`);
    console.log(`  发送前清洗后: 调用 ${sentCalls}  空参 ${sentEmpty} (${pct(sentEmpty, sentCalls)})`);
    if (sentEmptySamples.length) console.log(`  残留样本   : ${sentEmptySamples.join(' | ')}`);
    console.log('');
  }
})();

function pct(a, b) {
  return b === 0 ? 'n/a' : ((a / b) * 100).toFixed(1) + '%';
}