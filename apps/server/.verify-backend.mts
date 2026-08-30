// 直接验证搜索后端修复，绕过 better-sqlite3（搜索后端只依赖 playwright + core 纯 TS）
import { getSearchBackend } from './src/mcp/search-backend.js';

async function main() {
  const backend = getSearchBackend();
  console.log('Backend type:', backend.constructor.name);

  console.log('=== Test 1: q=hello world ===');
  try {
    const results = await backend.search('hello world', 5);
    console.log('SUCCESS count=' + results.length);
    if (results[0]) {
      console.log('first title=' + results[0].title);
      console.log('first url=' + results[0].url);
      console.log('snippet len=' + results[0].snippet.length);
    }
  } catch (e) {
    console.log('FAIL: ' + (e as Error).message);
  }

  console.log('=== Test 2: q=2026 best smartphones, timeRange=year ===');
  try {
    const results = await backend.search('2026 best smartphones', 5, 'year' as any);
    console.log('SUCCESS count=' + results.length);
    if (results[0]) {
      console.log('first title=' + results[0].title);
    }
  } catch (e) {
    console.log('FAIL: ' + (e as Error).message);
  }

  console.log('=== DONE ===');
  process.exit(0);
}
main().catch((e) => { console.log('UNCAUGHT: ' + e.message); process.exit(1); });