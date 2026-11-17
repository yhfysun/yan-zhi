import type { CuratedCoursePlanMap } from './types.js';

export const SECURITY_CURATED_PLANS = {
  'security:安全基础与威胁建模': {
    prerequisite: '会使用浏览器和文本编辑器；不需要编程或渗透测试基础。',
    plainLanguageGoal: '学完后，你能为一个小型教学系统画出信任边界，列出资产、威胁和缓解措施，并说明哪些假设需要验证。',
    guidedPractice: '以“学生提交作业”为教学案例，画出浏览器、Web 服务、文件存储和管理员四个边界，分别列出资产、入口、主体和可能的失败模式。',
    independentPractice: '为一个虚构的读书笔记应用完成一页威胁模型：资产、信任边界、三个威胁场景、对应缓解措施和一个仍需验证的假设。',
    commonErrors: [
      '从具体漏洞名称开始，却没有先说清要保护什么资产和谁能访问。',
      '把防火墙或登录页当成完整安全边界，忽略服务端授权和数据生命周期。',
      '只列威胁不列验证方式，最后无法判断缓解措施是否真的有效。',
    ],
    sourceRefs: [
      'OWASP Threat Modeling Cheat Sheet；授权教学环境中的威胁建模方法参考。https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html',
      'NIST Cybersecurity Framework 2.0；风险管理与治理框架。https://www.nist.gov/cyberframework',
      'OWASP Top 10:2021；Web 应用风险分类参考。https://owasp.org/Top10/',
      '课程案例与威胁模型练习为原创；不连接真实第三方目标。',
    ],
    steps: [
      {
        title: '先保护资产，而不是先找漏洞',
        body: '安全工作的起点是“什么一旦泄露、被改坏或不可用就会造成损失”。学生作业、账号、日志和管理权限都是资产；没有资产清单，漏洞列表只是一堆孤立名词。',
        note: '资产 = 需要保护的数据、服务和能力',
      },
      {
        title: '画出主体、入口和信任边界',
        body: '浏览器、Web 服务、数据库、文件存储和管理员控制台之间都存在边界。标出谁向谁发送数据、哪一侧做授权判断，并假设浏览器端输入永远不可信。',
        note: '边界两侧的安全责任必须明确',
      },
      {
        title: '用 STRIDE 组织威胁假设',
        body: '从身份伪造、篡改、否认、信息泄露、拒绝服务和权限提升六类问题逐项提问。这里的目标不是把六类都写满，而是找出与当前系统最相关、最值得验证的威胁。',
        note: '威胁模型是问题清单，不是漏洞判决书',
      },
      {
        title: '在授权靶场验证一个假设',
        body: '只使用教学账号和隔离数据，验证“服务端是否重新检查资源归属”。记录请求、响应、日志和失败条件；不得连接真实第三方系统，也不使用真实凭据。',
        note: '授权边界：教学数据、隔离环境、可回滚',
      },
      {
        title: '把缓解措施写成可回归条件',
        body: '“加强安全”无法验证。应写成“普通用户访问他人资源返回 403，管理员经授权访问返回 200，并产生审计日志”。每条缓解措施都配一个可重复的回归检查。',
        note: '复盘 = 威胁假设 + 证据 + 修复 + 回归',
      },
    ],
  },
  'security:密码学与 PKI': {
    prerequisite: '完成“安全基础与威胁建模”，知道机密性、完整性和身份验证分别保护什么。',
    plainLanguageGoal: '学完后，你能区分哈希、对称加密和非对称加密的用途，读懂证书链的基本结构，并避免常见密钥管理错误。',
    guidedPractice: '用教学数据分别演示哈希校验、对称加解密和非对称签名验证，记录每一步输入、输出、密钥角色以及哪些数据不应写进日志。',
    independentPractice: '为一个虚构的内部 API 设计最小密钥与证书方案，写出谁持有私钥、证书如何轮换、日志中哪些字段必须脱敏，以及失败时如何告警。',
    commonErrors: [
      '把哈希当作加密，误以为哈希结果可以解密还原原文。',
      '把公钥和私钥用途混用，或在不理解协议的情况下自行“组合加密算法”。',
      '把密钥写进代码、日志或前端配置，认为文件不在页面展示就安全。',
    ],
    sourceRefs: [
      'NIST FIPS 197, Advanced Encryption Standard (AES)。https://csrc.nist.gov/pubs/fips/197/final',
      'NIST SP 800-57 Part 1 Rev. 5, Recommendation for Key Management。https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final',
      'OWASP Cryptographic Storage Cheat Sheet。https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html',
      '课程只做算法用途与生命周期讲解，不提供自创密码算法或真实凭据。',
    ],
    steps: [
      {
        title: '先区分四种安全目标',
        body: '机密性防止未授权读取，完整性防止静默篡改，身份验证确认主体，抗否认把签名与主体绑定。不同目标需要不同原语，不能用一个“加密”按钮解决全部问题。',
        note: '先写目标，再选算法',
      },
      {
        title: '用哈希做完整性校验',
        body: '哈希把任意长度输入映射为固定长度摘要，常用于文件校验、口令存储和签名前置处理。口令不能直接使用快速哈希裸存，应采用带盐和成本参数的专用口令哈希。',
        note: '哈希不可逆，不等于加密',
      },
      {
        title: '比较对称与非对称密钥',
        body: '对称算法用同一密钥加解密，效率高；非对称算法用公私钥对解决密钥交换和签名问题。真实系统通常组合二者，而不是让非对称算法直接加密大量业务数据。',
        note: '公钥可公开，私钥绝不外传',
      },
      {
        title: '沿证书链验证身份',
        body: '证书把主体身份与公钥绑定，由签发机构签名。验证时要检查签发链、有效期、用途、域名和吊销状态；只看到“有小锁”不代表站点一定可信或业务一定安全。',
        note: '证书验证不是业务授权',
      },
      {
        title: '做一次密钥生命周期复盘',
        body: '列出生成、分发、使用、轮换、吊销和销毁六个阶段。任何阶段缺少责任人或审计记录，都可能让算法本身的安全属性失效。课程不保存真实私钥或生产凭据。',
        note: '密钥管理失误往往比算法选择更危险',
      },
    ],
  },
} satisfies CuratedCoursePlanMap;
