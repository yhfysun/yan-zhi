// 内置「调研报告生成助手」智能体：server 启动时幂等 seed。
// 定义版本 WF_DEF_VERSION 升级时强制覆盖库中副本（用于下发修正），平时仅首次创建、不覆盖用户编辑。
// 一条 DAG 以真实调研流程覆盖引擎全部 10 种节点类型：
//   input(主题) → code(生成提纲) → tool(builtin task_plan) → code(拆分调研维度)
//        → loop(loop_body: code 逐维度加工 / loop_exit: 继续)
//        → memory_write(归档) → memory_read(回查历史) → condition(true: sub_agent → llm 成稿 / false: code 兜底)
//        → output(调研报告)
import type { YzSqliteDb } from './services/sqlite-driver.js';
import { normalizeModelId } from './services/model-resolve.js';

export const WF_MAIN_ID = 'a_wf_smoke_all_nodes';
export const WF_SUB_ID = 'a_wf_smoke_editor';
/** 内置「短剧流水线」：一句话 → 分镜 → 逐镜出图配音 → 字幕 → 交付清单。 */
export const WF_DRAMA_ID = 'a_wf_drama_pipeline';
/** 内置「小说改写流水线」：原文 → 确认改写目标 → 大纲确认 → 分批改写（每批确认）→ 成稿。 */
export const WF_NOVEL_ID = 'a_wf_novel_pipeline';
/** 内置「翻译流水线」：原文 → 确认语种/术语/风格 → 确认输出格式 → 分批翻译（每批确认）→ 一致性校验 → 译文。 */
export const WF_TRANSLATE_ID = 'a_wf_translate_pipeline';
/** 内置「有声小说流水线」：文本 → 确认配音参数 → 分段配音 + 字幕 → 时间轴确认 → 交付清单。 */
export const WF_AUDIOBOOK_ID = 'a_wf_audiobook_pipeline';
/** 内置工作流定义版本：内容/结构修正时 +1，seed 会覆盖库中旧副本。
 *  v6（2026-09-27）：短剧流水线在分镜后插入 human_confirm 确认点（用户要求"每步让用户确认"）。
 *  v7（2026-09-27）：补 P2 剩余的三类 SOP 工作流（小说改写 / 翻译 / 有声小说）。 */
export const WF_DEF_VERSION = 7;
/**
 * 历史遗留诊断智能体 id：2026-09 排查 loop 节点时手工创建的 workflow 调试载体。
 * 只作一次性清理目标，不在任何内置定义中；清理见 cleanupLegacyDiagAgents()。
 */
const LEGACY_DIAG_AGENT_ID = 'diag_min_loop';

function subWorkflow() {
  return {
    nodes: [
      { id: 's_in', type: 'input', config: { schema: { topic: 'string' } }, position: { x: 60, y: 200 } },
      {
        id: 's_code', type: 'code',
        config: {
          expression:
            "const topic = ctx.inputs.topic || '未命名主题';\n" +
            "return { topic, generatedBy: '" + WF_SUB_ID + "', points: [topic + ' 的发展现状与核心事实', topic + ' 的关键驱动因素', topic + ' 的主要风险与待验证点'] };",
        },
        position: { x: 300, y: 200 },
      },
      { id: 's_out', type: 'output', config: { key: 'brief' }, position: { x: 540, y: 200 } },
    ],
    edges: [
      { id: 's_e1', source: 's_in', target: 's_code' },
      { id: 's_e2', source: 's_code', target: 's_out' },
    ],
  };
}

function mainWorkflow() {
  const nodes = [
    {
      id: 'n_input', type: 'input',
      config: { schema: { topic: 'string' } },
      position: { x: 40, y: 220 },
    },
    {
      id: 'n_outline', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '未命名主题';\n" +
          "return { title: '调研提纲：' + topic, steps: [{ title: '现状梳理：核心事实与数据' }, { title: '关键要点：驱动因素与机会' }, { title: '结论建议：风险与下一步' }] };",
      },
      position: { x: 260, y: 220 },
    },
    {
      // arguments 为空对象 → 回落上游输出作为入参（保留「空 arguments 取上游」语义）
      id: 'n_plan', type: 'tool',
      config: { toolSource: 'builtin', toolName: 'task_plan', arguments: {} },
      position: { x: 480, y: 220 },
    },
    {
      id: 'n_dimensions', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '未命名主题';\n" +
          "return [topic + '｜维度一：现状梳理（核心事实与数据）', topic + '｜维度二：关键要点（驱动因素与机会）', topic + '｜维度三：结论建议（风险与下一步）'];",
      },
      position: { x: 700, y: 220 },
    },
    {
      id: 'n_loop', type: 'loop',
      config: { maxIterations: 3, iterateKey: 'item', bodyExpr: '' },
      position: { x: 920, y: 220 },
    },
    {
      id: 'n_loop_body', type: 'code',
      config: { expression: "return '【调研维度 ' + (ctx.inputs.index + 1) + '/3】' + ctx.inputs.item;" },
      position: { x: 920, y: 380 },
    },
    {
      id: 'n_mem_write', type: 'memory_write',
      config: { agentId: WF_MAIN_ID, contentKey: 'content', tags: ['调研流水线', 'builtin-workflow'] },
      position: { x: 1140, y: 220 },
    },
    {
      id: 'n_mem_read', type: 'memory_read',
      config: { agentId: WF_MAIN_ID, query: '', topK: 3 },
      position: { x: 1360, y: 220 },
    },
    {
      id: 'n_cond', type: 'condition',
      config: {
        expression:
          'const last = ctx.outputs.size ? Array.from(ctx.outputs.values()).pop() : null;\n' +
          'return Array.isArray(last) && last.length > 0;',
      },
      position: { x: 1580, y: 220 },
    },
    {
      // inputsMapping 只能取 ctx.inputs.* （ctx.outputs 是 Map，路径取不到上游节点输出）
      id: 'n_sub', type: 'sub_agent',
      config: { subAgentId: WF_SUB_ID, inputsMapping: { topic: '${ctx.inputs.topic}' } },
      position: { x: 1800, y: 100 },
    },
    {
      // platformId/modelId 留空：启动时由 ensureBuiltinWorkflowModel() 按 agnes flash 自动回填
      id: 'n_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt:
          '你是「调研报告生成助手」的成稿助手。输入是一段 JSON（子智能体提炼的调研要点）。请输出 150 字以内中文调研简报，结构包含：' +
          '1) 调研主题；2) 核心发现（合并要点中的现状/驱动/风险三部分）；' +
          '3) 一句话结论与建议。语气客观、条理清晰，不要输出代码块。',
        temperature: 0.3, maxTokens: 512,
      },
      position: { x: 2020, y: 100 },
    },
    {
      id: 'n_fallback', type: 'code',
      config: { expression: "return '[兜底分支] 记忆库中暂无历史调研归档，condition 走 false 分支，跳过成稿环节';" },
      position: { x: 1800, y: 360 },
    },
    {
      id: 'n_output', type: 'output',
      config: { key: 'report' },
      position: { x: 2260, y: 220 },
    },
  ];

  const edges = [
    { id: 'e1', source: 'n_input', target: 'n_outline' },
    { id: 'e2', source: 'n_outline', target: 'n_plan' },
    { id: 'e3', source: 'n_plan', target: 'n_dimensions' },
    { id: 'e4', source: 'n_dimensions', target: 'n_loop' },
    { id: 'e5', source: 'n_loop', target: 'n_loop_body', sourceHandle: 'loop_body', label: 'body' },
    { id: 'e6', source: 'n_loop', target: 'n_mem_write', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'e7', source: 'n_mem_write', target: 'n_mem_read' },
    { id: 'e8', source: 'n_mem_read', target: 'n_cond' },
    { id: 'e9', source: 'n_cond', target: 'n_sub', sourceHandle: 'true', label: 'true' },
    { id: 'e10', source: 'n_cond', target: 'n_fallback', sourceHandle: 'false', label: 'false' },
    { id: 'e11', source: 'n_sub', target: 'n_llm' },
    { id: 'e12', source: 'n_llm', target: 'n_output' },
    { id: 'e13', source: 'n_fallback', target: 'n_output' },
  ];

  return { nodes, edges };
}

/**
 * 内置「短剧流水线」工作流。
 *
 * 形态：输入一句主题 → 产出分镜表 → 逐镜生图 + 逐镜配音 → 字幕 → 交付清单。
 * 链路设计遵循两条既有语义（改之前务必确认）：
 *  1. tool 节点的 arguments 为空对象时回落「上游输出」，所以每个 api 工具前都要放 code 节点构造入参；
 *  2. loop 的 body 首节点取到的是 loop 自身输出，因此 body 内先用 code 节点从 ctx.inputs 取 item/index 再构造。
 * 依赖：api_* 工具必须用 toolSource:'api'（它们不在 core 的 getToolRegistry 里）；
 *      配音依赖 api_tts_speak（模型层或系统语音兜底，开箱可用）；
 *      音视频合成（media_compose）需 ffmpeg —— 缺了就调 media_install_ffmpeg，故本流水线不直接依赖它，
 *      先交付「图 + 音频 + 字幕」三件套，合成作为可选后续步骤。
 */
function dramaWorkflow() {
  const nodes = [
    {
      id: 'd_in', type: 'input',
      config: { schema: { topic: 'string', roles: 'string[]（可选，限定角色名，如 ["女主","男主","旁白"]）' } },
      position: { x: 40, y: 240 },
    },

    // 1) 生成分镜：LLM 产出结构化 JSON（镜头数组，每镜含画面描述与台词）
    {
      id: 'd_prompt', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '未命名主题';\n" +
          "const roles = Array.isArray(ctx.inputs.roles) ? ctx.inputs.roles.filter(Boolean) : [];\n" +
          "const roleNote = roles.length\n" +
          "  ? '角色限定为：' + roles.join('、') + '。旁白用「旁白」。'\n" +
          "  : '按主题自行设计 1-2 个角色，并包含「旁白」。';\n" +
          "return '你是短剧分镜师。请为下面这个主题设计 3 个镜头的分镜表。\\n主题：' + topic + '\\n' + roleNote + '\\n' +\n" +
          "  '只输出 JSON 数组，不要任何解释、不要 markdown 代码块。每项形如：' +\n" +
          "  '{\"shot\":1,\"character\":\"角色名\",\"scene\":\"画面描述（主体+场景+光线+构图）\",\"line\":\"该镜台词（15字以内）\",\"seconds\":3}';",
      },
      position: { x: 260, y: 240 },
    },
    {
      id: 'd_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是短剧分镜师。严格按照用户要求只输出 JSON 数组，不要输出任何其他文字、不要包代码块。',
        temperature: 0.7, maxTokens: 1200,
      },
      position: { x: 480, y: 240 },
    },
    // 洗一遍：模型可能裹上 ```json 代码块或多余说明，这里剥出来并校验。
    // 用 ctx.get('d_llm') 按节点 id 精确取上游（不依赖「最后一个输出」的顺序假设）。
    // 注意：code 节点的 catch 会吞错返回 null，所以校验失败要返回带 ok=false 的对象而不是 throw。
    {
      id: 'd_shots', type: 'code',
      config: {
        expression:
          "const raw = ctx.get('d_llm');\n" +
          "let s = String(raw == null ? '' : raw).trim();\n" +
          "s = s.replace(/^```(?:json)?\\s*/i, '').replace(/```\\s*$/, '').trim();\n" +
          "const a = s.indexOf('['); const b = s.lastIndexOf(']');\n" +
          "if (a >= 0 && b > a) s = s.slice(a, b + 1);\n" +
          "let arr = null;\n" +
          "try { arr = JSON.parse(s); } catch (e) { arr = null; }\n" +
          "if (!Array.isArray(arr) || arr.length === 0) {\n" +
          "  return { ok: false, error: '模型未返回合法分镜 JSON', raw: String(raw).slice(0, 300) };\n" +
          "}\n" +
          "const shots = arr.map((it, i) => ({\n" +
          "  shot: Number(it && it.shot) || i + 1,\n" +
          "  character: String((it && it.character) || '旁白').trim() || '旁白',\n" +
          "  scene: String((it && it.scene) || '').trim(),\n" +
          "  line: String((it && it.line) || '').trim(),\n" +
          "  seconds: Number(it && it.seconds) > 0 ? Number(it.seconds) : 3,\n" +
          "})).filter((x) => x.scene);\n" +
          "if (!shots.length) return { ok: false, error: '分镜里没有有效的 scene 字段' };\n" +
          "return { ok: true, shots: shots };",
      },
      position: { x: 700, y: 240 },
    },

    // 1.5) 人工确认分镜（human_confirm 节点）—— 用户要的「一步步让用户确认」的机械保证。
    // 位置刻意放在**花钱之前**：分镜一旦开跑就要逐镜出图 + 配音（真实算力/费用），
    // 分镜本身不满意必须先拦住，而不是等 6 个镜头的图都生成完才发现方向错了。
    // ★ 这也是「靠提示词约束不可靠」的正解：不确认物理上走不到 d_list，模型无法绕过。
    {
      id: 'd_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '分镜脚本已生成，请确认后再开始逐镜出图与配音',
        pages: [
          {
            question: '上面的分镜（角色/画面/台词/时长）可以直接开始制作吗？',
            description: '确认后将逐镜生成图像与配音；如需调整请点「打回重做」，并在下方说明要改什么。',
            options: ['可以直接制作', '需要调整'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
          {
            question: '本轮只做前几个镜头？',
            description: '留空或填 all 表示全部镜头；填数字（如 3）表示先做前 3 镜试效果，控制成片成本。',
            allowText: true,
            required: false,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 810, y: 60 },
    },

    // 提取纯数组给 loop 当迭代源（loop 只认数组，收到对象会退化成「迭代 1 次」）
    {
      id: 'd_list', type: 'code',
      config: {
        expression:
          "const r = ctx.get('d_shots');\n" +
          "return Array.isArray(r && r.shots) ? r.shots : [];",
      },
      position: { x: 810, y: 240 },
    },

    // 2) 逐镜出图 + 逐镜配音（loop body 内串联两个 api 工具）
    {
      id: 'd_loop', type: 'loop',
      config: { maxIterations: 6, iterateKey: 'shot', bodyExpr: '' },
      position: { x: 920, y: 240 },
    },
    {
      id: 'd_img_args', type: 'code',
      config: {
        expression:
          "const s = ctx.inputs.shot || {};\n" +
          "return { prompt: '短剧定妆镜头：' + String(s.scene || '') + '，电影感，16:9，高细节' };",
      },
      position: { x: 920, y: 420 },
    },
    {
      id: 'd_img', type: 'tool',
      config: { toolSource: 'api', toolName: 'api_image_generate', arguments: {} },
      position: { x: 1140, y: 420 },
    },
    {
      id: 'd_tts_args', type: 'code',
      config: {
        expression:
          "const s = ctx.inputs.shot || {};\n" +
          "const line = String(s.line || '').trim();\n" +
          // 没有台词就跳过配音（返回 null → 不调工具），而不是让整条流水线失败。
          // character 交给 api_tts_speak 做音色分配：同角色锁定同音色、不同角色自动区分。
          "return line ? { text: line, character: String(s.character || '旁白') } : null;",
      },
      position: { x: 1360, y: 420 },
    },
    {
      id: 'd_tts', type: 'tool',
      config: { toolSource: 'api', toolName: 'api_tts_speak', arguments: {} },
      position: { x: 1580, y: 420 },
    },

    // 3) 汇总：把分镜表 + 逐镜产物整理成交付清单
    {
      id: 'd_manifest', type: 'code',
      config: {
        expression:
          "const r = ctx.get('d_shots');\n" +
          "const shots = (r && r.shots) || [];\n" +
          "const lines = ['# 短剧流水线交付清单', '', '主题：' + (ctx.inputs.topic || '未命名'), '', '| 镜头 | 角色 | 画面 | 台词 | 时长(s) |', '| --- | --- | --- | --- | --- |'];\n" +
          "for (const s of shots) lines.push('| ' + s.shot + ' | ' + (s.character || '旁白') + ' | ' + String(s.scene || '').slice(0, 40) + ' | ' + (s.line || '—') + ' | ' + s.seconds + ' |');\n" +
          "const roles = Array.from(new Set(shots.map((s) => s.character || '旁白')));\n" +
          "lines.push('', '角色（各自已分配独立音色）：' + roles.join('、'));\n" +
          "lines.push('已产出：每镜 1 张图 + 1 段配音（无台词镜头跳过配音），另附字幕 SRT。');\n" +
          "lines.push('如需成片，再调 media_compose：dub 配音 + subtitle 字幕 + concat 拼接（缺 ffmpeg 时先调 media_install_ffmpeg）。');\n" +
          "lines.push('★ 防黑屏规约：素材切片前先对源片跑 blackdetect（ffmpeg -skip_frame nokey -i 源片 -vf blackdetect=d=1.5:pix_th=0.10 -an -f null -），切分点必须避开黑场区间；成品切片自检不得含 >1.5s 黑段，切到黑场就平移切点重切，不要用黑底补时长。');\n" +
          "return lines.join('\\n');",
      },
      position: { x: 920, y: 240 },
    },

    // 4) 字幕：台词按各自时长累加生成 SRT
    {
      id: 'd_srt_args', type: 'code',
      config: {
        expression:
          "const r = ctx.get('d_shots');\n" +
          "const shots = (r && r.shots) || [];\n" +
          "const cues = shots.map((s) => ({ text: String(s.line || '').trim(), duration: Number(s.seconds) || 3 })).filter((c) => c.text);\n" +
          "return cues.length ? { cues: cues } : null;",
      },
      position: { x: 1140, y: 240 },
    },
    {
      id: 'd_srt', type: 'tool',
      config: { toolSource: 'api', toolName: 'api_srt_generate', arguments: {} },
      position: { x: 1360, y: 240 },
    },
    { id: 'd_out', type: 'output', config: { key: 'delivery' }, position: { x: 1580, y: 240 } },
  ];

  const edges = [
    { id: 'de1', source: 'd_in', target: 'd_prompt' },
    { id: 'de2', source: 'd_prompt', target: 'd_llm' },
    { id: 'de3', source: 'd_llm', target: 'd_shots' },
    { id: 'de4', source: 'd_shots', target: 'd_confirm' },
    // 确认通过后进入列表提取；用户打回（onReject=abort）则整条流水线中止
    { id: 'de4a', source: 'd_confirm', target: 'd_list' },
    { id: 'de4b', source: 'd_list', target: 'd_loop' },
    { id: 'de5', source: 'd_loop', target: 'd_img_args', sourceHandle: 'loop_body', label: 'body' },
    { id: 'de6', source: 'd_img_args', target: 'd_img' },
    { id: 'de7', source: 'd_img', target: 'd_tts_args' },
    { id: 'de8', source: 'd_tts_args', target: 'd_tts' },
    { id: 'de9', source: 'd_loop', target: 'd_manifest', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'de10', source: 'd_manifest', target: 'd_srt_args' },
    { id: 'de11', source: 'd_srt_args', target: 'd_srt' },
    { id: 'de12', source: 'd_srt', target: 'd_out' },
  ];

  return { nodes, edges };
}

/**
 * 内置「小说改写流水线」：把任务类型 SOP 从提示词约束升级成图上的结构事实。
 *   导入原文 → 确认改写目标（风格/人称/篇幅/受众）→ 大纲确认 → 分批改写（每批确认）→ 一致性检查 → 成稿
 *
 * 与短剧流水线同源的三条引擎语义（改之前务必确认）：
 *  1. tool 节点 arguments 为空对象 → 回落「上游输出」，故每个 api 工具前都要放 code 节点构造入参；
 *  2. loop 只认数组（收到对象会退化成「迭代 1 次」）；
 *  3. loop body 内的节点**拿得到父 ctx 的全部 outputs**（引擎把 ctx.outputs 复制进 itemCtx），
 *     所以 body 里可以 `ctx.get('<确认节点 id>')` 读用户在确认向导里选的参数 —— 不必额外加输入框。
 *
 * ★ 确认粒度（用户拍板：每批 N 章、N 可询问、默认 3）：批次划分在 code 节点里完成，
 *   N 从「改写目标」向导中「每批改写几章」那一页的作答里解析；解析不出就用默认 3。
 * ★ 批内打回用 onReject:'abort'（不是 retry）：loop 里没有「重做本批」的机制，
 *   retry 会退化成「打回了照样跑下一批」的假确认；中止让用户改完目标再重跑，语义诚实。
 */
function novelWorkflow() {
  const nodes = [
    {
      id: 'nv_in', type: 'input',
      config: {
        schema: {
          source: 'string（原文文本；也可只写 00-source 里的文件名，由模型引导取用）',
          goal: 'string（可选：改写方向，如「改成第一人称爽文」）',
        },
      },
      position: { x: 40, y: 260 },
    },

    // 1) 只做「切章节 + 给目标候选」，不开始改写（避免还没确认方向就先烧一遍全稿）
    {
      id: 'nv_scan_prompt', type: 'code',
      config: {
        expression:
          "const src = String(ctx.inputs.source || '').trim();\n" +
          "const goal = String(ctx.inputs.goal || '').trim();\n" +
          "const goalNote = goal ? ('用户已给的方向（优先采用）：' + goal + '\\n') : '';\n" +
          "return '你是小说改写策划。现在只做两件事，先不要开始改写：\\n' +\n" +
          "  '① 切分章节：有章/节标题就按标题切；没有就按每 2000 字左右切一段，并摘录该段首句；\\n' +\n" +
          "  '② 给出 3 组改写目标候选（风格 / 人称 / 篇幅 / 目标读者），供用户挑选。\\n' +\n" +
          "  '只输出 JSON，不要任何解释、不要 markdown 代码块，形如：' +\n" +
          "  '{\"chapters\":[{\"index\":1,\"title\":\"第一章 起风\",\"excerpt\":\"首句\",\"words\":1800}],' +\n" +
          "  '\"goalOptions\":[{\"style\":\"悬疑冷峻\",\"person\":\"第三人称限制视角\",\"length\":\"与原作相当\",\"audience\":\"成年读者\"}]}\\n' +\n" +
          "  goalNote +\n" +
          "  '原文：\\n' + (src || '（未提供原文：请先提示用户把原文放进 00-source 或直接粘贴，不要凭空编造章节。）');",
      },
      position: { x: 260, y: 260 },
    },
    {
      id: 'nv_scan_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是小说改写策划。严格按用户要求只输出 JSON，不要输出任何其他文字、不要包代码块。',
        temperature: 0.3, maxTokens: 2000,
      },
      position: { x: 480, y: 260 },
    },
    {
      id: 'nv_scan', type: 'code',
      config: {
        expression:
          "const raw = ctx.get('nv_scan_llm');\n" +
          "let s = String(raw == null ? '' : raw).trim();\n" +
          "s = s.replace(/^```(?:json)?\\s*/i, '').replace(/```\\s*$/, '').trim();\n" +
          "const a = s.indexOf('{'); const b = s.lastIndexOf('}');\n" +
          "if (a >= 0 && b > a) s = s.slice(a, b + 1);\n" +
          "let obj = null;\n" +
          "try { obj = JSON.parse(s); } catch (e) { obj = null; }\n" +
          "const arr = obj && Array.isArray(obj.chapters) ? obj.chapters : null;\n" +
          "if (!arr || !arr.length) return { ok: false, error: '模型未返回合法章节 JSON', raw: String(raw).slice(0, 300) };\n" +
          "const chapters = arr.map((it, i) => ({\n" +
          "  index: Number(it && it.index) || i + 1,\n" +
          "  title: String((it && it.title) || ('第 ' + (i + 1) + ' 章')).trim(),\n" +
          "  excerpt: String((it && it.excerpt) || '').trim(),\n" +
          "  words: Number(it && it.words) > 0 ? Number(it.words) : 0,\n" +
          "})).filter((x) => x.title);\n" +
          "if (!chapters.length) return { ok: false, error: '章节切分结果为空' };\n" +
          "const goalOptions = obj && Array.isArray(obj.goalOptions) ? obj.goalOptions : [];\n" +
          "return { ok: true, chapters: chapters, goalOptions: goalOptions };",
      },
      position: { x: 700, y: 260 },
    },

    // 2) 改写目标确认 —— SOP「确认改写目标」的机械保证
    {
      id: 'nv_goal_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '改写目标还没定，请先确认（风格/人称/篇幅/受众），确认后才开始动笔',
        pages: [
          {
            question: '改成什么风格？',
            description: '可点选，也可自己写（如「冷硬推理」「轻喜剧」「古文白话化」）。',
            options: ['保持原作风格', '更紧凑爽利', '更文学化'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
          {
            question: '人称与视角？',
            options: ['保持原样', '改第一人称', '改第三人称限制视角'],
            allowText: true,
            required: true,
          },
          {
            question: '篇幅怎么处理？',
            options: ['与原作相当', '压缩到一半', '扩写细节'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
          {
            question: '目标读者？',
            allowText: true,
            required: false,
          },
          {
            question: '每批改写几章？',
            description: '留空或填 3 表示每批 3 章确认一次；填数字可调整批次大小。',
            allowText: true,
            required: false,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 920, y: 260 },
    },

    // 3) 大纲（把已确认的目标 + 章节结构交给模型，产出可确认的改写大纲）
    {
      id: 'nv_outline_prompt', type: 'code',
      config: {
        expression:
          "const scan = ctx.get('nv_scan') || {};\n" +
          "const c = ctx.get('nv_goal_confirm') || {};\n" +
          "const answers = Array.isArray(c.answers) ? c.answers : [];\n" +
          "const picked = answers.map((a) => String(a.question || '') + '：' + String(a.answer || '')).filter((s) => s.indexOf('：') < s.length - 1);\n" +
          "const chapters = Array.isArray(scan.chapters) ? scan.chapters : [];\n" +
          "const list = chapters.map((ch) => ch.index + '. ' + ch.title + (ch.excerpt ? ('（' + ch.excerpt + '）') : '')).join('\\n');\n" +
          "return '你是小说改写主编。用户已确认的改写目标：\\n' + (picked.join('\\n') || '（未作答，按原作风格等长改写）') + '\\n\\n' +\n" +
          "  '原作章节结构：\\n' + list + '\\n\\n' +\n" +
          "  '请给出改写大纲：逐章列出「保留什么 / 改什么 / 为什么」；再单独列出全局改动（人称、时间线、删并章）。' +\n" +
          "  '只输出大纲，不要开始改写正文。';",
      },
      position: { x: 1140, y: 260 },
    },
    {
      id: 'nv_outline_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是小说改写主编。只输出改写大纲，逐章写清「保留/改动/理由」，不要输出改写后的正文。',
        temperature: 0.5, maxTokens: 2400,
      },
      position: { x: 1360, y: 260 },
    },
    {
      id: 'nv_outline_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '改写大纲已生成，请确认后再开始逐批改写（大方向错了必须先拦住，别等几十章都改完）',
        pages: [
          {
            question: '这个大纲可以直接开始改写吗？',
            description: '确认后将按批次改写正文，每批完成后再请你确认。要调整请点「拒绝并中止」，改完目标重跑。',
            options: ['可以直接改写', '需要调整'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 1580, y: 260 },
    },

    // 4) 分批（必须产出纯数组：loop 收到对象会退化成只迭代一次）
    {
      id: 'nv_batches', type: 'code',
      config: {
        expression:
          "const scan = ctx.get('nv_scan') || {};\n" +
          "const chapters = Array.isArray(scan.chapters) ? scan.chapters : [];\n" +
          "if (!chapters.length) return [];\n" +
          "const c = ctx.get('nv_goal_confirm') || {};\n" +
          "const answers = Array.isArray(c.answers) ? c.answers : [];\n" +
          "const sizeText = answers.filter((a) => /每批|批次/.test(String((a && a.question) || '')))\n" +
          "  .map((a) => String((a && a.answer) || '')).join(' ');\n" +
          "const m = sizeText.match(/\\d{1,2}/);\n" +
          "let n = m ? Number(m[0]) : 3;\n" +
          "if (!(n >= 1)) n = 3;\n" +
          "if (n > 20) n = 20;\n" +
          "const out = [];\n" +
          "for (let i = 0; i < chapters.length; i += n) {\n" +
          "  out.push({ batchIndex: out.length + 1, chapters: chapters.slice(i, i + n) });\n" +
          "}\n" +
          "return out;",
      },
      position: { x: 1800, y: 260 },
    },
    {
      id: 'nv_loop', type: 'loop',
      config: { maxIterations: 40, iterateKey: 'batch', bodyExpr: '' },
      position: { x: 2020, y: 260 },
    },
    // loop body 首节点：取到的是 loop 自身输出，所以必须从 ctx.inputs.batch 取本批
    {
      id: 'nv_batch_args', type: 'code',
      config: {
        expression:
          "const b = ctx.inputs.batch || {};\n" +
          "const chapters = Array.isArray(b.chapters) ? b.chapters : [];\n" +
          "const outline = String(ctx.get('nv_outline_llm') || '');\n" +
          "const c = ctx.get('nv_goal_confirm') || {};\n" +
          "const answers = Array.isArray(c.answers) ? c.answers : [];\n" +
          "const picked = answers.map((a) => String(a.question || '') + '：' + String(a.answer || ''));\n" +
          "const list = chapters.map((ch) => '【' + ch.title + '】（字数约 ' + (ch.words || '未知') + '）' + (ch.excerpt ? (' 首句：' + ch.excerpt) : '')).join('\\n');\n" +
          "return '你是小说改写作者。本轮只改写下面这一批章节，务必逐章输出完整正文，不要概括、不要跳过、不要写下一批。\\n\\n' +\n" +
          "  '已确认的改写目标：\\n' + (picked.join('\\n') || '（按原作风格等长改写）') + '\\n\\n' +\n" +
          "  '改写大纲：\\n' + (outline || '（无）') + '\\n\\n' +\n" +
          "  '本批章节（第 ' + (b.batchIndex || 1) + ' 批）：\\n' + list;",
      },
      position: { x: 2020, y: 440 },
    },
    {
      id: 'nv_batch_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是小说改写作者。逐章输出改写后的完整正文，保持章节标题。不要概括、不要跳章、不要输出解释性文字。',
        temperature: 0.7, maxTokens: 8000,
      },
      position: { x: 2240, y: 440 },
    },
    // 每批确认完毕才进入下一批 —— 「每 N 章确认一次」的机械保证
    {
      id: 'nv_batch_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '本批改写稿已生成，请确认后再继续下一批',
        pages: [
          {
            question: '本批改写可以定稿吗？',
            description: '点「确认继续」进入下一批；点「拒绝并中止」会停止整条流水线，改完目标后重跑。',
            options: ['可以，继续下一批', '本批要改'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 2460, y: 440 },
    },

    // 5) 汇总全稿（loop 的输出是「每轮 body 输出的数组」，正文文本要用字符串过滤取出来）
    {
      id: 'nv_assemble', type: 'code',
      config: {
        expression:
          "const r = ctx.get('nv_loop');\n" +
          "const parts = [];\n" +
          "if (Array.isArray(r)) {\n" +
          "  for (const it of r) {\n" +
          "    const vals = Array.isArray(it) ? it : [it];\n" +
          "    const txt = vals.filter((v) => typeof v === 'string' && v.trim()).pop();\n" +
          "    if (txt) parts.push(String(txt));\n" +
          "  }\n" +
          "}\n" +
          "const scan = ctx.get('nv_scan') || {};\n" +
          "const chapters = Array.isArray(scan.chapters) ? scan.chapters : [];\n" +
          "return { fullText: parts.join('\\n\\n'), batches: parts.length, chapters: chapters.length };",
      },
      position: { x: 2460, y: 260 },
    },
    {
      id: 'nv_check_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是小说编辑。输入是逐批改写后的全稿。只做一致性检查：人名与称谓、时间线、设定、伏笔是否前后一致。输出简短清单：一致项 / 冲突项（指出章节）/ 建议改法。不要重写正文。',
        temperature: 0.2, maxTokens: 1200,
      },
      position: { x: 2680, y: 260 },
    },
    {
      id: 'nv_manifest', type: 'code',
      config: {
        expression:
          "const asm = ctx.get('nv_assemble') || {};\n" +
          "const check = String(ctx.get('nv_check_llm') || '');\n" +
          "const scan = ctx.get('nv_scan') || {};\n" +
          "const chapters = Array.isArray(scan.chapters) ? scan.chapters : [];\n" +
          "const lines = ['# 小说改写交付清单', '', '章节数：' + chapters.length, '完成批次：' + (asm.batches || 0), '正文字数（约）：' + String(asm.fullText || '').length, '', '## 一致性检查', check || '（未产出）', '', '## 正文', String(asm.fullText || '（无正文产出）')];\n" +
          "return lines.join('\\n');",
      },
      position: { x: 2900, y: 260 },
    },
    { id: 'nv_out', type: 'output', config: { key: 'delivery' }, position: { x: 3120, y: 260 } },
  ];

  const edges = [
    { id: 'nve1', source: 'nv_in', target: 'nv_scan_prompt' },
    { id: 'nve2', source: 'nv_scan_prompt', target: 'nv_scan_llm' },
    { id: 'nve3', source: 'nv_scan_llm', target: 'nv_scan' },
    { id: 'nve4', source: 'nv_scan', target: 'nv_goal_confirm' },
    { id: 'nve5', source: 'nv_goal_confirm', target: 'nv_outline_prompt' },
    { id: 'nve6', source: 'nv_outline_prompt', target: 'nv_outline_llm' },
    { id: 'nve7', source: 'nv_outline_llm', target: 'nv_outline_confirm' },
    { id: 'nve8', source: 'nv_outline_confirm', target: 'nv_batches' },
    { id: 'nve9', source: 'nv_batches', target: 'nv_loop' },
    { id: 'nve10', source: 'nv_loop', target: 'nv_batch_args', sourceHandle: 'loop_body', label: 'body' },
    { id: 'nve11', source: 'nv_batch_args', target: 'nv_batch_llm' },
    { id: 'nve12', source: 'nv_batch_llm', target: 'nv_batch_confirm' },
    { id: 'nve13', source: 'nv_loop', target: 'nv_assemble', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'nve14', source: 'nv_assemble', target: 'nv_check_llm' },
    { id: 'nve15', source: 'nv_check_llm', target: 'nv_manifest' },
    { id: 'nve16', source: 'nv_manifest', target: 'nv_out' },
  ];

  return { nodes, edges };
}

/**
 * 内置「翻译流水线」：导入原文 → 确认语种/术语/风格 → 确认输出格式 → 分批翻译（每批确认）→ 一致性校验 → 译文
 *
 * 与小说改写同一个骨架，差异只在「确认什么」：
 *   · 第二道确认问语种方向 / 术语表 / 风格（术语表由首轮的 LLM 从原文里抽出来，让用户过一遍）；
 *   · 第三道确认问输出格式（中英对照 vs 纯译文）—— 这决定后续每一批的输出结构，必须前置确认。
 * ★ 术语一致性不靠提示词「请保持一致」，而是显式过一遍全稿（tr_check_llm），
 *   与翻译助手提示词里的「回译校验 / 术语一致性检查」对应。
 */
function translateWorkflow() {
  const nodes = [
    {
      id: 'tr_in', type: 'input',
      config: {
        schema: {
          source: 'string（待译原文；也可只写 00-source 里的文件名）',
          targetLang: 'string（可选：目标语言，如「英文」「日文」；不填则由模型判断并询问）',
          glossary: 'string（可选：既有术语对照，一行一条「源词=译词」）',
        },
      },
      position: { x: 40, y: 260 },
    },

    // 1) 先分段 + 抽术语表，不动笔翻译
    {
      id: 'tr_scan_prompt', type: 'code',
      config: {
        expression:
          "const src = String(ctx.inputs.source || '').trim();\n" +
          "const targetLang = String(ctx.inputs.targetLang || '').trim();\n" +
          "const glossary = String(ctx.inputs.glossary || '').trim();\n" +
          "return '你是翻译项目负责人。现在只做前期准备，先不要输出译文：\\n' +\n" +
          "  '① 判断源语言，按自然段/小标题把原文切成翻译分段（每段 200-600 字），给出段号与首句；\\n' +\n" +
          "  '② 抽出全文反复出现的专有名词、机构名、人名、产品名、行业术语，给出建议译法。\\n' +\n" +
          "  '只输出 JSON，不要解释、不要 markdown 代码块，形如：' +\n" +
          "  '{\"sourceLang\":\"中文\",\"segments\":[{\"index\":1,\"head\":\"首句\",\"words\":320}],' +\n" +
          "  '\"terms\":[{\"from\":\"源词\",\"to\":\"建议译法\",\"note\":\"依据\"}]}\\n' +\n" +
          "  (targetLang ? ('目标语言（用户指定）：' + targetLang + '\\n') : '目标语言：待用户确认\\n') +\n" +
          "  (glossary ? ('用户已有术语表（以用户为准）：\\n' + glossary + '\\n') : '') +\n" +
          "  '原文：\\n' + (src || '（未提供原文：请先提示用户把原文放进 00-source 或直接粘贴。）');",
      },
      position: { x: 260, y: 260 },
    },
    {
      id: 'tr_scan_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是翻译项目负责人。严格按用户要求只输出 JSON，不要输出任何其他文字、不要包代码块。',
        temperature: 0.2, maxTokens: 2400,
      },
      position: { x: 480, y: 260 },
    },
    {
      id: 'tr_segments', type: 'code',
      config: {
        expression:
          "const raw = ctx.get('tr_scan_llm');\n" +
          "let s = String(raw == null ? '' : raw).trim();\n" +
          "s = s.replace(/^```(?:json)?\\s*/i, '').replace(/```\\s*$/, '').trim();\n" +
          "const a = s.indexOf('{'); const b = s.lastIndexOf('}');\n" +
          "if (a >= 0 && b > a) s = s.slice(a, b + 1);\n" +
          "let obj = null;\n" +
          "try { obj = JSON.parse(s); } catch (e) { obj = null; }\n" +
          "const arr = obj && Array.isArray(obj.segments) ? obj.segments : null;\n" +
          "if (!arr || !arr.length) return { ok: false, error: '模型未返回合法分段 JSON', raw: String(raw).slice(0, 300) };\n" +
          "const segments = arr.map((it, i) => ({\n" +
          "  index: Number(it && it.index) || i + 1,\n" +
          "  head: String((it && it.head) || '').trim(),\n" +
          "  words: Number(it && it.words) > 0 ? Number(it.words) : 0,\n" +
          "})).filter((x) => x.index);\n" +
          "if (!segments.length) return { ok: false, error: '分段结果为空' };\n" +
          "const terms = obj && Array.isArray(obj.terms) ? obj.terms : [];\n" +
          "return { ok: true, sourceLang: String((obj && obj.sourceLang) || '未知'), segments: segments, terms: terms };",
      },
      position: { x: 700, y: 260 },
    },

    // 2) 语种/术语/风格确认
    {
      id: 'tr_param_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '翻译参数还没定，请先确认语种方向、术语表与风格，确认后才开始翻译',
        pages: [
          {
            question: '语种方向？',
            description: '格式「源语言 → 目标语言」，如「中文 → 英文」。',
            allowText: true,
            required: true,
          },
          {
            question: '术语表可以照用吗？',
            description: '请核对上面抽出的术语与建议译法；要改就写「原译法=新译法」，一行一条。',
            options: ['术语表照用', '我要调整（写在补充说明）'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
          {
            question: '翻译风格与用途？',
            description: '用途决定直译还是意译（合同要严谨对等，宣传要顺口）。',
            options: ['严谨直译', '自然意译', '商务书面'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 920, y: 260 },
    },

    // 3) 输出格式确认：决定每一批的输出结构，必须前置
    {
      id: 'tr_format_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '输出格式还没定，请确认后开始分批翻译（格式决定每批产出结构，先定下来免得返工）',
        pages: [
          {
            question: '要哪种输出格式？',
            description: '对照排版 = 译文与原文逐段对照；纯译文 = 只要目标语言文本。',
            options: ['中英对照（逐段）', '纯译文'],
            allowText: true,
            required: true,
          },
          {
            question: '是否保留原文格式（标题层级、编号、表格）？',
            options: ['保留', '不保留，只要连续文本'],
            allowText: true,
            required: false,
          },
          {
            question: '每批翻译几段？',
            description: '留空或填 3 表示每批 3 段确认一次。',
            allowText: true,
            required: false,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 1140, y: 260 },
    },

    // 4) 分批（纯数组 + 逐批确认）
    {
      id: 'tr_batches', type: 'code',
      config: {
        expression:
          "const r = ctx.get('tr_segments') || {};\n" +
          "const segments = Array.isArray(r.segments) ? r.segments : [];\n" +
          "if (!segments.length) return [];\n" +
          "const c = ctx.get('tr_format_confirm') || {};\n" +
          "const answers = Array.isArray(c.answers) ? c.answers : [];\n" +
          "const sizeText = answers.filter((a) => /每批|批次/.test(String((a && a.question) || '')))\n" +
          "  .map((a) => String((a && a.answer) || '')).join(' ');\n" +
          "const m = sizeText.match(/\\d{1,2}/);\n" +
          "let n = m ? Number(m[0]) : 3;\n" +
          "if (!(n >= 1)) n = 3;\n" +
          "if (n > 30) n = 30;\n" +
          "const out = [];\n" +
          "for (let i = 0; i < segments.length; i += n) {\n" +
          "  out.push({ batchIndex: out.length + 1, segments: segments.slice(i, i + n) });\n" +
          "}\n" +
          "return out;",
      },
      position: { x: 1360, y: 260 },
    },
    {
      id: 'tr_loop', type: 'loop',
      config: { maxIterations: 60, iterateKey: 'batch', bodyExpr: '' },
      position: { x: 1580, y: 260 },
    },
    {
      id: 'tr_batch_args', type: 'code',
      config: {
        expression:
          "const b = ctx.inputs.batch || {};\n" +
          "const segs = Array.isArray(b.segments) ? b.segments : [];\n" +
          "const scan = ctx.get('tr_segments') || {};\n" +
          "const terms = Array.isArray(scan.terms) ? scan.terms : [];\n" +
          "const termText = terms.map((t) => String((t && t.from) || '') + ' = ' + String((t && t.to) || '') + (t && t.note ? ('（' + String(t.note) + '）') : '')).join('\\n');\n" +
          "const fmt = ctx.get('tr_format_confirm') || {};\n" +
          "const fmtAnswers = Array.isArray(fmt.answers) ? fmt.answers : [];\n" +
          "const fmtText = fmtAnswers.map((a) => String(a.question || '') + '：' + String(a.answer || '')).join('\\n');\n" +
          "const param = ctx.get('tr_param_confirm') || {};\n" +
          "const paramAnswers = Array.isArray(param.answers) ? param.answers : [];\n" +
          "const paramText = paramAnswers.map((a) => String(a.question || '') + '：' + String(a.answer || '') + (a.supplement ? ('（补充：' + String(a.supplement) + '）') : '')).join('\\n');\n" +
          "const list = segs.map((s) => '第 ' + s.index + ' 段' + (s.head ? ('（首句：' + s.head + '）') : '')).join('\\n');\n" +
          "return '你是翻译。本轮只翻译下面这一批段落，逐段输出，不要漏译、不要跳译、不要概括、不要自行增删内容。\\n\\n' +\n" +
          "  '翻译参数（用户已确认）：\\n' + (paramText || '（未作答）') + '\\n\\n' +\n" +
          "  '输出格式（用户已确认）：\\n' + (fmtText || '（未作答）') + '\\n\\n' +\n" +
          "  '术语表（必须统一，不得自创译法）：\\n' + (termText || '（无）') + '\\n\\n' +\n" +
          "  '本批段落（第 ' + (b.batchIndex || 1) + ' 批）：\\n' + list;",
      },
      position: { x: 1580, y: 440 },
    },
    {
      id: 'tr_batch_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是专业译者。逐段输出译文，严格对齐用户确认的输出格式与术语表。数字、单位、专有名词零改动，禁止漏译与擅自增删。',
        temperature: 0.3, maxTokens: 8000,
      },
      position: { x: 1800, y: 440 },
    },
    {
      id: 'tr_batch_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '本批译文已生成，请确认后再继续下一批',
        pages: [
          {
            question: '本批译文可以定稿吗？',
            description: '点「确认继续」进入下一批；点「拒绝并中止」会停止整条流水线，改完参数后重跑。',
            options: ['可以，继续下一批', '本批要改'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 2020, y: 440 },
    },

    // 5) 拼全稿 → 术语一致性校验（显式过一遍，不靠提示词自觉）
    {
      id: 'tr_assemble', type: 'code',
      config: {
        expression:
          "const r = ctx.get('tr_loop');\n" +
          "const parts = [];\n" +
          "if (Array.isArray(r)) {\n" +
          "  for (const it of r) {\n" +
          "    const vals = Array.isArray(it) ? it : [it];\n" +
          "    const txt = vals.filter((v) => typeof v === 'string' && v.trim()).pop();\n" +
          "    if (txt) parts.push(String(txt));\n" +
          "  }\n" +
          "}\n" +
          "const scan = ctx.get('tr_segments') || {};\n" +
          "const segments = Array.isArray(scan.segments) ? scan.segments : [];\n" +
          "return { fullText: parts.join('\\n\\n'), batches: parts.length, segments: segments.length, sourceLang: scan.sourceLang || '未知' };",
      },
      position: { x: 2020, y: 260 },
    },
    {
      id: 'tr_check_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是翻译质检员。输入是逐批译好的全稿。只做校验，不要重译：① 同一术语是否全文同一译法；② 有无漏译/跳译（段落数是否对得上）；③ 数字、日期、单位、法条编号是否与上下文自洽。输出清单：通过项 / 问题项（指出段落与原文）/ 建议改法。',
        temperature: 0.2, maxTokens: 1200,
      },
      position: { x: 2240, y: 260 },
    },
    {
      id: 'tr_manifest', type: 'code',
      config: {
        expression:
          "const asm = ctx.get('tr_assemble') || {};\n" +
          "const check = String(ctx.get('tr_check_llm') || '');\n" +
          "const lines = ['# 翻译交付清单', '', '源语言：' + (asm.sourceLang || '未知'), '段数：' + (asm.segments || 0), '完成批次：' + (asm.batches || 0), '译文字数（约）：' + String(asm.fullText || '').length, '', '## 术语一致性校验', check || '（未产出）', '', '## 译文', String(asm.fullText || '（无译文产出）')];\n" +
          "return lines.join('\\n');",
      },
      position: { x: 2460, y: 260 },
    },
    { id: 'tr_out', type: 'output', config: { key: 'delivery' }, position: { x: 2680, y: 260 } },
  ];

  const edges = [
    { id: 'tre1', source: 'tr_in', target: 'tr_scan_prompt' },
    { id: 'tre2', source: 'tr_scan_prompt', target: 'tr_scan_llm' },
    { id: 'tre3', source: 'tr_scan_llm', target: 'tr_segments' },
    { id: 'tre4', source: 'tr_segments', target: 'tr_param_confirm' },
    { id: 'tre5', source: 'tr_param_confirm', target: 'tr_format_confirm' },
    { id: 'tre6', source: 'tr_format_confirm', target: 'tr_batches' },
    { id: 'tre7', source: 'tr_batches', target: 'tr_loop' },
    { id: 'tre8', source: 'tr_loop', target: 'tr_batch_args', sourceHandle: 'loop_body', label: 'body' },
    { id: 'tre9', source: 'tr_batch_args', target: 'tr_batch_llm' },
    { id: 'tre10', source: 'tr_batch_llm', target: 'tr_batch_confirm' },
    { id: 'tre11', source: 'tr_loop', target: 'tr_assemble', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'tre12', source: 'tr_assemble', target: 'tr_check_llm' },
    { id: 'tre13', source: 'tr_check_llm', target: 'tr_manifest' },
    { id: 'tre14', source: 'tr_manifest', target: 'tr_out' },
  ];

  return { nodes, edges };
}

/**
 * 内置「有声小说流水线」：文本 → 确认配音/字幕参数 → 分段配音 + 字幕 → 时间轴校准确认 → 交付清单
 *
 * ★ 与短剧流水线一致：**不直接依赖 ffmpeg**（media_compose 需要额外的 floor 依赖）。
 *   本流水线先交付「逐段配音 + SRT 字幕 + 清单」三件套，合成成片作为可选后续步骤
 *   （缺 ffmpeg 时先调 media_install_ffmpeg），这样开箱可用、不会因为缺一个二进制整条跑不通。
 * ★ 音色分配交给 api_tts_speak 的 character 参数：同角色锁定同音色、不同角色自动区分。
 * ★ 分段文本必须先过滤掉空串再进 loop —— 空文本调 TTS 会直接报错中断整条流水线。
 */
function audiobookWorkflow() {
  const nodes = [
    {
      id: 'ab_in', type: 'input',
      config: {
        schema: {
          text: 'string（要朗读的文本；也可只写 00-source 里的文件名）',
          video: 'string（可选：视频素材的绝对路径，用于后续合成）',
        },
      },
      position: { x: 40, y: 240 },
    },

    // 1) 分段（按朗读节奏切，不要按字数平均切）
    {
      id: 'ab_seg_prompt', type: 'code',
      config: {
        expression:
          "const text = String(ctx.inputs.text || '').trim();\n" +
          "return '你是有声书制作。请把下面文本按「适合朗读的语义单元」分段（一句或一组短句一段，25-60 字），' +\n" +
          "  '并估算每段的朗读秒数（按每秒 4 字估算），同时标注语气（旁白/对白/独白）。\\n' +\n" +
          "  '只输出 JSON，不要解释、不要 markdown 代码块，形如：' +\n" +
          "  '{\"title\":\"篇名\",\"segments\":[{\"index\":1,\"text\":\"分段文本\",\"seconds\":8,\"tone\":\"旁白\"}]}\\n' +\n" +
          "  '原文：\\n' + (text || '（未提供文本：请先提示用户把文本放进 00-source 或直接粘贴。）');",
      },
      position: { x: 260, y: 240 },
    },
    {
      id: 'ab_seg_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt: '你是有声书制作。严格按用户要求只输出 JSON，不要输出任何其他文字、不要包代码块。分段不得增删原文内容。',
        temperature: 0.3, maxTokens: 4000,
      },
      position: { x: 480, y: 240 },
    },
    {
      id: 'ab_segments', type: 'code',
      config: {
        expression:
          "const raw = ctx.get('ab_seg_llm');\n" +
          "let s = String(raw == null ? '' : raw).trim();\n" +
          "s = s.replace(/^```(?:json)?\\s*/i, '').replace(/```\\s*$/, '').trim();\n" +
          "const a = s.indexOf('{'); const b = s.lastIndexOf('}');\n" +
          "if (a >= 0 && b > a) s = s.slice(a, b + 1);\n" +
          "let obj = null;\n" +
          "try { obj = JSON.parse(s); } catch (e) { obj = null; }\n" +
          "const arr = obj && Array.isArray(obj.segments) ? obj.segments : null;\n" +
          "if (!arr || !arr.length) return { ok: false, error: '模型未返回合法分段 JSON', raw: String(raw).slice(0, 300) };\n" +
          "const segments = arr.map((it, i) => ({\n" +
          "  index: Number(it && it.index) || i + 1,\n" +
          "  text: String((it && it.text) || '').trim(),\n" +
          "  seconds: Number(it && it.seconds) > 0 ? Number(it.seconds) : 5,\n" +
          "  tone: String((it && it.tone) || '旁白').trim() || '旁白',\n" +
          "})).filter((x) => x.text);\n" +
          "if (!segments.length) return { ok: false, error: '分段里没有有效文本' };\n" +
          "return { ok: true, title: String((obj && obj.title) || '').trim(), segments: segments };",
      },
      position: { x: 700, y: 240 },
    },

    // 2) 配音/字幕参数确认 —— 「每步让用户确认」的机械保证
    {
      id: 'ab_param_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '配音与字幕参数还没定，请先确认（音色/语速/字幕样式/语言）',
        pages: [
          {
            question: '音色与角色分配？',
            description: '同一角色会自动锁定同一音色。可写「旁白=女声、主角=男声」这类要求。',
            allowText: true,
            allowSupplement: true,
            required: true,
          },
          {
            question: '语速（-10 到 10，0 为原速）？',
            allowText: true,
            required: false,
          },
          {
            question: '字幕样式与语言？',
            description: '如「中文，每行不超过 18 字」。',
            allowText: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 920, y: 240 },
    },

    // 3) 纯数组给 loop
    {
      id: 'ab_list', type: 'code',
      config: {
        expression:
          "const r = ctx.get('ab_segments');\n" +
          "return Array.isArray(r && r.segments) ? r.segments : [];",
      },
      position: { x: 1140, y: 240 },
    },
    {
      id: 'ab_loop', type: 'loop',
      config: { maxIterations: 60, iterateKey: 'seg', bodyExpr: '' },
      position: { x: 1360, y: 240 },
    },
    // loop body 首节点：从 ctx.inputs.seg 取本段；语速从已确认的向导作答里解析
    {
      id: 'ab_tts_args', type: 'code',
      config: {
        expression:
          "const s = ctx.inputs.seg || {};\n" +
          "const c = ctx.get('ab_param_confirm') || {};\n" +
          "const answers = Array.isArray(c.answers) ? c.answers : [];\n" +
          "const rateText = answers.filter((a) => /语速|rate/i.test(String((a && a.question) || '')))\n" +
          "  .map((a) => String((a && a.answer) || '')).join(' ');\n" +
          "const m = rateText.match(/[+-]?\\d{1,2}/);\n" +
          "let rate = m ? Number(m[0]) : 0;\n" +
          "if (rate > 10) rate = 10; if (rate < -10) rate = -10;\n" +
          "const text = String(s.text || '').trim();\n" +
          "if (!text) return null;\n" +
          "return { text: text, character: String(s.tone || '旁白'), rate: rate };",
      },
      position: { x: 1360, y: 420 },
    },
    {
      id: 'ab_tts', type: 'tool',
      config: { toolSource: 'api', toolName: 'api_tts_speak', arguments: {} },
      position: { x: 1580, y: 420 },
    },

    // 4) 字幕：按分段秒数累加生成 SRT
    {
      id: 'ab_srt_args', type: 'code',
      config: {
        expression:
          "const r = ctx.get('ab_segments');\n" +
          "const segs = (r && r.segments) || [];\n" +
          "const cues = segs.map((s) => ({ text: String(s.text || '').trim(), duration: Number(s.seconds) || 5 })).filter((c) => c.text);\n" +
          "return cues.length ? { cues: cues } : null;",
      },
      position: { x: 1800, y: 240 },
    },
    {
      id: 'ab_srt', type: 'tool',
      config: { toolSource: 'api', toolName: 'api_srt_generate', arguments: {} },
      position: { x: 2020, y: 240 },
    },

    // 5) 时间轴校准确认（音画对不上就白合成，必须前置确认）
    {
      id: 'ab_timeline_confirm', type: 'human_confirm',
      config: {
        kind: 'confirm',
        question: '分段配音与字幕已生成，请确认时间轴与音色是否合适，确认后再出交付清单',
        pages: [
          {
            question: '时间轴与音色是否可以定稿？',
            description: '点「确认继续」出交付清单；点「拒绝并中止」停止流水线，改完参数后重跑。',
            options: ['可以定稿', '要调整'],
            allowText: true,
            allowSupplement: true,
            required: true,
          },
        ],
        onReject: 'abort',
      },
      position: { x: 2240, y: 240 },
    },
    {
      id: 'ab_manifest', type: 'code',
      config: {
        expression:
          "const r = ctx.get('ab_segments') || {};\n" +
          "const segs = Array.isArray(r.segments) ? r.segments : [];\n" +
          "const video = String(ctx.inputs.video || '').trim();\n" +
          "const roles = Array.from(new Set(segs.map((s) => s.tone || '旁白')));\n" +
          "const total = segs.reduce((n, s) => n + (Number(s.seconds) || 0), 0);\n" +
          "const lines = ['# 有声小说交付清单', '', '篇名：' + (r.title || '未命名'), '分段数：' + segs.length, '预估总时长：' + total + ' 秒', '角色（各自已分配独立音色）：' + roles.join('、'), '', '| 段 | 语气 | 字数 | 预估秒数 |', '| --- | --- | --- | --- |'];\n" +
          "for (const s of segs) lines.push('| ' + s.index + ' | ' + (s.tone || '旁白') + ' | ' + String(s.text || '').length + ' | ' + (s.seconds || 0) + ' |');\n" +
          "lines.push('', '已产出：每段 1 段配音 + 1 份 SRT 字幕。');\n" +
          "lines.push(video ? ('视频素材：' + video) : '视频素材：未提供（如需成片，请把视频放进 00-source 后重跑）。');\n" +
          "lines.push('合成成片：再调 media_compose（op: dub / subtitle / concat）；subtitle 务必传 title（项目名称，长标题默认自适应缩字不溢出，要滚动传 titleFit=\"scroll\"），subtitleFontSize 不要显式传（默认 88 已合适，传 34 这类小值会变成超大字幕）；缺 ffmpeg 时先调 media_install_ffmpeg。');\n" +
          "lines.push('★ 防黑屏规约：素材切片前先对源片跑 blackdetect（ffmpeg -skip_frame nokey -i 源片 -vf blackdetect=d=1.5:pix_th=0.10 -an -f null -），切分点必须避开黑场区间；每个成品场景切片要自检（同一命令），**开头/结尾/中间任何 >1.5s 的黑段都不允许交付**——切到黑场就平移切点重切，不要用黑底补时长。');\n" +
          "return lines.join('\\n');",
      },
      position: { x: 2460, y: 240 },
    },
    { id: 'ab_out', type: 'output', config: { key: 'delivery' }, position: { x: 2680, y: 240 } },
  ];

  const edges = [
    { id: 'abe1', source: 'ab_in', target: 'ab_seg_prompt' },
    { id: 'abe2', source: 'ab_seg_prompt', target: 'ab_seg_llm' },
    { id: 'abe3', source: 'ab_seg_llm', target: 'ab_segments' },
    { id: 'abe4', source: 'ab_segments', target: 'ab_param_confirm' },
    { id: 'abe5', source: 'ab_param_confirm', target: 'ab_list' },
    { id: 'abe6', source: 'ab_list', target: 'ab_loop' },
    { id: 'abe7', source: 'ab_loop', target: 'ab_tts_args', sourceHandle: 'loop_body', label: 'body' },
    { id: 'abe8', source: 'ab_tts_args', target: 'ab_tts' },
    { id: 'abe9', source: 'ab_loop', target: 'ab_srt_args', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'abe10', source: 'ab_srt_args', target: 'ab_srt' },
    { id: 'abe11', source: 'ab_srt', target: 'ab_timeline_confirm' },
    { id: 'abe12', source: 'ab_timeline_confirm', target: 'ab_manifest' },
    { id: 'abe13', source: 'ab_manifest', target: 'ab_out' },
  ];

  return { nodes, edges };
}

/**
 * 幂等 seed：
 * - 不存在 → 插入；
 * - 存在且 version < WF_DEF_VERSION → 覆盖（下发定义修正，如还原被改坏的画布）；
 * - 其余情况跳过，保护用户在画布上的编辑。
 */
export function seedBuiltinWorkflowAgents(db: YzSqliteDb): { seeded: string[]; restored: string[] } {
  const seeded: string[] = [];
  const restored: string[] = [];
  const defs = [
    {
      id: WF_SUB_ID,
      name: '调研要点提炼子助手',
      description: '供「调研报告生成助手」的 sub_agent 节点调用：input → code → output，从主题提炼现状/驱动/风险三方面要点',
      workflow: subWorkflow(),
    },
    {
      id: WF_MAIN_ID,
      name: '调研报告生成助手',
      description:
        '以真实调研流程覆盖全部 10 种节点：input(主题) → code(生成提纲) → tool(内置 task_plan) → code(拆分维度) → loop(逐维度加工) → ' +
        'memory_write(归档) → memory_read(回查) → condition(有归档: 子智能体提炼 → LLM 成稿 / 否则: code 兜底) → output。入参 { "topic": "..." }。',
      workflow: mainWorkflow(),
    },
    {
      id: WF_DRAMA_ID,
      name: '短剧流水线',
      description:
        '一句话主题 → 成片素材：LLM 出分镜表（含角色）→ loop 逐镜生图 + 按角色配音 → 生成字幕 SRT → 交付清单。' +
        '入参 { "topic": "...", "roles": ["女主","男主","旁白"] }（roles 可选，不传则自动设计角色）。' +
        '同一角色的台词会自动锁定同一音色、不同角色分配不同音色。' +
        '产出每镜 1 图 + 1 段音频 + SRT；合成成片再调 media_compose（缺 ffmpeg 时先 media_install_ffmpeg）。',
      workflow: dramaWorkflow(),
    },
    {
      id: WF_NOVEL_ID,
      name: '小说改写流水线',
      description:
        '原文 → 改写目标确认（风格/人称/篇幅/受众）→ 大纲确认 → 分批改写（每批确认）→ 一致性检查 → 成稿。' +
        '入参 { "source": "原文或 00-source 里的文件名", "goal": "可选改写方向" }。' +
        '两道人工确认点（目标、大纲）与逐批确认都在图上，不确认物理上走不到下一步；批次大小从向导里问，默认每批 3 章。',
      workflow: novelWorkflow(),
    },
    {
      id: WF_TRANSLATE_ID,
      name: '翻译流水线',
      description:
        '原文 → 语种/术语/风格确认 → 输出格式确认 → 分批翻译（每批确认）→ 术语一致性校验 → 译文。' +
        '入参 { "source": "原文或 00-source 里的文件名", "targetLang": "可选目标语言", "glossary": "可选既有术语表（一行一条 源词=译词）" }。' +
        '术语表由首轮自动抽取、交用户过一遍再锁定；输出格式（对照/纯译文）前置确认，避免整稿返工。',
      workflow: translateWorkflow(),
    },
    {
      id: WF_AUDIOBOOK_ID,
      name: '有声小说流水线',
      description:
        '文本 → 确认配音/字幕参数（音色/语速/字幕样式）→ 分段配音 + 字幕（loop 逐段）→ 时间轴校准确认 → 交付清单。' +
        '入参 { "text": "要朗读的文本或 00-source 里的文件名", "video": "可选视频素材绝对路径" }。' +
        '同语气（角色）自动锁定同一音色；产出每段 1 段配音 + 1 份 SRT。' +
        '★ 不直接依赖 ffmpeg：先交付「配音 + 字幕」三件套，合成成片再调 media_compose（缺 ffmpeg 时先 media_install_ffmpeg）。',
      workflow: audiobookWorkflow(),
    },
  ];
  const has = db.prepare('SELECT id, version FROM agent WHERE id = ?');
  const insert = db.prepare(
    "INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, is_default, is_public, version, workflow_json, created_at, updated_at) VALUES (?, 'guest', ?, ?, NULL, 'workflow', '[]', '[]', 0, 1, ?, ?, ?, ?)"
  );
  const update = db.prepare(
    'UPDATE agent SET name = ?, description = ?, version = ?, workflow_json = ?, updated_at = ? WHERE id = ?'
  );
  for (const d of defs) {
    try {
      const now = Date.now();
      const row = has.get(d.id) as { id: string; version: number } | undefined;
      if (!row) {
        insert.run(d.id, d.name, d.description, WF_DEF_VERSION, JSON.stringify(d.workflow), now, now);
        seeded.push(d.id);
      } else if ((row.version ?? 1) < WF_DEF_VERSION) {
        update.run(d.name, d.description, WF_DEF_VERSION, JSON.stringify(d.workflow), now, d.id);
        restored.push(d.id);
      }
    } catch (e) {
      console.warn(`[builtin-wf] seed ${d.id} 失败:`, e);
    }
  }
  return { seeded, restored };
}

/**
 * LLM 节点模型自动回填：platformId/modelId 为空时，优先 agnes 平台的 flash 模型（免费额度友好）。
 * 覆盖全部内置工作流 —— 此前只处理 WF_MAIN_ID，新增工作流的 llm 节点会因缺模型在运行时报
 * 「LLM 节点缺少 platformId/modelId」。
 */
export function ensureBuiltinWorkflowModel(db: YzSqliteDb): { filled: boolean } {
  let anyFilled = false;
  // 优先 agnes 平台 + flash；退而求其次任何平台的 flash；再退任意平台首个模型。
  // **必须取 id（主键）**：运行时按主键解析模型，写 model_id（裸名）会直接报
  // 「模型不存在」——这正是短剧流水线曾经跑不起来的原因（裸名 agnes-3.0-flash
  // 对不上主键 agens-guest-agnes-3.0-flash）。model_id 只作展示与 API 传参。
  const pick = (sql: string) => db.prepare(sql).get() as { id: string; platform_id: string; model_id: string } | undefined;
  // ★ 必须覆盖**全部**内置工作流：漏一个 → 它的 llm 节点缺模型 → 运行时直接报
  //   「LLM 节点缺少 platformId/modelId」整条流水线跑不起来（短剧流水线曾因此踩过）。
  for (const agentId of [WF_MAIN_ID, WF_DRAMA_ID, WF_NOVEL_ID, WF_TRANSLATE_ID, WF_AUDIOBOOK_ID]) {
    try {
      const row = db.prepare('SELECT workflow_json FROM agent WHERE id = ?').get(agentId) as { workflow_json: string } | undefined;
      if (!row) continue;
      const wf = JSON.parse(row.workflow_json);
      const llms = (wf.nodes || []).filter((n: { type: string }) => n.type === 'llm');
      if (!llms.length) continue;
      // 每个 llm 节点独立判断：节点自带模型且**能解析到**（主键或存量 API 名）才跳过。
      // 存量裸名也算「有模型」，交由下面的规范化改写，否则会误判为「缺模型」
      // 并整批覆盖用户已选的模型。
      const need = llms.filter((llm: any) => {
        if (!llm.config) return false;
        const cur = llm.config.modelId;
        if (!cur) return true;
        return !normalizeModelId(db, cur, llm.config.platformId);
      });
      // 规范化：即便不需要回填，也要把存量裸名改写成主键（幂等，仅在有变化时才写库）。
      // 写库必须写主键 —— 运行时按主键解析，继续存 API 名会让脏数据长期被依赖。
      let normalized = false;
      for (const llm of llms) {
        const cur = llm.config?.modelId;
        if (!cur) continue;
        const pk = normalizeModelId(db, cur, llm.config.platformId);
        if (pk && pk !== cur) {
          llm.config.modelId = pk;
          normalized = true;
        }
      }

      if (need.length) {
        const m =
          pick("SELECT id, platform_id, model_id FROM model WHERE (platform_id LIKE 'agens-%' OR platform_id LIKE 'agnes-%') AND model_id LIKE '%flash%' ORDER BY (model_id = 'agnes-3.0-flash') DESC LIMIT 1") ||
          pick("SELECT id, platform_id, model_id FROM model WHERE model_id LIKE '%flash%' LIMIT 1") ||
          pick('SELECT id, platform_id, model_id FROM model LIMIT 1');
        if (!m) continue;
        for (const llm of need) {
          llm.config.platformId = m.platform_id;
          llm.config.modelId = m.id; // 主键，非 model_id
        }
      } else if (!normalized) {
        continue; // 既不需要回填也没有需要规范化的值
      }

      db.prepare('UPDATE agent SET workflow_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(wf), Date.now(), agentId);
      anyFilled = true;
    } catch (e) {
      console.warn(`[builtin-wf] 回填 ${agentId} 的 LLM 模型失败:`, e);
    }
  }
  return { filled: anyFilled };
}

/**
 * 历史遗留诊断数据清理：删除手动创建的 workflow 调试智能体 `diag_min_loop`。
 *
 * 它不在任何内置定义里（全仓源码零命中），只存在于老开发库与桌面 IPC 库中，
 * 是 2026-09 排查 loop 节点时手工建的 5 节点最小载体，无业务价值。
 * 靠 seed 清不掉（seed 只管自己那三个内置工作流），所以在这里显式清一次；
 * 删完之后 WHERE 不再命中，天然幂等，无需 app_config 标记位。
 *
 * 三处保留逻辑：
 * 1. **只删 is_builtin = 0 的**：万一将来有内置智能体复用了这个 id，不动它。
 * 2. **会话不能连带删**：`conversation.agent_id = 'diag_min_loop'` 上挂着真实用户对话
 *    （历史遗留 bug：设计创意场景建的会话被错写成这个 id）。直接删 agent 会留下悬空
 *    agent_id —— 会话能读出、提示词也因 conversation.system_prompt 快照而不丢，但
 *    agent 级工具挂载 / 子智能体 / MCP 挂载会全线失效（`buildSystemPromptForBackend`
 *    与 `buildToolsForBackend` 都靠这个 id 查 agent 行，查不到就静默降级为空）。
 *    因此先把会话重绑回真正的智能体，再删。
 * 3. **workflow_run 一并清**：纯诊断运行记录，agent 都删了留着没意义。
 *
 * 重绑目标靠「会话提示词快照与内置智能体提示词比对」推断，命中不了再退默认助手。
 * 注意快照**不是** agent 提示词的副本：前端选场景时会把场景后缀（如「## 当前场景：设计创意…」）
 * 拼在 agent 提示词之后一起写进 conversation.system_prompt，所以两者是「前缀 + 后缀」关系，
 * 精确相等永远匹配不上 —— 必须按前缀匹配，并取最长命中（避免短提示词误吃其它会话）。
 * 命中不了再退默认助手，不写死具体 id，避免把「哪个场景建的会话」焊死在清理逻辑里。
 */
export function cleanupLegacyDiagAgents(db: YzSqliteDb): { deletedAgents: number; reboundConversations: number; deletedRuns: number } {
  const result = { deletedAgents: 0, reboundConversations: 0, deletedRuns: 0 };
  try {
    const row = db.prepare('SELECT id FROM agent WHERE id = ? AND is_builtin = 0').get(LEGACY_DIAG_AGENT_ID);
    if (!row) return result;

    // 1) 先把挂在该 id 上的会话重绑，避免删完留下悬空引用
    const convs = db.prepare('SELECT id, system_prompt FROM conversation WHERE agent_id = ?').all(LEGACY_DIAG_AGENT_ID) as {
      id: string;
      system_prompt: string | null;
    }[];
    if (convs.length) {
      // 候选按提示词长度降序：先比长的，保证「包含另一条提示词」时选中更具体的那个
      const candidates = (
        db
          .prepare("SELECT id, system_prompt FROM agent WHERE is_builtin = 1 AND agent_kind = 'main' AND type = 'harness' AND system_prompt IS NOT NULL")
          .all() as { id: string; system_prompt: string }[]
      )
        .map((a) => ({ id: a.id, prompt: a.system_prompt.trim() }))
        .filter((a) => a.prompt.length > 0)
        .sort((a, b) => b.prompt.length - a.prompt.length);
      const fallback = db.prepare("SELECT id FROM agent WHERE id = 'a_default_assistant'").get() as { id: string } | undefined;
      const upd = db.prepare('UPDATE conversation SET agent_id = ?, updated_at = ? WHERE id = ?');
      for (const c of convs) {
        const snap = (c.system_prompt || '').trim();
        // 快照 = agent 提示词 + 可选场景后缀 → 用 startsWith 判定归属
        const hit = snap ? candidates.find((a) => snap.startsWith(a.prompt)) : undefined;
        const targetId = hit?.id || fallback?.id;
        if (!targetId) continue;
        upd.run(targetId, Date.now(), c.id);
        result.reboundConversations++;
      }
    }

    // 2) 清掉它的运行记录（纯诊断数据）
    result.deletedRuns = db.prepare('DELETE FROM workflow_run WHERE agent_id = ?').run(LEGACY_DIAG_AGENT_ID).changes;

    // 3) 最后删智能体本体
    result.deletedAgents = db.prepare('DELETE FROM agent WHERE id = ? AND is_builtin = 0').run(LEGACY_DIAG_AGENT_ID).changes;
  } catch (e) {
    console.warn('[builtin-wf] 清理遗留诊断智能体失败:', e);
  }
  return result;
}
