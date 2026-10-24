/**
 * 真实表单页冒烟（手动执行，不进 CI）
 *
 *   node scripts/real-form-smoke.cjs
 *
 * 起真 Chromium、加载真表单页（文本框/文本域/级联下拉/三个原生复选/自定义下拉/校验），跑：
 *   ① checkbox 护栏（从 main.cjs 哨兵块抽出的真代码）
 *   ② 提交后页面判定（同上）
 *   ③ form-fill 通用配方（真 runRecipe；需先 bundle 配方模块，见文件底部说明）
 *
 * 为什么不写成 vitest：Playwright 在 vitest 里 launch 会挂住（本机实测），
 * 独立 node 进程正常。配方模块是 TS，用 esbuild 现打一份 cjs 再用。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..', '..');
const MAIN = fs.readFileSync(path.join(REPO, 'apps', 'desktop', 'main.cjs'), 'utf8');
const BUNDLE = process.env.RECIPES_BUNDLE || path.join(__dirname, '.recipes.bundle.cjs');

function cut(startMarker, endMarker) {
  const s = MAIN.indexOf(startMarker);
  const e = MAIN.indexOf(endMarker);
  if (s < 0 || e <= s) throw new Error(`哨兵缺失：${startMarker}`);
  return MAIN.slice(s, e);
}

const CHECKBOX_BLOCK = cut('// ===CHECKBOX-GUARD-START===', '// ===CHECKBOX-GUARD-END===');
const VERDICT_BLOCK = cut('// ===SUBMIT-VERDICT-START===', '// ===SUBMIT-VERDICT-END===');

const FORM_HTML = `<!doctype html><html><body>
  <form onsubmit="return false">
    <input id="name" placeholder="姓名" />
    <textarea id="remark" placeholder="备注"></textarea>
    <select id="province"><option value="">请选择</option><option value="zj">浙江</option><option value="js">江苏</option></select>
    <select id="city"><option value="">请选择</option></select>
    <label><input type="checkbox" id="cb1" aria-label="同意协议">同意协议</label>
    <label><input type="checkbox" id="cb2" aria-label="订阅通知">订阅通知</label>
    <label><input type="checkbox" id="cb3" aria-label="记住我">记住我</label>
    <div role="combobox" id="fake">自定义下拉</div>
    <button type="button" id="save">保存</button>
    <div id="msg"></div>
  </form>
  <script>
    document.getElementById('province').addEventListener('change', function () {
      var city = document.getElementById('city');
      city.innerHTML = this.value === 'zj' ? '<option value="hz">杭州</option><option value="nb">宁波</option>'
        : this.value === 'js' ? '<option value="nj">南京</option>' : '<option value="">请选择</option>';
    });
    document.getElementById('save').addEventListener('click', function () {
      var name = document.getElementById('name').value.trim();
      document.getElementById('msg').textContent = name ? '保存成功' : '请填写姓名后保存';
    });
  </script>
</body></html>`;

function makeApi(page) {
  return {
    navigate: async (url) => { await page.goto(url); return {}; },
    action: async (name, args) => {
      if (name === 'fill_form') {
        const failed = [], state = [], deferred = [], skipped = [];
        for (const f of args.fields || []) {
          try {
            const loc = page.locator(f.selector).first();
            if ((await loc.count()) === 0) { failed.push({ selector: f.selector, reason: '元素未找到' }); continue; }
            if (f.type === 'checkbox' || f.type === 'radio') {
              if (String(f.value) === 'true') await loc.check(); else await loc.uncheck();
              state.push({ selector: f.selector, value: (await loc.isChecked()) ? 'true' : 'false' });
            } else if (f.type === 'select' || f.label !== undefined) {
              try { await loc.selectOption(f.label !== undefined ? { label: String(f.label) } : String(f.value)); }
              catch (e) { deferred.push({ selector: f.selector, reason: String(e.message).slice(0, 60) }); continue; }
              state.push({ selector: f.selector, value: await loc.inputValue() });
            } else {
              await loc.fill(String(f.value));
              state.push({ selector: f.selector, value: await loc.inputValue() });
            }
          } catch (e) {
            failed.push({ selector: f.selector, reason: String(e.message).slice(0, 80) });
          }
        }
        return { filled: state.length, fields: state.map((s) => s.selector), failed, deferred, skipped, state };
      }
      if (name === 'click') {
        const sel = String(args.selector || '').replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")');
        const loc = page.locator(sel).first();
        if ((await loc.count()) === 0) return { error: '元素未找到' };
        await loc.click();
        return { status: 'ok' };
      }
      if (name === 'get_visible_text') return { text: await page.innerText('body') };
      if (name === 'get_page_content') return { text: '', url: page.url(), title: await page.title() };
      return {};
    },
  };
}

function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

(async () => {
  if (!fs.existsSync(BUNDLE)) {
    console.error('缺少配方 bundle，请先执行（仓库根目录）：\n' +
      '  npx esbuild packages/core/src/tool/builtin/browser/recipes.ts --bundle --format=cjs ' +
      '--platform=node --outfile=apps/server/scripts/.recipes.bundle.cjs');
    process.exit(1);
  }
  const { runRecipe, FORM_FILL_RECIPE } = require(BUNDLE);
  const exe = process.env.CHROME_PATH
    || 'C:/Users/yhfys/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe';
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(exe) ? exe : undefined,
    timeout: 30000,
  });
  const page = await browser.newPage();
  try {
    await page.setContent(FORM_HTML);

    // ① checkbox 护栏
    const guard = await page.evaluate(`(() => { ${CHECKBOX_BLOCK}
      window.__yzElements = Array.from(document.querySelectorAll('input[type=checkbox]'));
      return nativeCheckboxGuard(window.__yzElements[0], 'index 0');
    })()`);
    check('checkbox 护栏拒绝原生 checkbox', guard && guard.status === 'rejected');
    check('护栏回传整页候选（3 个）', guard && guard.candidates && guard.candidates.length === 3);
    check('候选带标签', guard && guard.candidates && guard.candidates[0].label === '同意协议',
      guard && guard.candidates ? JSON.stringify(guard.candidates[0]) : '');

    // ② 校验提示
    await page.click('#save');
    const bad = await page.evaluate(`(() => { ${VERDICT_BLOCK}
      return yzSubmitVerdict();
    })()`);
    check('姓名为空时判出校验提示', bad && bad.validText === '请填写', bad && bad.validText);
    check('校验场景不谎报成功', bad && bad.successText === '');

    // ③ 成功提示
    await page.fill('#name', '张三');
    await page.click('#save');
    const good = await page.evaluate(`(() => { ${VERDICT_BLOCK}
      return yzSubmitVerdict();
    })()`);
    check('填对后判出成功提示', good && good.successText === '保存成功', good && good.successText);

    // ④ 通用配方：文本 / 下拉（按 label）/ 复选 + 级联 + 提交
    await page.fill('#name', '');
    await page.evaluate(() => { document.getElementById('msg').textContent = ''; });
    await page.selectOption('#province', 'zj');   // 触发真实级联，城市选项才出现
    const fields = [
      { selector: '#name', value: '李四' },
      { selector: '#remark', value: '备注内容' },
      { selector: '#province', label: '浙江', type: 'select' },
      { selector: '#city', label: '宁波', type: 'select' },
      { selector: '#cb1', value: 'true', type: 'checkbox' },
      { selector: '#cb3', value: 'true', type: 'checkbox' },
    ];
    const r = await runRecipe(
      FORM_FILL_RECIPE,
      { fields: JSON.stringify(fields), submit: true, submitText: '保存' },
      makeApi(page),
    );
    check('form-fill 配方整体成功', r.ok, r.error || '');
    if (!r.ok) console.log(JSON.stringify(r.steps, null, 2));
    check('文本框写入', (await page.inputValue('#name')) === '李四');
    check('文本域写入', (await page.inputValue('#remark')) === '备注内容');
    check('级联下拉按 label 选中', (await page.inputValue('#city')) === 'nb');
    check('复选框勾选', (await page.isChecked('#cb1')) && (await page.isChecked('#cb3')));
    check('未勾选的保持未勾选', !(await page.isChecked('#cb2')));
    check('配方填完点了保存', (await page.innerText('#msg')) === '保存成功', await page.innerText('#msg'));
  } finally {
    await browser.close();
  }
  console.log(process.exitCode ? '\n有失败项' : '\n全部通过');
})().catch((e) => {
  console.error('SMOKE ERROR', e && e.message);
  process.exit(1);
});
