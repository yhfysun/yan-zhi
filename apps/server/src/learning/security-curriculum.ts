import { SECURITY_MODULE_EXTRA_LABS, SECURITY_MODULE_LESSONS } from './security-lessons.js';

export type SecurityCodeExample = {
  language: string;
  /** 明确这份代码/配置属于哪个工具或教学模型 */
  context?: string;
  /** 这段示例对应的业务应用、运行环境或靶场 */
  application?: string;
  /** 示例产物类型，例如 Nginx 配置、Docker Compose 配置或应用代码 */
  exampleKind?: string;
  badLabel?: string;
  goodLabel?: string;
  bad: string;
  good: string;
  note: string;
  variants?: SecurityCodeVariant[];
};

export type SecurityCodeVariant = {
  language: string;
  bad: string;
  good: string;
  note: string;
};

export type SecurityLesson = {
  objectives: string[];
  keyTerms: Array<{ term: string; explanation: string }>;
  walkthrough: Array<{ title: string; detail: string }>;
  knowledgeChecks: Array<{ question: string; answer: string }>;
};

export type SecurityLab = {
  target: string;
  tools: string[];
  steps: string[];
  expected: string;
  commands?: string[];
};

export type SecurityModule = {
  id: string;
  title: string;
  summary: string;
  useCase?: string;
  explanation?: string;
  lesson?: SecurityLesson;
  topics: string[];
  risk: string;
  control: string;
  lab?: SecurityLab;
  code?: SecurityCodeExample;
};

export type SecurityPath = {
  id: string;
  name: string;
  level: '入门' | '进阶' | '高级';
  description: string;
  audience: string;
  prerequisites: string[];
  nextPathIds: string[];
  tags: string[];
  modules: SecurityModule[];
};

export const SECURITY_PATHS: SecurityPath[] = [
  {
    id: 'sec_fundamentals',
    name: '安全基础与威胁建模',
    level: '入门',
    description: '先建立资产、信任边界和威胁模型，再学习认证、网络分段与日志基础。',
    audience: '开发、运维、安全初学者',
    prerequisites: [],
    nextPathIds: ['sec_web', 'sec_defense'],
    tags: ['STRIDE', '身份认证', '最小权限', 'TLS'],
    modules: [
      {
        id: 'sec_fund_threat_model',
        title: '用 STRIDE 做威胁建模',
        summary: '从资产和信任边界出发，识别欺骗、篡改、抵赖、信息泄露、拒绝服务和权限提升。',
        topics: ['资产清单', '信任边界', '数据流图', '威胁优先级'],
        risk: '只做漏洞扫描、不先定义资产和边界，容易漏掉业务逻辑与权限设计风险。',
        control: '每个入口都标注输入、身份、数据敏感度和可执行动作，威胁与滥用场景和正常用例一起评审。',
      },
      {
        id: 'sec_fund_auth',
        title: '身份认证与会话安全',
        summary: '理解密码哈希、MFA、会话 Cookie、令牌过期和登录限速。',
        topics: ['Argon2/bcrypt', 'MFA', 'httpOnly Cookie', '登录限速'],
        risk: '明文密码、长期令牌和无限尝试会让撞库与账号接管风险放大。',
        control: '密码使用慢哈希，会话 Cookie 设置 Secure/httpOnly/sameSite，登录与重置接口限速。',
        code: {
          language: 'typescript',
          bad: "res.cookie('session', token, { maxAge: 30 * 86400000 });",
          good: "res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 8 * 3600000 });",
          note: '会话 Cookie 不暴露给脚本，并缩短有效期。',
        },
      },
      {
        id: 'sec_fund_network',
        title: '网络分段与传输安全',
        summary: '区分公网、应用层、数据层和管理平面，避免一个入口失守后横向移动。',
        topics: ['网络分区', 'TLS', '管理面隔离', '出站白名单'],
        risk: '数据库、缓存和管理接口直接暴露公网，攻击面会显著扩大。',
        control: '默认拒绝、按需放行；管理面只允许受控网络；服务间 TLS 与出站白名单。',
      },
      {
        id: 'sec_fund_logging',
        title: '安全日志与最小权限',
        summary: '记录关键身份与权限事件，同时避免日志泄露令牌、密码和完整个人信息。',
        topics: ['审计事件', '日志脱敏', 'RBAC', '最小权限'],
        risk: '日志缺失无法追责，日志过全又会造成敏感信息二次泄露。',
        control: '记录 who/what/when/result，过滤令牌与密码，权限按角色最小化并可审计。',
        code: {
          language: 'typescript',
          bad: 'logger.info({ url, headers, body });',
          good: "logger.info({ method, path, status, userId, requestId });",
          note: '只记录排障所需字段，不记录 Authorization、Cookie 和密码。',
        },
      },
    ],
  },
  {
    id: 'sec_web',
    name: 'Web 漏洞与攻击防御',
    level: '进阶',
    description: '围绕 OWASP 高频风险学习攻击原理、验证边界和修复代码。',
    audience: '前后端开发、测试、安全工程',
    prerequisites: ['sec_fundamentals'],
    nextPathIds: ['sec_pentest', 'sec_devsecops'],
    tags: ['SQL 注入', 'XSS', 'IDOR', 'SSRF'],
    modules: [
      {
        id: 'sec_web_sqli',
        title: 'SQL 注入：从拼接走向参数化',
        summary: '识别字符串拼接查询的风险，理解参数化查询和最小数据库权限。',
        topics: ['参数化查询', '输入校验', '最小数据库权限', '错误隐藏'],
        risk: '把用户输入拼进 SQL，可能绕过条件、读取或修改未授权数据。',
        control: '所有值参数化，表名与排序字段使用白名单映射，数据库账号只授予必要权限。',
        code: {
          language: 'typescript',
          bad: "db.query(`SELECT * FROM users WHERE email = '${email}'`);",
          good: "db.query('SELECT id, email FROM users WHERE email = $1', [email]);",
          note: '参数值不参与 SQL 语法解析；返回字段也使用明确白名单。',
        },
        lab: {
          target: '本地 OWASP WebGoat 或 Juice Shop（127.0.0.1）',
          tools: ['浏览器 DevTools', 'Burp Repeater', 'sqlmap（仅本地靶场）', 'curl'],
          steps: [
            '启动本地靶场，只使用教程提供的测试账号和测试数据。',
            '在 Burp 中拦截搜索请求，记录原始 URL、参数和响应状态。',
            '修改单个测试参数观察错误响应差异，不对参数做批量枚举。',
            '对 127.0.0.1 的单个练习端点运行 sqlmap，限制 --risk=1 --level=1 --batch。',
            '应用参数化修复后，用同一最小请求验证注入条件失效。',
          ],
          expected: '注入前后响应差异可复现，修复后同一请求不再改变查询语义。',
        },
      },
      {
        id: 'sec_web_xss',
        title: 'XSS：输出编码与 CSP',
        summary: '区分 HTML、属性、URL 和脚本上下文，优先使用框架自动转义。',
        topics: ['输出编码', 'CSP', '富文本消毒', 'Cookie 隔离'],
        risk: '把不可信内容直接当 HTML 插入，可能执行攻击者脚本或窃取页面数据。',
        control: '默认文本渲染；富文本使用可信消毒库；CSP 限制脚本源；敏感 Cookie 加 httpOnly。',
        code: {
          language: 'typescript',
          bad: 'container.innerHTML = userComment;',
          good: 'container.textContent = userComment;',
          note: '必须渲染 HTML 时使用 DOMPurify 等消毒库，并配合 CSP。',
        },
        lab: {
          target: '本地 OWASP Juice Shop 评论/搜索练习',
          tools: ['浏览器 DevTools', 'Burp Repeater', 'CSP Evaluator'],
          steps: [
            '在本地靶场输入固定的无害测试字符串，观察它被渲染到哪个上下文。',
            '用 DevTools 检查 DOM 和响应头，确认是否存在直接 HTML 插入。',
            '应用 textContent 或消毒库后，重复同一测试字符串。',
            '添加 CSP 响应头，再检查被拦截的资源与报告。',
          ],
          expected: '测试字符串只作为文本显示，CSP 不再允许未知脚本源。',
        },
      },
      {
        id: 'sec_web_access',
        title: '越权与 IDOR：服务端授权',
        summary: '每个对象访问都在服务端校验当前主体是否有权限，不能只隐藏前端按钮。',
        topics: ['对象级授权', '租户隔离', 'RBAC', '审计'],
        risk: '只按对象 ID 查询而不校验归属，会泄露或修改其他用户资源。',
        control: '查询条件同时绑定 tenantId/userId，敏感动作二次校验角色并记录审计。',
        code: {
          language: 'typescript',
          bad: 'const doc = await docs.findById(req.params.id);',
          good: "const doc = await docs.findOne({ id: req.params.id, tenantId: req.user.tenantId });\nif (!doc) return res.sendStatus(404);",
          note: '统一返回 404 可减少资源枚举信息。',
        },
        lab: {
          target: '本地靶场双测试账号',
          tools: ['浏览器 DevTools', 'Burp Repeater', 'curl'],
          steps: [
            '分别登录账号 A 和 B，记录各自唯一的测试对象 ID。',
            '用账号 A 的会话只替换一次对象 ID 为 B 的测试对象。',
            '记录状态码和响应体长度，不批量枚举、不修改数据。',
            '修复后同一请求应返回 404，A 访问自己的对象仍返回 200。',
          ],
          expected: '对象级授权在服务端生效，前后端隐藏按钮不再被当作安全边界。',
        },
      },
      {
        id: 'sec_web_ssrf',
        title: 'SSRF：服务端拉取 URL 的边界',
        summary: '当服务端代理图片、Webhook 或链接预览时，限制协议、域名和解析后的地址。',
        topics: ['URL 白名单', '私网地址拦截', 'DNS 重绑定', '禁止重定向'],
        risk: '服务端可能被诱导访问内网、云元数据或本机管理接口。',
        control: '仅 HTTPS、主机白名单、解析后拒绝私网/回环地址、禁重定向并设置超时。',
        code: {
          language: 'typescript',
          bad: 'await fetch(req.body.url);',
          good: "const url = await assertSafeUrl(req.body.url);\nawait fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });",
          note: '高安全场景需固定解析后的 IP，降低 DNS 重绑定窗口。',
        },
        lab: {
          target: '本地 Webhook/图片代理练习端点',
          tools: ['curl', '本地 HTTP 测试服务器', 'DNS 解析工具'],
          steps: [
            '启动本地测试服务，只允许访问专门的回环测试端口。',
            '用 curl 提交一个允许域名和私网地址样本，观察拒绝策略。',
            '验证重定向、超时和响应体大小上限。',
            '检查日志只记录 URL 主机和结果，不记录敏感查询参数。',
          ],
          expected: '私网、回环、非 HTTPS 与重定向请求均被拒绝，允许域名正常访问。',
        },
      },
    ],
  },
  {
    id: 'sec_pentest',
    name: '授权渗透测试',
    level: '高级',
    description: '学习范围确认、低影响验证、证据管理和报告沟通，只在自有或授权靶场执行。',
    audience: '安全测试、红队、后端工程师',
    prerequisites: ['sec_fundamentals', 'sec_web'],
    nextPathIds: ['sec_defense'],
    tags: ['授权范围', 'ROE', '漏洞验证', '报告'],
    modules: [
      {
        id: 'sec_pentest_scope',
        title: '授权、范围与行动规则',
        summary: '测试前明确资产、时间窗、禁止动作、数据处理和紧急联系人。',
        topics: ['书面授权', '资产范围', '速率限制', '证据脱敏'],
        risk: '越过授权资产或执行高影响测试，可能造成业务中断和法律风险。',
        control: '逐项列出域名/IP/账号和时间窗；默认只做低影响验证；任何持久化或横向移动先审批。',
        lab: {
          target: '纸面演练 + 本地靶场授权模板',
          tools: ['ROE 模板', '资产清单', '变更记录'],
          steps: [
            '列出目标域名、IP、账号、时间窗和明确排除项。',
            '为每种工具设置速率、并发、禁止动作和停止条件。',
            '约定证据保存、数据脱敏和紧急联系人。',
            '由授权人确认后才启动本地靶场测试。',
          ],
          expected: '形成一份可执行、可审计、可随时停止的测试范围说明。',
        },
      },
      {
        id: 'sec_pentest_discover',
        title: '资产发现与低影响侦察',
        summary: '先用公开信息和被动资产清单理解攻击面，再在授权靶场做有限主动探测。',
        topics: ['资产清单', '服务指纹', '版本核对', '变更记录'],
        risk: '高速扫描会触发告警或影响服务；资产归属不清会导致误测第三方。',
        control: '限制并发与速率，先查 CMDB/证书/域名记录，主动探测只针对已确认资产。',
        code: {
          language: 'bash',
          bad: 'nmap -T5 --script vuln 10.0.0.0/16',
          good: 'nmap -sV --version-light -T2 --max-rate 20 127.0.0.1',
          note: '示例仅指本机授权靶场；真实资产必须按 ROE 限制速率和范围。',
        },
        lab: {
          target: '127.0.0.1 本地容器靶场',
          tools: ['nmap', 'curl', '浏览器 DevTools', 'ffuf'],
          steps: [
            '先用 curl 访问首页，记录状态码、响应头和页面标题。',
            '用 nmap 对 127.0.0.1 指定端口做低速率服务识别。',
            '用 ffuf 对靶场固定字典做小并发目录发现，限制线程数和请求速率。',
            '把发现的端点按“公开/需登录/管理”分类，停止条件为触发靶场限速或出现非测试数据。',
          ],
          expected: '得到一份有来源和响应证据的资产/端点清单，未超出本地授权范围。',
        },
      },
      {
        id: 'sec_pentest_validate',
        title: '漏洞验证与最小影响证明',
        summary: '用最小请求证明风险，不读取无关数据、不破坏状态、不扩大影响。',
        topics: ['最小复现', '证据链', '业务影响', '修复复测'],
        risk: '为证明漏洞而导出大量数据或写入持久化内容，会把测试变成事故。',
        control: '使用测试账号、单条标记数据、截图脱敏；验证后恢复状态并记录时间线。',
        lab: {
          target: '本地 OWASP Juice Shop / WebGoat',
          tools: ['浏览器 DevTools', 'Burp Repeater', 'curl'],
          steps: [
            '登录两个测试账号，分别记录各自的测试对象 ID。',
            '在 Burp Repeater 中只替换一个对象 ID，观察授权响应。',
            '不要遍历其他用户数据，也不修改真实业务记录。',
            '补上 tenantId/userId 条件后，重复同一最小请求确认返回 404。',
          ],
          expected: '越权请求从可读取变为不可读取，正常本人访问仍然成功。',
        },
      },
      {
        id: 'sec_pentest_report',
        title: '渗透报告与修复优先级',
        summary: '报告要写清复现条件、影响、证据、修复建议和复测结果，而不只是漏洞名称。',
        topics: ['风险评级', '复现步骤', '缓解措施', '复测证据'],
        risk: '只给结论不给上下文，研发无法判断根因，也难以验证修复。',
        control: '按资产和业务影响排序；区分短期缓解与根治；复测必须复用最小验证用例。',
        lab: {
          target: '前序本地靶场发现',
          tools: ['Burp Repeater', '截图工具', '报告模板'],
          steps: [
            '为每个问题记录入口、前置条件、最小复现、响应证据和影响。',
            '将证据中的 Cookie、令牌和个人信息打码。',
            '给研发提供修复建议和一个可复测的最小请求。',
            '修复后复用同一请求，记录状态码与行为变化。',
          ],
          expected: '报告能让他人独立复现、理解业务影响并验证修复。',
        },
      },
    ],
  },
  {
    id: 'sec_automation',
    name: '自动化攻防靶场',
    level: '高级',
    description: '把侦察、漏洞验证、权限流程和报告串成可重复的本地靶场流水线。',
    audience: '安全测试、DevSecOps、平台工程',
    prerequisites: ['sec_web', 'sec_pentest'],
    nextPathIds: ['sec_devsecops'],
    tags: ['Docker', 'ZAP', 'Nuclei', 'Playwright', 'CI'],
    modules: [
      {
        id: 'sec_auto_lab',
        title: '搭建隔离靶场与测试数据',
        summary: '使用本地容器启动 OWASP 靶场，固定测试账号、数据快照和网络边界。',
        topics: ['Docker Compose', '回环地址', '测试账号', '数据快照'],
        risk: '扫描公网或共享测试环境会影响他人，错误配置还可能暴露内部网络。',
        control: '目标固定为 127.0.0.1，容器无生产凭据；每次运行前恢复快照，结束后销毁容器。',
        lab: {
          target: '127.0.0.1 本地 Docker 靶场',
          tools: ['Docker Compose', 'curl'],
          steps: [
            '用 Docker Compose 启动 OWASP Juice Shop/WebGoat，只绑定 127.0.0.1。',
            '创建固定测试账号和最小测试数据，不使用真实用户信息。',
            '用 curl 检查首页、登录页和健康检查端点。',
            '记录容器版本、启动参数和停止/销毁命令。',
          ],
          expected: '靶场仅在回环地址可访问，数据可恢复，随时可销毁。',
        },
      },
      {
        id: 'sec_auto_scan',
        title: 'ZAP 与 Nuclei 自动化扫描',
        summary: '用基线扫描和模板化检测覆盖常见风险，再人工确认可达性和影响。',
        topics: ['ZAP baseline', 'Nuclei templates', '速率限制', '结果去重'],
        risk: '自动扫描结果不等于真实漏洞，高速扫描会制造噪声或破坏测试环境。',
        control: '限制速率、只扫描本地靶场、按规则 ID 去重，人工复核请求与响应证据。',
        code: {
          language: 'yaml',
          bad: 'nuclei -u https://example.com -severity low,medium,high,critical',
          good: 'nuclei -u http://127.0.0.1:3000 -severity medium,high -rate-limit 10 -jsonl report.jsonl',
          note: '示例目标固定为本地靶场；真实环境必须先获得授权并设置速率。',
        },
        lab: {
          target: '本地 OWASP 靶场',
          tools: ['OWASP ZAP', 'Nuclei'],
          steps: [
            '运行 ZAP baseline，只开启被动规则和低风险主动规则。',
            '设置每分钟请求上限，观察靶场响应时间与错误率。',
            '运行 Nuclei 的固定模板集，输出 JSONL 结果。',
            '按插件 ID、URL 和参数去重，人工复核前三条高危结果。',
            '记录哪些结果可复现、哪些是误报及原因。',
          ],
          expected: '生成可复核的扫描报告，且靶场无数据损坏、无外部流量。',
        },
      },
      {
        id: 'sec_auto_authz',
        title: 'Playwright 自动化登录与越权验证',
        summary: '用两个固定测试账号自动完成登录、对象创建和最小越权请求。',
        topics: ['Playwright', '会话隔离', '对象级授权', '断言'],
        risk: '自动化脚本泄露 Cookie、误删数据或在共享环境串号。',
        control: '每个账号独立 storageState，测试对象带唯一标记，只读取自己的对象，结束时清理测试数据。',
        code: {
          language: 'typescript',
          bad: "await request.get(`/api/docs/${otherUserId}`);",
          good: "const res = await request.get(`/api/docs/${otherTestDocId}`, { headers: { cookie: userA.session } });\nexpect([403, 404]).toContain(res.status());",
          note: '脚本只使用本次测试创建的对象，不遍历真实用户数据。',
        },
        lab: {
          target: '本地靶场双账号',
          tools: ['Playwright', 'Burp Repeater', 'curl'],
          steps: [
            '用 Playwright 分别登录 A/B 账号并保存独立会话。',
            '由 A 创建唯一测试文档，记录 ID 和清理钩子。',
            '用 A 会话请求 B 的测试文档，断言 403 或 404。',
            '修复后重跑同一测试，并保留请求、响应和 trace 证据。',
          ],
          expected: '越权自动化用例稳定复现、修复后通过，并能自动清理测试数据。',
        },
      },
      {
        id: 'sec_auto_pipeline',
        title: 'CI 中的自动化攻防与质量门',
        summary: '把本地靶场、扫描器、权限测试和报告串成流水线，设置只阻断可确认的高风险。',
        topics: ['CI 流水线', '质量门', '报告归档', '误报豁免'],
        risk: '每次发布都跑无边界扫描，会拖慢 CI、制造大量重复告警并阻塞交付。',
        control: '隔离执行、并行分片、按可达性阻断；豁免必须记录负责人、理由和复核日期。',
        code: {
          language: 'yaml',
          bad: 'run: nuclei -u https://prod.example.com || true',
          good: "run: nuclei -u http://127.0.0.1:3000 -severity high -rate-limit 10 -jsonl report.jsonl\n# 仅对已确认可达的 high/critical 阻断，并归档报告",
          note: 'CI 默认只允许本地靶场或专用 staging 地址，生产扫描需单独授权。',
        },
      },
    ],
  },
  {
    id: 'sec_languages',
    name: '多语言安全编码',
    level: '进阶',
    description: '用 C、C++、Java、Python、JavaScript、PHP、Go、Rust 对照常见安全缺陷与修复方式。',
    audience: '后端、客户端、脚本与平台开发',
    prerequisites: ['sec_fundamentals', 'sec_web'],
    nextPathIds: ['sec_devsecops'],
    tags: ['C', 'C++', 'Java', 'Python', 'JavaScript', 'PHP', 'Go', 'Rust'],
    modules: [
      {
        id: 'sec_lang_c',
        title: 'C：边界检查与安全字符串',
        summary: '处理网络输入和文件名时，先校验长度，再使用有界复制并检查返回值。',
        useCase: '嵌入式服务解析固定长度协议字段，不能假设客户端一定发送合法长度。',
        explanation: 'C 不自动管理缓冲区边界。strcpy、sprintf 和无长度校验的 read 会把输入长度直接变成内存风险；安全写法需要显式容量、终止符和错误处理。',
        topics: ['缓冲区边界', '有界复制', '返回值检查', '输入长度'],
        risk: '不检查长度的复制或格式化可能覆盖栈/堆内存，造成崩溃甚至代码执行。',
        control: '使用 snprintf/strlcpy 等有界 API，保留终止符，拒绝超长输入，编译时开启警告和内存检查。',
        code: {
          language: 'c',
          bad: "char name[32];\nstrcpy(name, user_input);",
          good: "char name[32];\nif (snprintf(name, sizeof(name), \"%s\", user_input) >= (int)sizeof(name)) {\n    return INPUT_TOO_LONG;\n}",
          note: 'snprintf 返回期望长度；大于等于缓冲区容量时必须拒绝，而不是静默截断。',
        },
        lab: {
          target: '本地编译的 C 输入解析练习',
          tools: ['gcc/clang', 'AddressSanitizer', 'gdb'],
          steps: ['用测试输入覆盖空串、最大长度和超长长度。', '开启 -fsanitize=address,undefined 重新运行。', '修复后重复同一组输入并检查返回值。'],
          expected: '超长输入被拒绝，ASan/UBSan 无越界或未定义行为报告。',
        },
      },
      {
        id: 'sec_lang_cpp',
        title: 'C++：RAII、容器与边界',
        summary: '用标准容器和智能指针减少手工内存管理，用 at()/迭代器边界表达访问假设。',
        useCase: '网络服务解析二进制消息时，需要确保长度字段与实际载荷一致。',
        explanation: 'C++ 的安全优势来自类型和生命周期管理，但裸数组、new/delete 和未校验索引仍会引入越界、泄漏和悬空指针。优先使用 vector、string、span 和 RAII 包装。',
        topics: ['RAII', 'std::vector', 'std::span', '异常安全'],
        risk: '手工 new/delete 与无边界索引在异常路径下容易泄漏或访问已释放内存。',
        control: '避免裸拥有指针，使用标准容器和智能指针，访问前校验长度，编译时启用警告与 sanitizers。',
        code: {
          language: 'cpp',
          bad: "int* values = new int[count];\nvalues[count] = 0;\ndelete[] values;",
          good: "std::vector<int> values(count);\nif (index >= values.size()) throw std::out_of_range(\"index\");\nvalues.at(index) = 0;",
          note: '容器负责生命周期；at() 对越界给出明确失败，而不是静默写坏内存。',
        },
        lab: {
          target: '本地 C++ 协议解析器',
          tools: ['clang++/g++', 'AddressSanitizer', 'UBSan'],
          steps: ['构造长度字段小于载荷和大于载荷的测试包。', '开启 sanitizer 运行解析器。', '改用 vector/span 并在边界处拒绝异常长度。'],
          expected: '异常长度被拒绝，无越界、泄漏或未定义行为。',
        },
      },
      {
        id: 'sec_lang_java',
        title: 'Java：PreparedStatement 与对象授权',
        summary: '数据库查询参数化，对外对象访问同时校验 tenantId/userId，避免只信任请求 ID。',
        useCase: 'Spring Boot 订单接口按 orderId 查询详情，必须防止用户修改 ID 读取他人订单。',
        explanation: 'Java 生态常用 ORM 或 JDBC，但字符串拼接、SpEL 动态表达式和不安全反序列化仍会造成注入。对象级授权应在服务层而非控制器注释中完成。',
        topics: ['JDBC PreparedStatement', '对象授权', '反序列化', '输入校验'],
        risk: '拼接 SQL 或只按主键查询会带来注入和 IDOR；不安全反序列化可能导致远程代码执行。',
        control: '参数化 SQL、服务层授权、反序列化白名单，以及 Bean Validation 边界校验。',
        code: {
          language: 'java',
          bad: 'String sql = "SELECT * FROM orders WHERE id = " + id;\nreturn jdbc.query(sql);',
          good: "String sql = \"SELECT * FROM orders WHERE id = ? AND tenant_id = ?\";\nreturn jdbc.query(sql, ps -> {\n    ps.setLong(1, id);\n    ps.setLong(2, currentUser.tenantId());\n}, orderMapper);",
          note: 'SQL 结构固定，值参数化；授权条件与查询一起执行。',
        },
        lab: {
          target: '本地 Spring Boot/Juice Shop 练习',
          tools: ['JDK', 'Maven/Gradle', 'Burp Repeater'],
          steps: ['用两个测试账号创建订单。', '用账号 A 的会话只替换一次订单 ID。', '修复后重复请求应返回 404。'],
          expected: '跨租户访问失败，本人访问正常。',
        },
      },
      {
        id: 'sec_lang_python',
        title: 'Python：subprocess 与文件路径',
        summary: '不要用 shell=True 拼接用户输入；优先参数列表、路径规范化和允许列表。',
        useCase: '自动化脚本需要调用 ffmpeg 处理用户选择的文件，文件名和参数都不可信。',
        explanation: 'Python 的动态字符串非常方便，也容易把用户输入带进 shell、SQL、模板表达式或路径。安全边界需要显式参数化、路径解析和命令允许列表。',
        topics: ['subprocess 参数列表', 'shell=False', '路径穿越', '允许列表'],
        risk: 'shell=True 加字符串拼接会让文件名中的元字符变成命令；未限制的路径可能穿越目录。',
        control: '使用参数列表和 shell=False，只允许固定命令与参数类型，文件路径 resolve 后校验根目录。',
        code: {
          language: 'python',
          bad: "os.system(f'ffmpeg -i {user_file} output.mp4')",
          good: "path = (BASE_DIR / user_file).resolve()\nif BASE_DIR.resolve() not in path.parents:\n    raise ValueError('outside base directory')\nsubprocess.run(['ffmpeg', '-i', str(path), 'output.mp4'], check=True, shell=False)",
          note: '参数列表避免 shell 解析；路径必须解析后校验父目录。',
        },
        lab: {
          target: '本地脚本练习目录',
          tools: ['Python', 'pytest', '临时目录'],
          steps: ['用普通文件名、带空格文件名和 ../ 路径测试函数。', '断言越界路径被拒绝。', '确认命令参数没有被 shell 解释。'],
          expected: '正常文件处理成功，越界和 shell 元字符输入失败。',
        },
      },
      {
        id: 'sec_lang_javascript',
        title: 'JavaScript：DOM XSS 与服务端请求',
        summary: '文本使用 textContent，服务端代理 URL 使用主机白名单和超时。',
        useCase: '前端展示用户昵称，Node 服务提供链接预览功能。',
        explanation: 'JavaScript 同时运行在浏览器和服务端：innerHTML 与 eval 是 DOM 风险入口，服务端 fetch 用户 URL 则可能形成 SSRF。安全写法需要上下文感知输出和网络边界。',
        topics: ['textContent', 'CSP', 'URL allowlist', 'AbortSignal'],
        risk: '直接把用户内容写入 HTML 会触发 XSS；服务端无限制 fetch 会访问私网。',
        control: '默认文本绑定；富文本消毒；服务端 URL 白名单、拒绝重定向和超时。',
        code: {
          language: 'javascript',
          bad: "element.innerHTML = user.comment;\nawait fetch(req.query.url);",
          good: "element.textContent = user.comment;\nconst url = assertAllowedUrl(req.query.url);\nawait fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3000) });",
          note: '浏览器与服务端边界要分别处理，不能依赖前端校验替代服务端白名单。',
        },
        lab: {
          target: '本地 Node 服务 + 浏览器测试页',
          tools: ['Node.js', 'Playwright', 'curl'],
          steps: ['提交不含 HTML 的文本和固定无害标签测试串。', '用 Playwright 断言页面只出现文本节点。', '请求本地服务代理私网/允许域名样本。'],
          expected: 'DOM 不执行测试脚本，私网请求被拒绝。',
        },
      },
      {
        id: 'sec_lang_php',
        title: 'PHP：PDO 参数化与输出编码',
        summary: '数据库使用 PDO prepared statement，HTML 输出使用 htmlspecialchars。',
        useCase: '传统内容管理后台接收搜索词和评论，需要在数据库与页面两个边界分别处理。',
        explanation: 'PHP 项目常见风险来自字符串拼接 SQL、直接 echo 用户输入和错误的文件上传校验。应使用 PDO 参数绑定、上下文输出编码和严格上传白名单。',
        topics: ['PDO 参数绑定', 'htmlspecialchars', '上传校验', '会话安全'],
        risk: 'SQL 拼接和直接输出会导致注入和 XSS。',
        control: 'PDO prepare/execute、输出编码、上传 MIME/大小/路径校验。',
        code: {
          language: 'php',
          bad: '$db->query("SELECT * FROM users WHERE email = \'$email\'");\necho $comment;',
          good: "$stmt = $db->prepare('SELECT * FROM users WHERE email = ?');\n$stmt->execute([$email]);\necho htmlspecialchars($comment, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');",
          note: 'SQL 值和 HTML 输出分别用对应上下文的处理方式。',
        },
        lab: {
          target: '本地 PHP + SQLite/MySQL 练习',
          tools: ['PHP CLI', 'PDO', '浏览器'],
          steps: ['用固定测试字符串比较拼接和参数绑定行为。', '在页面提交无害标签字符串并检查源码。', '修复后重复同一请求。'],
          expected: '查询条件不被改变，标签按文本展示。',
        },
      },
      {
        id: 'sec_lang_go',
        title: 'Go：HTTP 超时与 SSRF 白名单',
        summary: '所有外部请求设置超时、响应大小和允许主机，避免默认客户端无限等待。',
        useCase: 'Go 服务提供图片抓取与 Webhook 调试，需要限制目标和解码大小。',
        explanation: 'Go 的 net/http 默认客户端没有全局超时，URL 参数直接进入请求会形成 SSRF。安全实现需要自定义 Transport、检查主机、限制响应体并禁止不必要重定向。',
        topics: ['http.Client 超时', 'URL 白名单', '响应体上限', '重定向策略'],
        risk: '默认请求可能访问私网、长时间占用连接或读取超大响应。',
        control: '固定允许域名、连接/总超时、最大响应体、禁重定向和日志脱敏。',
        code: {
          language: 'go',
          bad: "http.Get(userURL)",
          good: "u, err := url.Parse(userURL)\nif err != nil || !allowedHost(u.Hostname()) { return err }\nclient := &http.Client{Timeout: 3 * time.Second}\nresp, err := client.Get(u.String())",
          note: '示例还需限制响应体读取大小，并使用自定义 Transport 处理 DNS/IP 边界。',
        },
        lab: {
          target: '本地 Go HTTP 服务',
          tools: ['Go', 'curl', 'httptest'],
          steps: ['用 httptest 模拟允许域名和私网地址。', '断言私网请求被拒绝。', '模拟慢响应和超大响应验证超时与大小限制。'],
          expected: '私网、慢响应和超大响应都被安全终止。',
        },
      },
      {
        id: 'sec_lang_rust',
        title: 'Rust：unsafe 审计与命令参数',
        summary: '优先安全抽象；进入 unsafe 前写清不变量，外部命令使用参数列表。',
        useCase: 'Rust CLI 需要处理不可信文件路径并调用外部工具。',
        explanation: 'Rust 的所有权减少内存错误，但 unsafe、FFI、路径穿越和 Command 参数仍可能破坏安全边界。安全代码需要把不变量写进类型和边界检查，而不是只依赖“Rust 不会崩”。',
        topics: ['unsafe 不变量', 'FFI', 'Path 规范化', 'Command 参数'],
        risk: 'unsafe 代码、越界索引和 shell 拼接仍能造成内存安全问题或命令注入。',
        control: '限制 unsafe 范围、使用安全类型、规范化路径、禁止 shell 字符串拼接。',
        code: {
          language: 'rust',
          bad: "Command::new(\"sh\").arg(\"-c\").arg(format!(\"convert {}\", user_path)).status()?;",
          good: "let path = base.join(&user_path).canonicalize()?;\nif !path.starts_with(&base) { return Err(Error::OutsideBase); }\nCommand::new(\"convert\").arg(path).status()?;",
          note: '参数列表不经过 shell；路径 canonicalize 后仍需检查允许根目录。',
        },
        lab: {
          target: '本地 Rust CLI 练习',
          tools: ['cargo', 'cargo test', 'Miri（可选）'],
          steps: ['为路径边界和参数列表编写单元测试。', '开启 clippy 和测试运行。', '审计 unsafe 块并记录不变量。'],
          expected: '越界路径与 shell 元字符输入不会逃逸，unsafe 块有明确证明。',
        },
      },
    ],
  },
  {
    id: 'sec_defense',
    name: '攻击防御与蓝队运营',
    level: '进阶',
    description: '从防护、检测、响应到恢复，建立可运行的防御闭环。',
    audience: '运维、SOC、安全运营、平台工程',
    prerequisites: ['sec_fundamentals'],
    nextPathIds: ['sec_devsecops'],
    tags: ['WAF', 'SIEM', '检测规则', '应急响应'],
    modules: [
      {
        id: 'sec_def_layer',
        title: '分层防御与攻击面收敛',
        summary: '组合身份、网络、主机、应用、数据和监控控制，避免单点防护。',
        topics: ['最小暴露', 'WAF', '补丁', '备份与恢复'],
        risk: '只靠一个 WAF 或一条规则，无法覆盖内部横向移动和业务逻辑风险。',
        control: '减少公网入口、默认拒绝、补丁 SLA、最小权限和可恢复备份共同运行。',
      },
      {
        id: 'sec_def_detect',
        title: '检测规则与告警降噪',
        summary: '把关键攻击行为转成可解释检测，并通过白名单、聚合和上下文降低噪声。',
        topics: ['SIEM', '日志关联', '阈值与基线', '误报治理'],
        risk: '规则过宽导致告警疲劳，过窄又会漏掉真实异常。',
        control: '检测规则绑定资产、身份和结果字段；高价值告警保留原始证据；每周复盘误报。',
        code: {
          language: 'yaml',
          bad: "title: login failed\ncondition: status == 401",
          good: "title: repeated login failure\ncondition: status == 401 and count(userId, 10m) >= 10 and distinct(ip, 10m) >= 3\nseverity: medium",
          note: '仅统计失败事件噪声很高，应结合时间窗、身份和来源多样性。',
        },
      },
      {
        id: 'sec_def_ir',
        title: '事件响应：隔离、取证、恢复',
        summary: '按准备、识别、遏制、根除、恢复、复盘推进，保留证据并避免二次污染。',
        topics: ['事件分级', '隔离', '时间线', '恢复验证'],
        risk: '直接重装或删除现场会丢失关键证据；过早恢复可能再次被入侵。',
        control: '先隔离与保全日志，再根除根因；恢复后进行健康检查、凭据轮换和持续观察。',
      },
    ],
  },
  {
    id: 'sec_devsecops',
    name: '安全开发与 DevSecOps',
    level: '进阶',
    description: '把安全检查嵌入编码、依赖、构建和发布流程，形成可审计的质量门。',
    audience: '研发、平台、SRE、发布工程',
    prerequisites: ['sec_web'],
    nextPathIds: [],
    tags: ['SAST', 'SCA', 'SBOM', 'Secrets'],
    modules: [
      {
        id: 'sec_dev_ci',
        title: 'SAST、DAST 与依赖扫描',
        summary: '静态、动态和依赖扫描各有盲区，需要在正确阶段运行并设定阻断策略。',
        topics: ['SAST', 'DAST', 'SCA', '质量门'],
        risk: '只扫描不设门禁，高危问题仍会进入生产；强制全量阻断又会拖垮交付。',
        control: 'critical/high 按可达性阻断，medium 建立修复期限；扫描结果带负责人和复测。',
        code: {
          language: 'yaml',
          bad: 'run: pnpm audit || true',
          good: "run: pnpm audit --audit-level=high\n# 失败即阻断；例外必须记录原因与复核日期",
          note: '不能让依赖审计永远成功退出，否则只是日志装饰。',
        },
      },
      {
        id: 'sec_dev_secrets',
        title: '密钥与配置安全',
        summary: '密钥只从安全存储注入，代码、日志和构建产物中都不出现真实值。',
        topics: ['环境变量', '密钥管理', '轮换', '最小作用域'],
        risk: '密钥进入 Git 历史后会长期暴露，删除当前行并不能消除风险。',
        control: '使用秘密管理器；提交前扫描；按环境隔离；发现泄露立即轮换和审计使用记录。',
        code: {
          language: 'typescript',
          bad: "const apiKey = 'sk-live-123456';",
          good: "const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error('API_KEY not configured');",
          note: '环境变量只是注入方式，生产环境仍应使用专用秘密存储和轮换策略。',
        },
      },
      {
        id: 'sec_dev_sbom',
        title: 'SBOM、供应链与发布审计',
        summary: '记录依赖来源、版本和许可证，跟踪漏洞处置和构建可复现性。',
        topics: ['SBOM', '签名与来源', '锁文件', '发布证据'],
        risk: '依赖树不可见时，无法快速定位受影响服务和补丁范围。',
        control: '按发布生成 SBOM，锁定依赖，验证来源与签名，保留扫描和审批证据。',
      },
    ],
  },
];

const SECURITY_MODULE_ENRICHMENTS: Record<string, Pick<SecurityModule, 'useCase' | 'explanation' | 'lesson' | 'code' | 'lab'>> = {
  sec_fund_threat_model: {
    useCase: '上线一个文件上传接口前，团队需要判断谁会访问、文件会进入哪里、失败后影响哪些用户和系统。',
    explanation: '威胁建模不是列漏洞清单，而是持续回答四个问题：我们在保护什么、谁可能滥用、攻击路径是什么、哪些控制能降低风险。STRIDE 用来把模糊担心拆成可评审的威胁类别。',
    lesson: {
      objectives: [
        '说清楚威胁建模解决什么问题，以及它和漏洞扫描的区别。',
        '为“文件上传服务”画出数据流，标出资产和信任边界。',
        '按 STRIDE 推导威胁，并写出“原因 → 影响 → 控制 → 验收”的完整链条。',
        '在本地靶场复现越权下载、公开对象和危险文件上传，再验证修复。',
      ],
      keyTerms: [
        { term: '资产', explanation: '需要保护的东西，例如文件、元数据、登录会话和对象存储桶。' },
        { term: '信任边界', explanation: '身份、权限或数据格式发生变化的连接点，例如浏览器到 Nginx、API 到对象存储。' },
        { term: '数据流', explanation: '一次正常业务请求经过的组件和方向，用来发现“谁还能访问这条路径”。' },
        { term: '威胁', explanation: '可能发生的坏事和触发条件，不等于已经扫描到的漏洞。' },
        { term: '控制', explanation: '阻止威胁发生、降低影响或帮助发现问题的具体机制。' },
        { term: '验收用例', explanation: '能够重复执行并观察结果的测试，例如用户 B 读取用户 A 的文件必须返回 404。' },
      ],
      walkthrough: [
        {
          title: '先写正常流程',
          detail: '用户登录后上传文件：浏览器 → Nginx → API。API 校验身份，把文件写入对象存储，把文件名、所有者、大小和摘要写入元数据表；下载时 API 生成短时签名地址。',
        },
        {
          title: '列出要保护的资产',
          detail: '文件内容、文件元数据、用户会话、对象存储桶和签名地址都属于资产。先列出资产，才能判断哪一步泄露会造成什么影响。',
        },
        {
          title: '标出信任边界',
          detail: '浏览器到 Nginx、Nginx 到 API、API 到对象存储、API 到数据库都是边界。每跨过一次边界，都要重新确认身份、权限、数据格式和大小。',
        },
        {
          title: '对每个边界套 STRIDE',
          detail: '欺骗看身份是否可冒用；篡改看内容和摘要是否可改；抵赖看审计是否缺失；信息泄露看对象是否公开；拒绝服务看上传是否有限额；权限提升看前端判断是否被服务端重复执行。',
        },
        {
          title: '判断风险优先级',
          detail: '公开存储桶和跨租户下载会直接泄露数据，应优先处理；无限上传会耗尽容量和带宽；缺少审计会降低发现与追责能力。优先级由影响范围和触发难度共同决定。',
        },
        {
          title: '把威胁变成控制',
          detail: '越权下载用 tenantId + fileId 联合查询；公开桶改成私有桶并只发短时签名地址；危险文件用 MIME、扩展名、内容检查并强制附件下载；上传量按用户和 IP 限额。',
        },
        {
          title: '写成可复测的验收用例',
          detail: '用户 B 请求用户 A 的文件应返回 404；无签名对象地址应返回 403；上传 HTML 文件应返回 415；超过大小限制应返回 413；修复后本人仍能正常下载。',
        },
      ],
      knowledgeChecks: [
        {
          question: '为什么“security: please secure it”不能当作威胁模型？',
          answer: '它没有说明保护什么、谁会攻击、从哪个边界进入、会造成什么影响，也没有控制措施和验收条件，因此无法评审，也无法验证是否有效。',
        },
        {
          question: '对象存储桶公开为什么是信息泄露，而不是“只有知道 URL 才危险”？',
          answer: '公开桶意味着访问控制已经不经过应用服务器和登录会话。URL 可能进入浏览器历史、日志、聊天记录或被枚举，任何拿到地址的人都能直接读取文件。',
        },
        {
          question: '为什么只在前端检查文件扩展名没有安全作用？',
          answer: '前端代码和请求都由用户控制。攻击者可以绕过页面直接调用 API，所以文件类型、大小、权限和存储位置必须在服务端重新校验。',
        },
        {
          question: '已经有漏洞扫描器，为什么还需要威胁建模？',
          answer: '扫描器擅长发现已知模式和实现错误，但不了解业务权限、数据流和设计目标。威胁建模能在开发前发现“缺少对象级授权”“公开桶”“无上传限额”这类设计缺口，再决定用什么测试验证。',
        },
      ],
    },
    code: {
      language: 'markdown',
      badLabel: '不安全的上传设计',
      goodLabel: '威胁模型与控制',
      bad: `# 文件上传服务

架构：浏览器 → Nginx → API → 对象存储
文件位置：public/uploads
下载：GET /files/:id 直接返回文件
校验：仅前端检查扩展名和大小
存储桶：公开读
权限：未记录文件归属和租户`,
      good: `# 文件上传服务威胁模型

资产：用户文件、私有桶、文件元数据
边界：浏览器 → Nginx → API → 对象存储
威胁与控制：
- 越权下载：查询绑定 fileId + tenantId，失败返回 404
- 存储型 XSS：校验 MIME/扩展名，下载加 attachment
- 公开桶泄露：私有桶 + 5 分钟签名 URL
- 上传耗尽：大小、数量、速率限制
- 文件篡改：checksum，图片重新编码
验收：用户 B 访问用户 A 的文件返回 404`,
      note: '这里展示的是文件上传服务的威胁模型记录，不是 Nginx 配置；每项威胁都应有可复测的验收条件。',
    },
    lab: {
      target: '127.0.0.1 文件上传教学靶场',
      tools: ['Node.js 20+', 'curl.exe', '浏览器 DevTools'],
      steps: [
        '在项目根目录启动不安全模式，只绑定本机回环地址，不接触外部网络。',
        '分别以 alice 和 bob 登录，保存两个不同的会话令牌。',
        '用 alice 上传 note.txt，记录返回的 FILE_ID；用 bob 令牌请求该文件，观察不安全的 200 响应。',
        '访问不带身份校验的对象地址，确认公开桶会让文件绕过应用授权。',
        '上传 attack.html 并声明为 text/html，确认不安全模式接受危险文件。',
        '停止靶场，改用安全模式重启；重复上述请求，应分别得到 404、403 和 415。',
        '把每个请求、响应状态和对应 STRIDE 类别写进威胁模型，形成可复测证据。',
      ],
      commands: [
        'node apps/server/scripts/security-upload-lab.cjs --insecure',
        'curl.exe -s -X POST http://127.0.0.1:4317/login -H "Content-Type: application/json" -d "{\\"user\\":\\"alice\\"}"',
        'curl.exe -s -X POST http://127.0.0.1:4317/upload -H "Authorization: Bearer ALICE_TOKEN" -H "Content-Type: application/json" -d "{\\"filename\\":\\"note.txt\\",\\"contentType\\":\\"text/plain\\",\\"content\\":\\"hello\\"}"',
        'curl.exe -i http://127.0.0.1:4317/files/FILE_ID -H "Authorization: Bearer BOB_TOKEN"',
        'curl.exe -i http://127.0.0.1:4317/files/FILE_ID -H "Authorization: Bearer ALICE_TOKEN"',
      ],
      expected: '不安全模式能复现越权读取、公开对象和危险文件上传；安全模式分别以 404、403、415 阻断，同时 alice 仍能正常下载自己的文件。',
    },
  },
  sec_fund_auth: {
    useCase: '用户登录后台后，需要在浏览器和服务端之间保持身份，同时防止令牌被脚本读取或长期滥用。',
    explanation: '认证回答“你是谁”，会话回答“后续请求如何证明还是你”。密码哈希、MFA、短会话、Cookie 属性和登录限速属于同一套边界，不能只修其中一项。',
  },
  sec_fund_network: {
    useCase: '一个 Web 服务需要访问数据库和对象存储，但不应直接访问内网管理接口或任意公网地址。',
    explanation: '网络分段的目标是缩小爆炸半径。应用、数据、管理和出站访问分别设边界，即使某个 Web 服务失守，也不能直接控制数据库和管理平面。',
    code: {
      language: 'yaml',
      bad: "egress: 0.0.0.0/0\nadmin: 0.0.0.0/0",
      good: "egress:\n  - storage.internal:443\n  - db.internal:5432\nadmin:\n  - vpn-pool:22\ninbound:\n  - web:443",
      note: '示例是策略模型，落地时可映射到安全组、NetworkPolicy 或防火墙规则。',
    },
  },
  sec_fund_logging: {
    useCase: '登录失败、权限变更、批量导出等高风险动作需要能在事故后还原 who/what/when/result。',
    explanation: '日志是审计证据，不是业务数据库副本。字段要能关联身份与请求，同时通过脱敏和访问控制避免令牌、Cookie、密码和完整个人信息进入日志平台。',
  },
  sec_web_sqli: {
    useCase: '用户搜索、登录和筛选接口都会把外部输入带进数据库查询。',
    explanation: 'SQL 注入的根因不是某个特殊字符，而是输入被当成 SQL 语法。参数化查询把结构和值分离；表名、排序字段等无法参数化的位置必须使用固定映射。',
  },
  sec_web_xss: {
    useCase: '评论、昵称、搜索词和富文本内容会在不同 HTML 上下文中展示。',
    explanation: 'XSS 修复要按输出上下文处理：HTML 文本、属性、URL 和脚本上下文编码方式不同。默认使用框架文本绑定，富文本必须消毒，CSP 是纵深防御。',
  },
  sec_web_access: {
    useCase: '文档、订单、项目等资源按 ID 访问时，用户可能修改 URL 尝试读取他人数据。',
    explanation: '认证只证明登录状态，授权必须证明当前主体对当前对象有权限。对象级授权应在查询层绑定 tenantId/userId，而不是只依赖前端隐藏按钮。',
  },
  sec_web_ssrf: {
    useCase: '图片代理、链接预览、Webhook 测试和远程抓取功能会让服务端访问用户提供的 URL。',
    explanation: 'SSRF 的信任边界是服务端网络位置。仅检查字符串域名不够，还要限制协议、解析后的 IP、重定向和响应大小；高风险功能应使用专用出站代理。',
  },
  sec_pentest_scope: {
    useCase: '企业委托测试一个 staging 环境时，需要明确哪些域名、账号、接口和时间窗允许测试。',
    explanation: '渗透测试首先是授权工程。书面范围、行动规则、停止条件和数据处理决定测试是否合法、可控、可复现；工具执行只是后续步骤。',
    code: {
      language: 'yaml',
      bad: "scope: company systems\nallow: all tests",
      good: "scope:\n  targets: [staging.example.internal]\n  accounts: [test-a, test-b]\n  window: '2027-01-10 10:00/18:00'\nforbidden: [dos, persistence, third-party]\nrate_limit: 20rps\nstop_if: [availability drop, unexpected data]",
      note: '测试前由授权人签字确认；任何范围外发现只记录，不继续验证。',
    },
  },
  sec_pentest_discover: {
    useCase: '进入授权靶场后，先确认服务、端口、页面和登录入口，再决定下一步验证。',
    explanation: '侦察的目标是建立攻击面清单，不是尽快打出告警。低速、限量、可复现的请求比全量扫描更有价值，也更容易形成可靠证据。',
  },
  sec_pentest_validate: {
    useCase: '发现一个可能的越权或注入点时，需要证明风险存在但不读取无关数据、不破坏状态。',
    explanation: '最小影响证明强调单请求、测试账号和可恢复数据。记录前置条件、请求、响应和业务影响；验证后立即清理，避免把测试行为变成事故。',
    code: {
      language: 'http',
      bad: 'GET /api/docs/all',
      good: "GET /api/docs/test-doc-b-id HTTP/1.1\nHost: 127.0.0.1:3000\nCookie: <user-a-session>\n\nExpect: 403 or 404",
      note: '示例只使用本地靶场和本次测试创建的固定对象。',
    },
  },
  sec_pentest_report: {
    useCase: '研发拿到测试结果后，需要知道问题在哪里、为什么危险、怎么修、如何验证。',
    explanation: '好的报告把技术证据翻译成业务影响，同时提供可执行的修复路径。严重级别应结合可利用性、权限要求、数据范围和现有控制，而不是只复制扫描器分数。',
    code: {
      language: 'markdown',
      bad: 'Found IDOR. High risk. Fix it.',
      good: "## 订单越权读取\n- 入口：GET /api/orders/{id}\n- 条件：已登录用户 A 请求用户 B 的测试订单\n- 证据：返回 200，响应时间 35ms（截图已脱敏）\n- 影响：可读取其他用户订单基础信息\n- 修复：查询绑定 tenantId/userId，缺失时返回 404\n- 复测：同一请求返回 404，本人订单仍为 200",
      note: '报告中不粘贴令牌、Cookie、真实个人信息或大批量业务数据。',
    },
  },
  sec_auto_lab: {
    useCase: '团队要在 CI 或本地反复验证扫描器和修复效果，需要一个随时可重建的隔离靶场。',
    explanation: '自动化靶场必须先解决隔离、数据恢复和地址固定。容器只绑定回环地址，使用测试账号和快照；每次任务结束后销毁，避免测试状态污染下一次结果。',
    code: {
      language: 'yaml',
      bad: "ports: ['3000:3000']\nvolumes: ['/:/host']",
      good: "services:\n  juice-shop:\n    image: bkimminich/juice-shop:latest\n    ports: ['127.0.0.1:3000:3000']\n    restart: 'no'\n",
      note: '不要把宿主机根目录或不必要的生产凭据挂载进靶场容器。',
    },
  },
  sec_auto_scan: {
    useCase: '每次修改本地靶场的鉴权或参数校验后，希望自动跑一组固定扫描并比较新增问题。',
    explanation: '自动扫描负责覆盖和重复执行，人负责可达性与影响判断。需要固定模板版本、速率和基线，把新发现与历史误报分开管理。',
  },
  sec_auto_authz: {
    useCase: '本地靶场有 A/B 两个测试账号，希望自动验证用户 A 不能读取用户 B 的对象。',
    explanation: '权限流程不能只做登录成功断言，要构造真实对象、独立会话和最小越权请求。测试数据带唯一标记，结束后清理，避免污染后续运行。',
  },
  sec_auto_pipeline: {
    useCase: '安全扫描和权限用例需要在合并请求阶段运行，但不能拖垮整个流水线。',
    explanation: 'CI 中的安全门应只阻断可确认、可达的高风险问题；其余问题进入待办。报告、日志和豁免都要归档，才能证明质量门真实执行过。',
  },
  sec_def_layer: {
    useCase: '公网 Web 服务需要同时防注入、凭据泄露、恶意扫描和失陷后的横向移动。',
    explanation: '分层防御不是堆产品，而是让不同层互相补位：入口收敛、身份校验、应用修复、网络隔离、主机补丁、数据备份和监控响应缺一不可。',
    code: {
      language: 'nginx',
      bad: 'add_header X-Frame-Options SAMEORIGIN always;',
      good: "add_header Content-Security-Policy \"default-src 'self'; object-src 'none'; frame-ancestors 'none'\" always;\nadd_header X-Content-Type-Options nosniff always;\nadd_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;",
      note: '安全响应头要结合业务实际测试，CSP 过严会破坏合法资源。',
    },
  },
  sec_def_detect: {
    useCase: '登录失败、权限提升和异常下载需要形成可解释告警，而不是把每条错误都推给值班人员。',
    explanation: '检测工程的核心是可靠信号。规则要有时间窗、身份、来源和结果上下文，并通过基线与聚合降低噪声；高价值告警必须保留原始证据。',
  },
  sec_def_ir: {
    useCase: '发现账号被盗或主机异常后，团队需要在业务恢复前完成隔离、取证和根因排查。',
    explanation: '事件响应按阶段推进：准备、识别、遏制、根除、恢复、复盘。每一步都要有负责人、时间线和证据；不要在根因未明时直接重装覆盖现场。',
    code: {
      language: 'bash',
      bad: 'rm -rf /var/log/* && reboot',
      good: "date -Is > incident-timeline.txt\nss -plant >> incident-timeline.txt\njournalctl --since '-30 min' --no-pager > incident-journal.txt\n# 先隔离网络与保全证据，再由负责人决定恢复",
      note: '示例用于自建测试主机；真实事件先按组织流程和取证要求执行。',
    },
  },
  sec_dev_ci: {
    useCase: '每次合并请求都要检查依赖漏洞、代码风险和运行时 DAST，而不是靠人工记得执行。',
    explanation: 'SAST、SCA、DAST 覆盖不同层面，应放行已经确认不可达的低风险问题，阻断可达的高风险问题；例外要可追踪、会过期。',
  },
  sec_dev_secrets: {
    useCase: '应用需要访问模型平台、数据库和第三方 API，但不能把真实密钥写进仓库或日志。',
    explanation: '密钥安全包括生成、存储、注入、轮换和泄露响应。提交历史一旦包含真实密钥，删除当前行不够，必须轮换并审计使用记录。',
  },
  sec_dev_sbom: {
    useCase: '发布前需要知道构建产物包含哪些依赖、版本、许可证和已知漏洞。',
    explanation: 'SBOM 是供应链可见性基线。每次发布生成并归档，结合锁文件、签名和漏洞扫描，才能在组件爆发漏洞时快速定位影响范围。',
    code: {
      language: 'bash',
      bad: 'pnpm list --depth 0 > dependencies.txt',
      good: 'syft packages dir:. -o spdx-json > sbom.spdx.json\npnpm audit --audit-level=high',
      note: 'SBOM 记录实际产物依赖；依赖树文本不能替代标准 SBOM。',
    },
  },
};

for (const path of SECURITY_PATHS) {
  for (const mod of path.modules) {
    const enrichment = SECURITY_MODULE_ENRICHMENTS[mod.id];
    if (enrichment) Object.assign(mod, enrichment);
    if (!mod.lesson && SECURITY_MODULE_LESSONS[mod.id]) mod.lesson = SECURITY_MODULE_LESSONS[mod.id];
    if (!mod.lab && SECURITY_MODULE_EXTRA_LABS[mod.id]) mod.lab = SECURITY_MODULE_EXTRA_LABS[mod.id];
  }
}

const MULTILANGUAGE_CODE_VARIANTS: Record<string, SecurityCodeVariant[]> = {
  sec_web_sqli: [
    { language: 'c', bad: "char sql[256];\nsprintf(sql, \"SELECT * FROM users WHERE email='%s'\", email);", good: "sqlite3_stmt *stmt;\nsqlite3_prepare_v2(db, \"SELECT id FROM users WHERE email=?1\", -1, &stmt, NULL);\nsqlite3_bind_text(stmt, 1, email, -1, SQLITE_TRANSIENT);", note: 'C 示例使用 SQLite 预编译语句，所有值通过 bind 传入。' },
    { language: 'cpp', bad: "db.exec(\"SELECT * FROM users WHERE email='\" + email + \"'\");", good: "tx.exec_params(\"SELECT id FROM users WHERE email=$1\", email);", note: 'C++ 示例使用 libpqxx 的参数化接口。' },
    { language: 'java', bad: "jdbc.query(\"SELECT * FROM users WHERE email='\" + email + \"'\");", good: "jdbc.query(\"SELECT id FROM users WHERE email=?\", email, mapper);", note: 'Java 使用 PreparedStatement 占位符。' },
    { language: 'python', bad: "cursor.execute(f\"SELECT * FROM users WHERE email='{email}'\")", good: "cursor.execute('SELECT id FROM users WHERE email=?', (email,))", note: 'Python DB-API 参数由驱动绑定，不参与 SQL 语法解析。' },
    { language: 'javascript', bad: "db.query(`SELECT * FROM users WHERE email='${email}'`);", good: "db.query('SELECT id FROM users WHERE email=$1', [email]);", note: 'Node 数据库驱动使用参数数组。' },
    { language: 'php', bad: "$db->query(\"SELECT * FROM users WHERE email='$email'\");", good: "$stmt = $db->prepare('SELECT id FROM users WHERE email=?');\n$stmt->execute([$email]);", note: 'PHP 使用 PDO prepare/execute。' },
    { language: 'go', bad: "db.Query(\"SELECT * FROM users WHERE email='\" + email + \"'\")", good: "db.Query(\"SELECT id FROM users WHERE email=$1\", email)", note: 'Go database/sql 使用占位符和参数。' },
    { language: 'rust', bad: "conn.execute(&format!(\"SELECT * FROM users WHERE email='{}'\", email), [])?;", good: "conn.query_row(\"SELECT id FROM users WHERE email=?1\", [email], |row| row.get(0))?;", note: 'Rust rusqlite 使用参数绑定。' },
  ],
  sec_web_xss: [
    { language: 'c', bad: "printf(\"<div>%s</div>\", comment);", good: "html_escape(stdout, comment); // 将 & < > \" ' 编码后再输出", note: 'C 需要实现上下文相关的 HTML 编码函数，不能直接输出原始输入。' },
    { language: 'cpp', bad: "out << \"<div>\" << comment << \"</div>\";", good: "out << \"<div>\" << html_escape(comment) << \"</div>\";", note: 'C++ 同样需要显式编码或使用安全模板引擎。' },
    { language: 'java', bad: "response.getWriter().write(\"<div>\" + comment + \"</div>\");", good: "response.getWriter().write(\"<div>\" + HtmlUtils.htmlEscape(comment) + \"</div>\");", note: 'Spring HtmlUtils 按 HTML 文本上下文编码。' },
    { language: 'python', bad: "return f\"<div>{comment}</div>\"", good: "from html import escape\nreturn f\"<div>{escape(comment)}</div>\"", note: 'Python html.escape 用于 HTML 文本上下文。' },
    { language: 'javascript', bad: "container.innerHTML = comment;", good: "container.textContent = comment;", note: 'textContent 将数据作为文本节点插入。' },
    { language: 'php', bad: "echo \"<div>$comment</div>\";", good: "echo '<div>' . htmlspecialchars($comment, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';", note: 'PHP 使用 htmlspecialchars 并指定编码。' },
    { language: 'go', bad: "fmt.Fprintf(w, \"<div>%s</div>\", comment)", good: "template.Must(template.New(\"x\").Parse(\"<div>{{.}}</div>\")).Execute(w, comment)", note: 'Go html/template 自动按 HTML 上下文转义。' },
    { language: 'rust', bad: "write!(out, \"<div>{}</div>\", comment)?;", good: "write!(out, \"<div>{}</div>\", html_escape::encode_text(comment))?;", note: 'Rust 示例使用 html_escape 文本编码。' },
  ],
  sec_web_access: [
    { language: 'c', bad: "if (doc_id == requested_id) return load_doc(doc_id);", good: "return load_doc_for_tenant(doc_id, user->tenant_id); // SQL 同时绑定 doc_id + tenant_id", note: 'C 服务也应把租户条件放进查询层。' },
    { language: 'cpp', bad: "return repo.find(docId);", good: "return repo.find_for_tenant(docId, user.tenantId());", note: 'C++ 接口显式要求 tenantId。' },
    { language: 'java', bad: "return repo.findById(id).orElseThrow();", good: "return repo.findByIdAndTenantId(id, user.tenantId()).orElseThrow(NotFound::new);", note: 'Java 查询方法同时绑定主体租户。' },
    { language: 'python', bad: "return db.get(Doc, doc_id)", good: "return db.scalar(select(Doc).where(Doc.id == doc_id, Doc.tenant_id == user.tenant_id))", note: 'Python ORM 查询同时包含对象和租户条件。' },
    { language: 'javascript', bad: "return docs.findById(req.params.id);", good: "return docs.findOne({ _id: req.params.id, tenantId: req.user.tenantId });", note: 'Node 查询条件包含 tenantId。' },
    { language: 'php', bad: "$doc = $repo->find($id);", good: "$doc = $repo->findOneBy(['id' => $id, 'tenantId' => $user->tenantId()]);", note: 'PHP 仓储方法绑定对象与租户。' },
    { language: 'go', bad: "repo.Find(ctx, id)", good: "repo.FindForTenant(ctx, id, user.TenantID)", note: 'Go 上下文与查询都携带认证主体。' },
    { language: 'rust', bad: "repo.find(doc_id).await?", good: "repo.find_for_tenant(doc_id, user.tenant_id).await?", note: 'Rust 使用类型化主体信息执行授权查询。' },
  ],
  sec_web_ssrf: [
    { language: 'c', bad: "curl_easy_setopt(curl, CURLOPT_URL, user_url);", good: "if (!host_allowed(parse_host(user_url))) return ERROR;\ncurl_easy_setopt(curl, CURLOPT_URL, user_url);\ncurl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);", note: 'C/libcurl 需先校验主机、禁重定向并限制协议。' },
    { language: 'cpp', bad: "http.get(userUrl);", good: "if (!allowlist.contains(url.host())) throw InvalidTarget();\nhttp.get(url, {.redirects = 0, .timeout = 3s});", note: 'C++ 客户端策略同样要限制主机、超时和重定向。' },
    { language: 'java', bad: "client.send(HttpRequest.newBuilder(URI.create(url)).build(), body);", good: "URI uri = URI.create(url);\nif (!allowedHosts.contains(uri.getHost())) throw new InvalidTarget();\nclient.send(request(uri, Duration.ofSeconds(3)), body);", note: 'Java 请求前检查 URI 主机并设置超时。' },
    { language: 'python', bad: "requests.get(user_url)", good: "u = urlparse(user_url)\nif u.scheme != 'https' or u.hostname not in ALLOWED: raise ValueError()\nrequests.get(user_url, allow_redirects=False, timeout=3)", note: 'Python requests 禁用重定向并设置超时。' },
    { language: 'javascript', bad: "await fetch(req.body.url);", good: "const u = new URL(req.body.url);\nif (u.protocol !== 'https:' || !allowed.has(u.hostname)) throw new Error('blocked');\nawait fetch(u, { redirect: 'error', signal: AbortSignal.timeout(3000) });", note: 'Node fetch 同样需要白名单、超时和重定向策略。' },
    { language: 'php', bad: "file_get_contents($_GET['url']);", good: "$u = parse_url($url);\nif (($u['scheme'] ?? '') !== 'https' || !in_array($u['host'] ?? '', $allowed, true)) throw new Exception('blocked');\nfile_get_contents($url, false, stream_context_create(['http' => ['timeout' => 3, 'follow_location' => 0]]));", note: 'PHP 需同时限制协议、主机、超时和重定向。' },
    { language: 'go', bad: "http.Get(userURL)", good: "u, _ := url.Parse(userURL)\nif u.Scheme != \"https\" || !allowed[u.Hostname()] { return errBlocked }\nclient := &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}\nclient.Get(u.String())", note: 'Go 使用超时和重定向策略。' },
    { language: 'rust', bad: "reqwest::get(user_url).await?", good: "let u = Url::parse(&user_url)?;\nif u.scheme() != \"https\" || !allowed.contains(u.host_str().unwrap_or(\"\")) { return Err(Error::Blocked); }\nclient.get(u).timeout(Duration::from_secs(3)).send().await?", note: 'Rust reqwest 客户端配置超时，并在请求前校验 URI。' },
  ],
  sec_fund_auth: [
    { language: 'c', bad: "if (strcmp(token, expected) == 0) authenticated = 1;", good: "unsigned diff = 0;\nfor (size_t i = 0; i < len; ++i) diff |= token[i] ^ expected[i];\nif (diff == 0 && len == expected_len) authenticated = 1;", note: '令牌比较使用常量时间逻辑，避免明显的时间侧信道。' },
    { language: 'cpp', bad: "if (token == expected) authenticated = true;", good: "if (CRYPTO_memcmp(token.data(), expected.data(), token.size()) == 0 && token.size() == expected.size()) authenticated = true;", note: 'C++ 示例使用 OpenSSL 常量时间比较。' },
    { language: 'java', bad: "if (token.equals(expected)) authenticated = true;", good: "if (MessageDigest.isEqual(token.getBytes(UTF_8), expected.getBytes(UTF_8))) authenticated = true;", note: 'Java 使用 MessageDigest.isEqual 比较。' },
    { language: 'python', bad: "if token == expected: authenticated = True", good: "import hmac\nif hmac.compare_digest(token, expected): authenticated = True", note: 'Python 使用 hmac.compare_digest。' },
    { language: 'javascript', bad: "if (token === expected) authenticated = true;", good: "if (token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) authenticated = true;", note: 'Node 使用 timingSafeEqual，并先检查长度。' },
    { language: 'php', bad: "if ($token === $expected) $authenticated = true;", good: "if (hash_equals($expected, $token)) $authenticated = true;", note: 'PHP 使用 hash_equals。' },
    { language: 'go', bad: "if token == expected { authenticated = true }", good: "if subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1 { authenticated = true }", note: 'Go 使用 subtle.ConstantTimeCompare。' },
    { language: 'rust', bad: "if token == expected { authenticated = true; }", good: "if subtle::ConstantTimeEq::ct_eq(token.as_bytes(), expected.as_bytes()).into() { authenticated = true; }", note: 'Rust 示例使用 subtle crate 做常量时间比较。' },
  ],
  sec_dev_secrets: [
    { language: 'c', bad: "const char *api_key = \"sk-live-123\";", good: "const char *api_key = getenv(\"API_KEY\");\nif (!api_key || !*api_key) return CONFIG_ERROR;", note: 'C 从进程环境读取，缺失时失败关闭。' },
    { language: 'cpp', bad: "std::string key = \"sk-live-123\";", good: "const char* key = std::getenv(\"API_KEY\");\nif (!key || !*key) throw ConfigError();", note: 'C++ 同样通过外部注入，不把密钥写入源码。' },
    { language: 'java', bad: "String key = \"sk-live-123\";", good: "String key = System.getenv(\"API_KEY\");\nif (key == null || key.isBlank()) throw new IllegalStateException(\"API_KEY missing\");", note: 'Java 从环境或密钥管理器读取。' },
    { language: 'python', bad: "API_KEY = 'sk-live-123'", good: "import os\nAPI_KEY = os.environ['API_KEY']", note: '生产环境应由密钥管理器注入并支持轮换。' },
    { language: 'javascript', bad: "const apiKey = 'sk-live-123';", good: "const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error('API_KEY missing');", note: 'Node 不把密钥写入代码或日志。' },
    { language: 'php', bad: "$apiKey = 'sk-live-123';", good: "$apiKey = getenv('API_KEY');\nif ($apiKey === false || $apiKey === '') throw new RuntimeException('API_KEY missing');", note: 'PHP 从外部环境读取并检查缺失。' },
    { language: 'go', bad: "apiKey := \"sk-live-123\"", good: "apiKey := os.Getenv(\"API_KEY\")\nif apiKey == \"\" { return errors.New(\"API_KEY missing\") }", note: 'Go 从环境读取，配置缺失时失败关闭。' },
    { language: 'rust', bad: "let api_key = \"sk-live-123\";", good: "let api_key = std::env::var(\"API_KEY\").map_err(|_| Error::MissingConfig)?;\nif api_key.is_empty() { return Err(Error::MissingConfig); }", note: 'Rust 返回明确配置错误，不打印密钥值。' },
  ],
};

for (const path of SECURITY_PATHS) {
  for (const mod of path.modules) {
    if (mod.code && MULTILANGUAGE_CODE_VARIANTS[mod.id]) {
      mod.code.variants = MULTILANGUAGE_CODE_VARIANTS[mod.id];
    }
  }
}

const SECURITY_CODE_CONTEXT: Record<string, string> = {
  sec_fund_threat_model: '言智网络安全课程 · 安全基础与威胁建模 / STRIDE 模块',
  sec_fund_auth: '应用会话安全代码（语言示例）',
  sec_fund_network: '云安全组/防火墙策略示意（抽象 YAML，不绑定厂商）',
  sec_fund_logging: '应用审计日志代码',
  sec_web_sqli: '数据库访问代码',
  sec_web_xss: 'Web 输出编码代码',
  sec_web_access: '服务端对象授权代码',
  sec_web_ssrf: '服务端 URL 抓取代码',
  sec_pentest_scope: '授权渗透 ROE 模板（YAML 文档，不是扫描器配置）',
  sec_pentest_discover: 'Nmap 本地靶场命令',
  sec_pentest_validate: 'HTTP 请求示例（仅本地靶场）',
  sec_pentest_report: '渗透测试报告 Markdown 模板',
  sec_auto_lab: 'Docker Compose 本地靶场配置',
  sec_auto_scan: 'Nuclei 本地靶场命令',
  sec_auto_authz: 'Playwright 本地靶场自动化测试代码',
  sec_auto_pipeline: 'CI 流水线 YAML（GitHub Actions 风格）',
  sec_def_layer: 'Nginx 安全响应头配置',
  sec_def_detect: 'SIEM 检测规则示意 YAML',
  sec_def_ir: 'Linux 主机事件取证命令',
  sec_dev_ci: '依赖审计 CI 命令',
  sec_dev_secrets: '应用密钥读取代码',
  sec_dev_sbom: 'SBOM 生成与依赖审计命令',
  sec_lang_c: 'C 安全编码示例',
  sec_lang_cpp: 'C++ 安全编码示例',
  sec_lang_java: 'Java 安全编码示例',
  sec_lang_python: 'Python 安全编码示例',
  sec_lang_javascript: 'JavaScript 安全编码示例',
  sec_lang_php: 'PHP 安全编码示例',
  sec_lang_go: 'Go 安全编码示例',
  sec_lang_rust: 'Rust 安全编码示例',
};

const SECURITY_CODE_APPLICATIONS: Record<string, string> = {
  sec_fund_threat_model: '文件上传服务（浏览器 → API → 对象存储）',
  sec_fund_auth: '带登录会话的 Web 应用',
  sec_fund_network: '云上 Web 应用（应用层 / 数据层 / 管理面）',
  sec_fund_logging: '应用服务端审计日志',
  sec_web_sqli: '使用关系型数据库的 Web 应用',
  sec_web_xss: '渲染用户内容的 Web 前端',
  sec_web_access: '多租户文档服务 API',
  sec_web_ssrf: '服务端 URL 抓取 / Webhook 代理服务',
  sec_pentest_scope: '自有或已授权的渗透测试项目',
  sec_pentest_discover: '127.0.0.1 本地授权靶场',
  sec_pentest_validate: '本地 OWASP Juice Shop / WebGoat 靶场',
  sec_pentest_report: '渗透测试报告（目标系统实际情况）',
  sec_auto_lab: '本地 OWASP Juice Shop / WebGoat 容器靶场',
  sec_auto_scan: '本地 Web 靶场',
  sec_auto_authz: '本地 Web 靶场登录与越权流程',
  sec_auto_pipeline: '应用代码仓库的 CI/CD 流水线',
  sec_def_layer: 'Nginx 反向代理的 Web 应用',
  sec_def_detect: '集中日志 / SIEM 检测平台',
  sec_def_ir: 'Linux 主机安全事件响应',
  sec_dev_ci: '应用代码仓库与 CI 流水线',
  sec_dev_secrets: '服务端应用密钥管理',
  sec_dev_sbom: '应用构建与发布流水线',
  sec_lang_c: 'C 语言应用或系统组件',
  sec_lang_cpp: 'C++ 应用或系统组件',
  sec_lang_java: 'Java 后端应用',
  sec_lang_python: 'Python 脚本或后端服务',
  sec_lang_javascript: '浏览器或 Node.js 应用',
  sec_lang_php: 'PHP Web 应用',
  sec_lang_go: 'Go 后端服务',
  sec_lang_rust: 'Rust 系统服务',
};

const SECURITY_CODE_KINDS: Record<string, string> = {
  sec_fund_threat_model: '威胁模型记录（Markdown 文档，不绑定 Nginx / Docker / Kubernetes）',
  sec_fund_auth: '应用代码示例',
  sec_fund_network: '策略模型（抽象 YAML）',
  sec_fund_logging: '应用代码示例',
  sec_web_sqli: '应用代码示例',
  sec_web_xss: '应用代码示例',
  sec_web_access: '应用代码示例',
  sec_web_ssrf: '应用代码示例',
  sec_pentest_scope: '授权文档模板（YAML）',
  sec_pentest_discover: 'Shell 命令',
  sec_pentest_validate: 'HTTP 请求',
  sec_pentest_report: 'Markdown 报告模板',
  sec_auto_lab: 'Docker Compose 配置',
  sec_auto_scan: 'Nuclei 命令',
  sec_auto_authz: 'Playwright 测试代码',
  sec_auto_pipeline: 'GitHub Actions 工作流',
  sec_def_layer: 'Nginx 配置',
  sec_def_detect: 'SIEM 检测规则（YAML 风格）',
  sec_def_ir: 'Linux Shell 命令',
  sec_dev_ci: 'CI 命令',
  sec_dev_secrets: '应用代码示例',
  sec_dev_sbom: 'Shell 命令',
  sec_lang_c: 'C 代码示例',
  sec_lang_cpp: 'C++ 代码示例',
  sec_lang_java: 'Java 代码示例',
  sec_lang_python: 'Python 代码示例',
  sec_lang_javascript: 'JavaScript 代码示例',
  sec_lang_php: 'PHP 代码示例',
  sec_lang_go: 'Go 代码示例',
  sec_lang_rust: 'Rust 代码示例',
};

for (const path of SECURITY_PATHS) {
  for (const mod of path.modules) {
    if (mod.code) {
      mod.code.context = SECURITY_CODE_CONTEXT[mod.id] || '安全教学代码示例';
      mod.code.application = SECURITY_CODE_APPLICATIONS[mod.id] || '通用应用安全场景';
      mod.code.exampleKind = SECURITY_CODE_KINDS[mod.id] || '教学示例';
    }
  }
}

export function listSecurityPaths(): SecurityPath[] {
  return SECURITY_PATHS;
}

export function getSecurityPath(id: string): SecurityPath | null {
  return SECURITY_PATHS.find((path) => path.id === id) || null;
}
