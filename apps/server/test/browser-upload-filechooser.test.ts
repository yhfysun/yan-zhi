import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * browser_upload「真 filechooser 拦截」防回归测试。
 *
 * 背景（真实故障）：桌面端上传本地文件到抖音创作者平台时失败，报「文件注入的 CDP 节点解析」类错误。
 * 根因：apps/desktop/main.cjs 的 case 'upload' 所谓「filechooser 模式」是**假**的——
 * 只 click 上传按钮 → 死等 800ms → 再 DOM.querySelectorAll('input[type=file]') 找节点。
 * 但抖音这类站点点按钮后弹出的是**原生系统文件框**，页面上根本不出现 input[type=file] 节点，
 * 且从未调用 Page.setInterceptFileChooserDialog，于是必然失败。
 *
 * 修法：在 CDP 层 Page.setInterceptFileChooserDialog(true) + 监听 Page.fileChooserOpened，
 * 拿 backendNodeId 后 DOM.setFileInputFiles 投递文件。
 * 这些断言钉住该实现不被退回「只 querySelectorAll 找 input」的旧写法。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const mainPath = path.join(REPO_ROOT, 'apps/desktop/main.cjs');
const coreBrowserToolPath = path.join(REPO_ROOT, 'packages/core/src/tool/builtin/browser/index.ts');

const main = fs.readFileSync(mainPath, 'utf8');
const coreTool = fs.readFileSync(coreBrowserToolPath, 'utf8');

describe('browser_upload filechooser 实现（桌面端 main.cjs）', () => {
  it('使用 CDP 拦截文件选择器（而不是只 querySelectorAll 找 input）', () => {
    expect(main).toContain('Page.setInterceptFileChooserDialog');
    expect(main).toContain('Page.fileChooserOpened');
    expect(main).toContain('backendNodeId');
    expect(main).toContain('DOM.setFileInputFiles');
  });

  it('拦截开关必须成对出现：开启后无论如何都要关闭（否则会一直劫持页面后续 filechooser）', () => {
    const all = main.match(/Page\.setInterceptFileChooserDialog/g) || [];
    // 至少一处 enabled:true（开启）+ 一处 enabled:false（还原）
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(main).toMatch(/setInterceptFileChooserDialog',\s*\{\s*enabled:\s*true\s*\}/);
    expect(main).toMatch(/setInterceptFileChooserDialog',\s*\{\s*enabled:\s*false\s*\}/);
  });

  it('upload 只有唯一实现（不许再留第二条分叉的 case upload 死代码）', () => {
    const cases = main.match(/case 'upload':\s*\{/g) || [];
    expect(cases.length).toBe(1);
  });

  it('不再保留「DataTransfer 造假 File」的废弃实现（受浏览器安全限制必失败，且会误导排查）', () => {
    // 允许注释里出现关键词，但不允许真的有 dt.items.add(file) 这种实现语句
    expect(main).not.toContain('dt.items.add(file)');
  });

  it('选择 input[type=file] 时优先可见节点，而不是盲取 nodeIds[0]', () => {
    expect(main).toContain('pickInjectable');
  });

  it('★★ 可见性只能用于「选哪个」，不能否决「能不能注入」——隐藏 input 必须仍可注入（B5）', () => {
    // 根因：抖音/React 站点的上传 input 常是 display:none / 0x0 隐藏 input（按钮 click 触发），
    // 而 DOM.setFileInputFiles 不要求元素可见。B3 曾把"不可见"当不可用 → 报 no_visible_input、
    // 抖音上传全灭。现在 probeInput 只判 alive/!disabled，可见性仅参与排序（visible 优先）。
    const probe = main.match(/const probeInput = async[\s\S]*?\n {10}\};/)?.[0] || '';
    expect(probe).toMatch(/disabled:\s*!!this\.disabled/);   // 仍排除禁用
    expect(probe).toMatch(/visible:/);                        // 可见性单独记录
    expect(main).toMatch(/all\.find\(\(p\)\s*=>\s*p\.visible\)\s*\|\|\s*all\[0\]/); // 全隐藏时回落存活节点
    expect(main).not.toContain('pickVisibleInput');           // 旧的"不可见即否决"实现已移除
  });

  it('★★ DOM.setFileInputFiles 必须用单数 nodeId（写成复数 nodeIds 会被 CDP 静默忽略 → 报 Either nodeId...）', () => {
    // 抖音上传 19 次尝试全灭的真凶：请求参数写成了 nodeIds（复数）。
    // CDP 只认 nodeId / backendNodeId / objectId 三者之一，未知键被忽略 → 三者全缺 → 抛错。
    expect(main).not.toMatch(/setFileInputFiles',\s*\{\s*files:\s*\[[^\]]*\],\s*nodeIds:/);
    // 至少有一处用单数 nodeId 调用
    expect(main).toMatch(/setFileInputFiles',\s*\{\s*files:\s*\[[^\]]*\],\s*nodeId:/);
  });

  it('★★★ verified 判据绝不能只用 inFiles 自证（CDP 注入本就写进 input.files ⇒ 恒真，同义反复）', () => {
    // 抖音发布任务实测（2026-10-18）：3 次投递全 IPC 成功、inFiles 回读必命中 ⇒ 回执报
    // "已核验：上传已成功，请勿重复调用"，而页面恒「未上传」⇒ 执行员被矛盾回执拖着空转 37 步。
    // 修法：verified = 页面文本（文件名/进度）或网络层上传请求；inFiles 只作记录不作判据。
    expect(main).not.toMatch(/verified\s*=\s*!!\(\s*ev\.inFiles\s*\|\|/); // 旧写法（inFiles 领头）禁止回归
    expect(main).toMatch(/verified\s*=\s*!!\(\s*ev\.inText\s*\|\|\s*ev\.busy\s*\|\|\s*netSeen\s*\)/);
  });

  it('★★★ 投递成功≠上传开始：必须收集网络层上传请求作为硬证据（Network.requestWillBeSent）', () => {
    // 页面进度 UI 常是自绘/iframe/shadow DOM，innerText 读不到；网络层是唯一跨站可靠的中层信号。
    expect(main).toMatch(/await send\('Network\.enable'\)/);
    expect(main).toContain("method !== 'Network.requestWillBeSent'");
    expect(main).toContain('netUploads');   // 收集容器
    // 回执必须把"未观察到任何证据"翻译成"页面尚未接管"，并给出非重复投递的下一步
    expect(main).toContain('投递成功≠上传开始');
    expect(main).toContain('不要盲目重复 upload');
  });
});

describe('browser_upload 工具 schema（core）', () => {
  it('暴露 clickSelector/clickIndex/clickX/clickY 四个 filechooser 模式入参', () => {
    for (const k of ['clickSelector', 'clickIndex', 'clickX', 'clickY']) {
      expect(coreTool).toContain(`${k}:`);
    }
  });

  it('把 clickX/clickY 透传给服务端 action（否则坐标兜底模式失效）', () => {
    expect(coreTool).toMatch(/clickX:\s*args\.clickX/);
    expect(coreTool).toMatch(/clickY:\s*args\.clickY/);
  });
});

const serverBrowser = fs.readFileSync(
  path.join(REPO_ROOT, 'apps/server/src/routes/browser.ts'),
  'utf8',
);

describe('browser_run_script 顶层 return 容错（两处执行面都要有）', () => {
  // 2026-10-07：模型常写 `const x=...; return x;`（裸 return），直接 executeJavaScript/evaluate
  // 会抛 SyntaxError，模型只看到 "Script failed to execute" 无法自纠（当天连犯 3 次）。
  it('桌面端 main.cjs 自动包裹裸 return 脚本', () => {
    expect(main).toContain('_autoWrapped');
    expect(main).toMatch(/\(\(\) => \{ \$\{script\}/);
    expect(main).toContain('_stripCode');
  });

  it('server routes/browser.ts 同步做同样的包裹（避免一处改一处漏）', () => {
    expect(serverBrowser).toContain('_autoWrapped');
    expect(serverBrowser).toContain('_stripCode');
  });

  it('run_script 工具描述里点明「可直接写 return」（模型据此不再纠结包 IIFE）', () => {
    expect(coreTool).toMatch(/return x/);
    expect(coreTool).toMatch(/自动.*包|会自动/);
  });
});