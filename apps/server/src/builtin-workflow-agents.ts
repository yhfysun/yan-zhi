// 内置「调研报告生成助手」智能体：server 启动时幂等 seed。
// 定义版本 WF_DEF_VERSION 升级时强制覆盖库中副本（用于下发修正），平时仅首次创建、不覆盖用户编辑。
// 一条 DAG 以真实调研流程覆盖引擎全部 10 种节点类型：
//   input(主题) → code(生成提纲) → tool(builtin task_plan) → code(拆分调研维度)
//        → loop(loop_body: code 逐维度加工 / loop_exit: 继续)
//        → memory_write(归档) → memory_read(回查历史) → condition(true: sub_agent → llm 成稿 / false: code 兜底)
//        → output(调研报告)
import type Database from 'better-sqlite3';

export const WF_MAIN_ID = 'a_wf_smoke_all_nodes';
export const WF_SUB_ID = 'a_wf_smoke_editor';
/** 内置「短剧流水线」：一句话 → 分镜 → 逐镜出图配音 → 字幕 → 交付清单。 */
export const WF_DRAMA_ID = 'a_wf_drama_pipeline';
/** 内置工作流定义版本：内容/结构修正时 +1，seed 会覆盖库中旧副本。 */
export const WF_DEF_VERSION = 5;
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
    { id: 'de4', source: 'd_shots', target: 'd_list' },
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
 * 幂等 seed：
 * - 不存在 → 插入；
 * - 存在且 version < WF_DEF_VERSION → 覆盖（下发定义修正，如还原被改坏的画布）；
 * - 其余情况跳过，保护用户在画布上的编辑。
 */
export function seedBuiltinWorkflowAgents(db: Database.Database): { seeded: string[]; restored: string[] } {
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
export function ensureBuiltinWorkflowModel(db: Database.Database): { filled: boolean } {
  let anyFilled = false;
  // 优先 agnes 平台 + flash；退而求其次任何平台的 flash；再退任意平台首个模型
  const pick = (sql: string) => db.prepare(sql).get() as { platform_id: string; model_id: string } | undefined;
  for (const agentId of [WF_MAIN_ID, WF_DRAMA_ID]) {
    try {
      const row = db.prepare('SELECT workflow_json FROM agent WHERE id = ?').get(agentId) as { workflow_json: string } | undefined;
      if (!row) continue;
      const wf = JSON.parse(row.workflow_json);
      const llms = (wf.nodes || []).filter((n: { type: string }) => n.type === 'llm');
      if (!llms.length) continue;
      // 每个 llm 节点独立判断：节点自带模型且库中存在则跳过该节点
      const need = llms.filter((llm: any) => {
        if (!llm.config) return false;
        if (!llm.config.modelId) return true;
        const hasModel = db.prepare('SELECT id FROM model WHERE platform_id = ? AND model_id = ?').get(llm.config.platformId, llm.config.modelId);
        return !hasModel;
      });
      if (!need.length) continue;
      const m =
        pick("SELECT platform_id, model_id FROM model WHERE (platform_id LIKE 'agens-%' OR platform_id LIKE 'agnes-%') AND model_id LIKE '%flash%' ORDER BY (model_id = 'agnes-3.0-flash') DESC LIMIT 1") ||
        pick("SELECT platform_id, model_id FROM model WHERE model_id LIKE '%flash%' LIMIT 1") ||
        pick('SELECT platform_id, model_id FROM model LIMIT 1');
      if (!m) continue;
      for (const llm of need) {
        llm.config.platformId = m.platform_id;
        llm.config.modelId = m.model_id;
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
export function cleanupLegacyDiagAgents(db: Database.Database): { deletedAgents: number; reboundConversations: number; deletedRuns: number } {
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
