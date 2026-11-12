import type { SecurityModule } from './security-curriculum.js';

type ExpansionModule = Pick<
  SecurityModule,
  'useCase' | 'explanation' | 'code' | 'lesson' | 'lab'
>;

export const SECURITY_EXPANSION_ENRICHMENTS: Record<string, ExpansionModule> = {
  sec_crypto_aead: {
    useCase: '服务需要加密用户导出文件和消息，同时希望攻击者篡改密文时能够立即被发现。',
    explanation: 'AEAD 把加密和完整性认证放在同一个标准构造中。机密性、完整性和密钥管理仍然需要正确使用算法；随机数唯一性、附加认证数据和错误处理缺一不可。',
    code: {
      language: 'typescript',
      bad: "const cipher = createCipheriv('aes-256-ecb', key, null);",
      good: "const cipher = createCipheriv('aes-256-gcm', key, nonce);\ncipher.setAAD(Buffer.from(recordId));\nconst ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);",
      note: '使用成熟 AEAD 实现，nonce 必须唯一；记录标识作为附加认证数据可以阻止密文跨记录重放。',
    },
    lesson: {
      objectives: [
        '解释 AEAD 为什么同时解决机密性和完整性。',
        '识别 nonce 复用、无认证加密和错误处理不当的风险。',
        '为一个本地文件加密流程选择算法、随机数和附加认证数据。',
      ],
      keyTerms: [
        { term: 'AEAD', fullName: 'Authenticated Encryption with Associated Data（带关联数据的认证加密）', explanation: '同时提供加密和完整性认证的密码学构造，常见实现包括 AES-GCM 和 ChaCha20-Poly1305。' },
        { term: 'AES', explanation: '常用对称分组密码；AES-GCM 在 AES 基础上提供认证加密，但 nonce 复用会破坏安全性。' },
        { term: 'GCM', fullName: 'Galois/Counter Mode（伽罗瓦计数器模式）', explanation: '一种 AEAD 工作模式，输出密文和认证标签。加密或解密失败时必须丢弃结果，不能继续使用未认证数据。' },
        { term: 'nonce', explanation: '一次性随机数或计数器，同一个密钥下不能重复。重复使用会破坏 GCM 等算法的安全性。' },
        { term: 'ECB', fullName: 'Electronic Codebook（电子密码本模式）', explanation: '逐块独立加密的旧模式，相同明文块会产生相同密文，不隐藏数据结构，不应在新系统中使用。' },
        { term: 'CBC', fullName: 'Cipher Block Chaining（密码分组链接模式）', explanation: '需要随机 IV 的分组加密模式。它只提供机密性，完整性需要额外 MAC 且实现容易出错。' },
        { term: 'IV', fullName: 'Initialization Vector（初始化向量）', explanation: '某些加密模式用于引入随机性的输入。IV 可公开但不能在不该复用时重复。' },
        { term: 'MAC', fullName: 'Message Authentication Code（消息认证码）', explanation: '用密钥验证消息完整性和来源的短标签；没有密钥的人不应能伪造。' },
        { term: 'ID', fullName: 'Identifier（标识符）', explanation: '用于唯一识别记录、对象或请求的值；对象 ID 必须与服务端授权条件绑定。' },
      ],
      walkthrough: [
        { title: '先确定保护目标', detail: '如果只需要隐藏内容，普通加密可能足够；如果还需要发现篡改，就必须使用 AEAD 或加密加独立消息认证。' },
        { title: '把上下文绑定进认证', detail: '记录 ID、用户或用途可以作为附加认证数据。这样同一密文换到另一条记录或另一个租户会被拒绝。' },
        { title: '管理密钥和随机数', detail: '每个密钥使用独立的随机数空间，优先由标准库生成。绝不能为了“可重现”而固定 nonce 或复用密钥流。' },
        { title: '失败关闭并轮换', detail: '认证标签校验失败时停止处理并记录安全事件。怀疑密钥泄露时停止解密、轮换密钥并评估历史数据影响。' },
      ],
      knowledgeChecks: [
        { question: 'AES-CBC 加随机 IV 是否已经等于 AEAD？', answer: '不等于。CBC 只提供加密，不能可靠证明完整性；需要额外 MAC 且构造要正确。新系统应优先使用标准 AEAD。' },
        { question: '为什么认证失败后不能返回部分明文？', answer: '部分明文可能已经被篡改或来自错误上下文，继续使用会破坏完整性保证。AEAD 应整体认证失败并丢弃结果。' },
      ],
    },
    lab: {
      target: '本地 Node.js 加密实验',
      tools: ['Node.js crypto', '测试文件', '十六进制编辑器'],
      steps: [
        '用 AES-GCM 加密固定测试文件，记录 nonce、附加认证数据和认证标签。',
        '修改密文中的一个字节，确认解密认证失败且不输出明文。',
        '把附加认证数据换成另一条记录，确认解密被拒绝。',
        '分别验证随机 nonce 和重复 nonce 的行为，并删除所有测试密钥。',
      ],
      expected: '密文可正常解密，篡改密文或替换上下文后失败关闭，重复 nonce 的风险能被准确解释。',
    },
  },
  sec_crypto_signatures: {
    useCase: '发布系统需要证明软件包来自指定构建者，API 需要签名请求验证来源和完整性。',
    explanation: '数字签名用私钥生成、公钥验证，能证明消息来源与完整性。签名只覆盖明确传入的字节；用途、受众、时间和算法必须进入被签名的上下文，防止跨协议重放。',
    code: {
      language: 'typescript',
      bad: 'const ok = verify(null, payload, publicKey, signature);',
      good: "const signed = Buffer.concat([Buffer.from('release:v1\\n'), payload]);\nconst ok = verify(null, signed, publicKey, signature);",
      note: '把用途和版本写进签名上下文，避免同一签名字节被另一个协议复用。',
    },
    lesson: {
      objectives: [
        '区分签名、加密和消息认证码的用途。',
        '设计包含用途、受众和时间的签名上下文。',
        '在本地完成签名、验签和篡改检测。',
      ],
      keyTerms: [
        { term: '数字签名', explanation: '用私钥生成、公钥验证的数据，用于证明消息来源和完整性。' },
        { term: '私钥', explanation: '签名者控制的高敏感密钥。私钥泄露后攻击者可以伪造该签名者身份。' },
        { term: '算法混淆', explanation: '攻击者利用验签逻辑对不同算法或格式处理不一致，使无效签名被误认为有效。' },
        { term: 'API', explanation: '系统之间约定好的调用入口。请求签名和权限校验都应在服务端执行。' },
      ],
      walkthrough: [
        { title: '明确签名覆盖什么', detail: '只签正文往往不够。还要签版本、用途、受众、时间或哈希，避免签名被换到另一业务场景。' },
        { title: '限定算法和密钥', detail: '验签端不能接受算法字段中的任意值，应使用固定算法族和受信任公钥列表，防止降级与算法混淆。' },
        { title: '验证后再使用数据', detail: '签名失败时不能继续解析、安装或执行内容。先验证完整性，再进入业务处理。' },
        { title: '保护私钥生命周期', detail: '签名私钥放在受控硬件或密钥服务中，使用权限、审批、审计和轮换，避免进入构建日志和开发者设备。' },
      ],
      knowledgeChecks: [
        { question: '公钥能否用来生成签名？', answer: '不能。私钥用于签名，公钥用于验证。公钥可以公开，私钥必须严格保护。' },
        { question: '签名有效是否说明消息内容业务上可信？', answer: '不说明。签名只证明某个私钥签署了这些字节，仍需判断签名者是否可信、用途是否正确以及内容是否过期。' },
      ],
    },
    lab: {
      target: '本地密钥对与软件包签名实验',
      tools: ['openssl', 'PowerShell', '测试压缩包'],
      steps: [
        '生成一对仅用于测试的密钥，记录公钥指纹并限制私钥文件权限。',
        '对测试包哈希和发布上下文进行签名，保存签名与公钥。',
        '修改测试包一个字节后验签，确认失败。',
        '把签名换到另一个用途并验签，确认上下文绑定生效。',
      ],
      expected: '正确内容验签成功，篡改内容或复用签名失败，测试私钥在实验后删除。',
    },
  },
  sec_crypto_pki: {
    useCase: '内部服务通过 HTTPS 相互调用，需要确认服务证书确实属于目标主机而不是被代理替换。',
    explanation: 'PKI 用证书把公钥与身份绑定。验证不仅是“证书存在”，还要检查签名链、主机名、有效期、用途和吊销状态。自动化签发和续期让正确验证可以长期维持。',
    code: {
      language: 'bash',
      bad: 'curl -k https://api.internal/health',
      good: 'curl --cacert ./test-ca.pem --resolve api.internal:443:127.0.0.1 https://api.internal/health',
      note: '测试环境使用受控 CA 和主机名解析，不能用 -k 关闭证书校验。',
    },
    lesson: {
      objectives: [
        '说明根证书、中间证书和叶证书在信任链中的作用。',
        '检查主机名、有效期、用途和吊销状态。',
        '在本地 CA 环境中验证错误证书被拒绝。',
      ],
      keyTerms: [
        { term: 'PKI', fullName: 'Public Key Infrastructure（公钥基础设施）', explanation: '用证书、CA、策略和撤销机制管理公钥与身份绑定的体系。' },
        { term: 'CA', fullName: 'Certificate Authority（证书颁发机构）', explanation: '签发和吊销证书的可信机构。信任一个 CA 等于信任其遵守签发策略。' },
        { term: 'SNI', fullName: 'Server Name Indication（服务器名称指示）', explanation: 'TLS 客户端在握手时发送目标主机名，服务器据此选择证书；客户端仍需验证返回证书的主机名。' },
        { term: 'TLS', explanation: '为连接提供加密和服务器身份验证的协议，证书校验是其中的关键步骤。' },
        { term: 'HTTPS', explanation: '在 HTTP 之上使用 TLS 保护的访问方式，客户端必须验证服务器证书和主机名。' },
      ],
      walkthrough: [
        { title: '先验证信任链', detail: '从叶证书沿中间证书到受信任根，检查签名、有效期和证书用途。缺少中间证书会导致部分客户端验证失败。' },
        { title: '再验证目标身份', detail: '证书必须包含当前访问的主机名或匹配的通配符。只看签名有效而不看主机名，会把合法但错误的证书当成目标身份。' },
        { title: '处理吊销和更新', detail: '配置吊销策略或短期证书加自动续期，证书到期前告警。私钥泄露时吊销旧证书并重新签发。' },
        { title: '测试失败路径', detail: '使用错误主机名、过期证书和不受信任 CA 做负向测试，确认客户端坚持失败而不是静默降级。' },
      ],
      knowledgeChecks: [
        { question: '证书由受信任根签名是否足够？', answer: '不够。还要检查主机名、有效期、用途和吊销状态，以及客户端是否使用了正确的信任库。' },
        { question: '为什么关闭证书校验会破坏 HTTPS 的意义？', answer: '加密仍然存在，但客户端不再确认对端身份，中间人可以冒充服务器并读取或修改通信。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地 CA 与证书验证实验',
      tools: ['openssl', 'curl.exe', '本地 HTTPS 服务'],
      steps: [
        '创建仅用于实验的根 CA 和服务证书，记录证书链与指纹。',
        '启动只绑定回环地址的 HTTPS 服务，用正确主机名验证成功。',
        '分别测试错误主机名、过期证书和不受信任 CA，确认验证失败。',
        '删除测试私钥并记录证书生命周期和续期告警方案。',
      ],
      expected: '正确链与主机名通过，三类错误证书均被拒绝，实验私钥和 CA 不进入生产信任库。',
    },
  },
  sec_crypto_keymgmt: {
    useCase: '应用使用数据库加密密钥、API 签名密钥和第三方服务凭据，需要支持轮换和泄露响应。',
    explanation: '密钥管理不是把字符串放进环境变量。每类密钥需要明确用途、所有者、权限、版本、存储位置、轮换周期和撤销方式。版本化让旧数据可解密，同时让新数据快速切换到新密钥。',
    code: {
      language: 'typescript',
      bad: "const encryptionKey = '0123456789abcdef0123456789abcdef';",
      good: "const key = await keyStore.get({ purpose: 'export-encryption', version: 3 });\nconst wrapped = await keyStore.encrypt(key, data, { recordId });",
      note: '代码只引用密钥用途和版本，真实密钥由受控密钥库返回并记录使用审计。',
    },
    lesson: {
      objectives: [
        '按用途、环境和权限拆分密钥。',
        '设计支持多版本和回滚的轮换流程。',
        '在本地完成一次密钥轮换和泄露响应演练。',
      ],
      keyTerms: [
        { term: '密钥版本', explanation: '标识同一用途密钥的不同代次。版本化允许新旧密钥共存并逐步迁移数据。' },
        { term: '密钥用途', explanation: '规定密钥只能用于加密、签名、认证等明确场景，避免一个密钥跨业务复用。' },
        { term: '信封加密', explanation: '用主密钥保护数据密钥，再用数据密钥加密大量数据；轮换主密钥时不必重加密所有文件。' },
      ],
      walkthrough: [
        { title: '先建立密钥清单', detail: '记录每把密钥的用途、环境、所有者、存储、依赖系统、版本和轮换周期。没有清单就无法评估泄露影响。' },
        { title: '短期凭据优先', detail: '能用短期工作负载身份或临时令牌时，不保存长期密钥。长期密钥必须有更严格的存储和轮换。' },
        { title: '平滑轮换', detail: '先生成新版本并允许双版本验证，再批量重加密或迁移，最后撤销旧版本。每一步都要有回滚条件。' },
        { title: '泄露响应', detail: '怀疑泄露时立即限制使用、生成新版本、审计调用记录并通知受影响方。只删除仓库当前行不足以消除历史副本。' },
      ],
      knowledgeChecks: [
        { question: '把密钥放入环境变量是否已经完成密钥管理？', answer: '没有。环境变量只是注入方式，仍需专用存储、最小权限、版本、轮换、撤销和审计。' },
        { question: '为什么轮换前要确认旧版本仍有依赖？', answer: '旧数据或验证流程可能仍需要旧版本。没有依赖清单会直接吊销必要密钥，造成数据不可用。' },
      ],
    },
    lab: {
      target: '本地密钥轮换桌面演练',
      tools: ['密钥清单模板', '本地测试服务', '审计日志样例'],
      steps: [
        '列出测试项目使用的三类密钥，补充用途、所有者、依赖和轮换周期。',
        '为加密密钥建立 v1/v2 双版本读取，验证旧数据仍可解密。',
        '模拟 v1 泄露，撤销 v1、切换新写入到 v2，并检查审计记录。',
        '输出回滚条件和受影响数据清单，删除所有测试密钥。',
      ],
      expected: '轮换期间新旧数据可用，泄露密钥被撤销，调用审计和回滚条件完整。',
    },
  },
  sec_crypto_tls: {
    useCase: '团队为公网 API、内部服务和工作负载设计 TLS，需要避免协议降级和错误信任。',
    explanation: '现代 TLS 配置同时涉及协议版本、证书验证、主机名、密码套件和密钥交换。服务端负责配置，客户端负责验证；任何一端放松校验都会破坏连接身份保证。',
    code: {
      language: 'yaml',
      bad: 'tls_verify: false\nmin_version: TLSv1\nallow_self_signed: true',
      good: 'tls_verify: true\nmin_version: TLSv1.2\nallow_self_signed: false\nhostname_verification: true',
      note: '生产客户端保持证书和主机名验证；内部测试 CA 通过显式信任库加入，而不是关闭校验。',
    },
    lesson: {
      objectives: [
        '配置现代 TLS 版本、证书链和主机名验证。',
        '解释双向 TLS 与普通单向 TLS 的身份边界。',
        '在本地客户端完成一次失败证书验证测试。',
      ],
      keyTerms: [
        { term: 'TLS 1.3', explanation: '现代 TLS 版本，简化握手并移除许多过时算法；部署时仍需正确验证证书和密钥。' },
        { term: '双向 TLS', explanation: '客户端验证服务器证书，服务器也验证客户端证书，用于强化服务间身份认证。' },
        { term: '证书固定', explanation: '客户端只信任预先指定的证书或公钥。固定策略必须包含备份和轮换流程，否则证书更新会造成全面中断。' },
        { term: 'SNI', explanation: 'TLS 握手时携带的目标主机名；它帮助服务器选择证书，但不能替代客户端证书校验。' },
      ],
      walkthrough: [
        { title: '先确定连接两端身份', detail: '普通 HTTPS 主要验证服务器，双向 TLS 还要求客户端证书。服务身份和用户身份不能混为一谈。' },
        { title: '保持验证开启', detail: '客户端验证证书链、主机名、有效期和用途。内部自签环境通过受控信任库测试，不通过全局关闭验证解决。' },
        { title: '限制协议和算法', detail: '禁用过时协议和弱算法，优先由平台维护安全默认值。固定算法时保留迁移与升级计划。' },
        { title: '验证失败路径', detail: '测试错误主机名、过期证书、错误 CA 和缺失客户端证书，确认连接失败而不是降级成功。' },
      ],
      knowledgeChecks: [
        { question: '双向 TLS 是否意味着应用内部不再需要授权？', answer: '不意味着。双向 TLS 证明客户端持有证书，但具体用户或服务工作负载能访问哪些对象仍需应用授权。' },
        { question: '证书固定为什么必须有轮换预案？', answer: '固定证书更新时客户端可能全部拒绝连接。必须提前分发备份或固定公钥并安排灰度更新。' },
      ],
    },
    lab: {
      target: '127.0.0.1 TLS 客户端验证实验',
      tools: ['openssl', 'curl.exe', '本地 HTTPS 服务'],
      steps: [
        '检查服务证书链、TLS 版本和主机名。',
        '用正确信任库访问并记录成功结果。',
        '使用错误 CA、错误主机名和过期证书，确认客户端拒绝连接。',
        '配置测试双向 TLS，验证缺失客户端证书时握手失败。',
      ],
      expected: '正确连接成功，错误证书与缺失客户端证书失败，TLS 版本和信任来源可被审计。',
    },
  },
  sec_identity_oauth: {
    useCase: '桌面应用和单页应用需要让用户通过外部身份提供方登录，同时不能把客户端密钥放进前端。',
    explanation: 'OAuth 授权码流程把用户授权与访问令牌交换分开。公共客户端使用 PKCE 证明发起请求和兑换授权码的是同一个客户端，重定向地址和 scope 则限制令牌流向与能力。',
    code: {
      language: 'typescript',
      bad: 'const redirect = req.query.redirect;\nreturn res.redirect(`${provider}?redirect_uri=${redirect}`);',
      good: "if (!ALLOWED_REDIRECTS.has(String(req.query.redirect_uri))) return res.sendStatus(400);\nreturn res.redirect(buildAuthorizeUrl({ redirectUri: String(req.query.redirect_uri), codeChallenge }));",
      note: '重定向地址必须精确匹配预登记值，公共客户端必须校验 PKCE 的 code verifier。',
    },
    lesson: {
      objectives: [
        '说明授权码、access token 和 PKCE 的关系。',
        '识别开放重定向、授权码重放和 scope 过大的风险。',
        '在本地 OAuth 模拟环境中完成一次授权码兑换。',
      ],
      keyTerms: [
        { term: 'OAuth', explanation: '授权框架，允许客户端在用户授权后获得有限访问令牌；它不是单独的登录协议。' },
        { term: 'PKCE', fullName: 'Proof Key for Code Exchange（授权码交换证明密钥）', explanation: '公共客户端在授权前生成随机 verifier 和 challenge，兑换授权码时证明是同一客户端发起请求。' },
        { term: 'redirect_uri', explanation: '授权服务器把授权码返回给客户端的地址，必须精确登记，不能被请求参数任意覆盖。' },
        { term: 'scope', explanation: '令牌被允许访问的能力范围。应按最小需要申请并校验，不能默认申请全部权限。' },
        { term: 'API', explanation: '系统之间的调用入口。资源服务仍要校验令牌的受众、scope 和业务授权。' },
        { term: 'URL', explanation: '网络资源地址。OAuth 回调地址必须使用预登记 URL，不能由请求参数任意覆盖。' },
      ],
      walkthrough: [
        { title: '从用户授权开始', detail: '客户端生成 state 和 PKCE verifier，打开授权地址。state 用于关联回调，防止请求伪造和混淆。' },
        { title: '严格校验回调', detail: '授权服务器只接受预登记 redirect_uri，回调客户端校验 state。缺失或不匹配时停止兑换。' },
        { title: '用授权码兑换令牌', detail: '授权码短时有效且只能使用一次，兑换时提交 PKCE verifier。公共客户端不依赖客户端密钥。' },
        { title: '按 scope 使用令牌', detail: '访问 API 时服务端校验受众和 scope，资源服务器不能因为令牌签名有效就允许所有动作。' },
      ],
      knowledgeChecks: [
        { question: 'state 参数是否可以省略？', answer: '不应省略。它帮助客户端确认回调属于当前授权请求，降低授权码注入和跨请求混淆风险。' },
        { question: '为什么公共客户端必须使用 PKCE？', answer: '桌面和单页应用无法安全保存客户端密钥。PKCE 用一次性 verifier 证明授权码兑换来自同一个客户端。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地 OAuth 模拟服务',
      tools: ['浏览器 DevTools', 'curl.exe', '测试身份提供方'],
      steps: [
        '发起授权请求，记录 state、challenge、scope 和 redirect_uri。',
        '用正确 verifier 兑换授权码，确认令牌受众和 scope 正确。',
        '尝试未登记 redirect_uri、错误 verifier 和重复授权码，确认全部拒绝。',
        '删除测试会话和令牌，记录审计事件。',
      ],
      expected: '合法授权完成，三类错误请求失败，令牌只拥有最小 scope 且可撤销。',
    },
  },
  sec_identity_oidc: {
    useCase: '后端接收身份提供方签发的身份令牌，需要确认令牌确实是给当前应用并且未过期。',
    explanation: 'OIDC 在 OAuth 之上提供身份层。ID token 是签名令牌，客户端必须验签并校验发行方、受众、时间和 nonce。只做 Base64 解码或读取用户名不构成身份验证。',
    code: {
      language: 'typescript',
      bad: 'const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));\nreq.user = payload;',
      good: "const claims = await verifier.verify(token, { issuer: ISSUER, audience: CLIENT_ID, nonce });\nif (!claims.sub || claims.exp <= now) throw new Error('invalid identity token');",
      note: '必须使用受信任密钥和固定发行方、受众验证签名，再读取 sub 等声明。',
    },
    lesson: {
      objectives: [
        '说明 OIDC ID token 与 OAuth access token 的区别。',
        '校验签名、发行方、受众、时间和 nonce。',
        '在本地完成有效、伪造和过期令牌测试。',
      ],
      keyTerms: [
        { term: 'OIDC', fullName: 'OpenID Connect（开放身份连接）', explanation: '建立在 OAuth 2.0 之上的身份层，用 ID token 表达用户身份和认证事件。' },
        { term: 'nonce', explanation: '客户端在认证请求中生成并期望在 ID token 中返回的值，用于降低令牌重放和混入风险。' },
        { term: '受众', explanation: '令牌声明中的 aud，表示该令牌面向哪个客户端或资源服务。受众不匹配时不能接受。' },
        { term: 'JWT', explanation: '常用的签名令牌格式，便于携带声明；签名有效仍需校验发行方、受众、时间和用途。' },
      ],
      walkthrough: [
        { title: '获取受信任公钥', detail: '从身份提供方的受控发现文档或配置加载公钥，处理密钥轮换和缓存，不从令牌头里的任意地址下载密钥。' },
        { title: '严格验签', detail: '固定允许算法，验证签名和密钥 ID。拒绝 none 算法和算法混淆，验签失败立即停止。' },
        { title: '校验声明语义', detail: '检查 issuer、audience、exp、iat、nonce 和 subject。每个应用只接受面向自己的令牌。' },
        { title: '建立本地会话', detail: '验证身份后再签发应用自己的短期会话。不要把外部 ID token 长期原样存进 Cookie 当成会话。' },
      ],
      knowledgeChecks: [
        { question: 'ID token 签名有效是否说明它属于当前应用？', answer: '不说明。必须校验 audience 和 issuer，确保令牌是当前身份提供方签发给当前客户端的。' },
        { question: '为什么不能从 JWT 头部任意 URL 拉取公钥？', answer: '攻击者可以控制头部并指向自己的密钥，从而伪造验证链。公钥来源必须受信任并预先配置。' },
      ],
    },
    lab: {
      target: '本地身份令牌校验实验',
      tools: ['Node.js', '本地测试密钥', 'JWT 调试工具'],
      steps: [
        '生成测试身份提供方密钥和有效 ID token。',
        '验证正确签名、issuer、audience 和 nonce，允许登录。',
        '测试篡改签名、错误受众、过期时间和错误 nonce，确认全部拒绝。',
        '轮换测试公钥，验证缓存更新后旧/新令牌行为符合预期。',
      ],
      expected: '有效令牌只对正确客户端生效，伪造和过期令牌被拒绝，公钥轮换可处理。',
    },
  },
  sec_identity_session: {
    useCase: '用户登录后需要安全保持会话，同时支持多因素认证、设备丢失和账号恢复。',
    explanation: '账号接管经常绕过主登录页，从找回密码、邮箱变更、恢复码和长期会话进入。会话还要支持轮换、撤销和设备管理，才能在凭据泄露后快速止损。',
    code: {
      language: 'typescript',
      bad: "res.cookie('sid', sessionId, { maxAge: 90 * 86400000 });",
      good: "res.cookie('sid', sessionId, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 8 * 3600000 });\nawait sessions.rotate(userId, previousSessionId);",
      note: '登录和提权后轮换会话，并对退出、改密和设备撤销提供明确失效机制。',
    },
    lesson: {
      objectives: [
        '把登录、会话、MFA 和账号恢复放在同一威胁模型中。',
        '设计会话轮换、撤销和异常登录检测。',
        '在本地测试恢复流程和旧会话失效。',
      ],
      keyTerms: [
        { term: 'MFA', explanation: '多因素认证，要求密码之外的第二类因素，降低密码泄露后的账号接管风险。' },
        { term: '会话轮换', explanation: '登录、提权或敏感操作后签发新的会话标识，并让旧标识失效。' },
        { term: '恢复码', explanation: 'MFA 设备丢失时使用的一次性或有限次数恢复凭据，必须安全保存并支持撤销。' },
        { term: '账号接管', explanation: '攻击者获得受害者账号控制权，可能通过窃取会话、重置密码或绕过恢复流程实现。' },
      ],
      walkthrough: [
        { title: '先保护登录', detail: '使用慢密码哈希、限速和 MFA，登录成功后轮换会话 ID，避免会话固定。' },
        { title: '把恢复流程当成登录入口', detail: '找回密码和修改邮箱同样可以接管账号。恢复请求使用多通道验证，并通知已有设备。' },
        { title: '支持用户止损', detail: '提供查看设备、撤销会话和重新认证。修改密码或检测到异常时使旧会话失效。' },
        { title: '记录安全事件', detail: '记录登录、MFA 变更、恢复、设备撤销和敏感操作，结合来源与结果做异常检测。' },
      ],
      knowledgeChecks: [
        { question: '有 MFA 是否就不怕账号接管？', answer: '不是。攻击者可能攻击恢复流程、会话 Cookie、帮助台或恶意扩展。MFA 只是多层防护中的一层。' },
        { question: '修改密码后为什么应撤销旧会话？', answer: '旧会话可能已经被攻击者控制。修改密码只有在新旧会话失效并重新认证后，才能真正阻断持续访问。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地登录与会话恢复实验',
      tools: ['浏览器 DevTools', 'curl.exe', '测试账号'],
      steps: [
        '登录并记录 Cookie 属性、会话 ID 和轮换时间。',
        '修改密码并检查旧会话失效，确认新设备需要重新认证。',
        '走一次恢复码流程，验证一次性使用和已有设备通知。',
        '撤销全部设备后检查审计日志和异常登录告警。',
      ],
      expected: '登录后会话轮换，恢复流程受控，旧会话和恢复码失效，所有敏感动作有审计记录。',
    },
  },
  sec_identity_authz: {
    useCase: '多租户 SaaS 同时使用角色、组织属性和对象归属判断用户能访问哪些资源。',
    explanation: '认证只说明主体是谁，授权要判断主体能否对某个资源执行某个动作。RBAC 适合职责，ABAC 适合环境和属性，但对象级查询仍需在服务端绑定当前主体。',
    code: {
      language: 'typescript',
      bad: "if (req.user.role === 'admin') return documents.findById(id);",
      good: "return documents.findOne({ id, tenantId: req.user.tenantId, allowedSubjects: req.user.subjectId });",
      note: '角色只是条件之一；对象查询必须绑定租户和允许主体，避免跨租户或跨对象越权。',
    },
    lesson: {
      objectives: [
        '区分角色授权、属性条件和对象级授权。',
        '把授权条件下沉到服务端查询层。',
        '用两个账号验证跨租户访问被拒绝。',
      ],
      keyTerms: [
        { term: 'RBAC', explanation: '基于角色的访问控制，给角色分配稳定职责权限，再给用户分配角色。' },
        { term: 'ABAC', fullName: 'Attribute-Based Access Control（基于属性的访问控制）', explanation: '按用户、资源、环境和动作属性判断权限，适合时间、部门和数据等级等动态条件。' },
        { term: '对象级授权', explanation: '每次访问具体对象时检查主体与对象的关系，而不只检查是否登录。' },
        { term: '职责分离', explanation: '把申请、审批、执行和审计等高风险职责拆开，避免单个人完成全部操作。' },
      ],
      walkthrough: [
        { title: '先定义动作', detail: '读取、修改、删除、导出和审批是不同动作。不要用一个“管理员”布尔值代替整个权限模型。' },
        { title: '把条件放进查询', detail: '对象查询同时绑定 tenantId、owner 或允许主体，减少先查全量再在内存判断造成遗漏。' },
        { title: '处理动态属性', detail: 'ABAC 条件如部门、时间、网络位置和数据等级需要可信来源，不能让客户端自行声明。' },
        { title: '定期验证权限', detail: '用跨租户、共享对象、离职账号和批量接口测试授权。高权限动作记录 actor、object 和结果。' },
      ],
      knowledgeChecks: [
        { question: 'RBAC 能否替代对象级授权？', answer: '不能。角色说明岗位或职责，不能证明当前用户拥有某个订单、文件或租户对象。' },
        { question: '权限判断为什么不能只在前端完成？', answer: '前端代码和请求均可被修改。授权必须在服务端对每个对象和动作执行。' },
      ],
    },
    lab: {
      target: '本地多租户授权靶场',
      tools: ['两个测试账号', 'curl.exe', '浏览器 DevTools'],
      steps: [
        '为账号 A/B 创建不同租户的测试对象并记录 ID。',
        '分别用本人、同租户他人和跨租户身份请求对象。',
        '在查询层绑定 tenantId 和 allowedSubjects，重复同一组请求。',
        '验证错误响应不泄露对象存在性，并检查授权审计。',
      ],
      expected: '本人访问成功，同租户无权限和跨租户访问均失败，审计记录包含主体、对象和结果。',
    },
  },
  sec_identity_privileged: {
    useCase: '运维需要管理生产数据库和云账户，但不应长期持有管理员权限。',
    explanation: '特权访问管理关注谁在高风险时刻获得了什么权限、为什么获得、使用了多久。临时提权、个人身份、审批和审计比共享管理员密码更容易追责和撤销。',
    code: {
      language: 'yaml',
      bad: 'service_account: production-admin\ncredential: long-lived-key\napproval: none',
      good: 'role: database-operator\nduration: 30m\napproval: change-ticket\nidentity: workload-federated\nsession_recording: true',
      note: '高权限使用短期身份和审批，结束后自动收回，并保留完整会话审计。',
    },
    lesson: {
      objectives: [
        '区分人、服务和应急三类特权身份。',
        '设计即时提权、审批、时限和审计流程。',
        '把长期服务密钥迁移到短期工作负载身份。',
      ],
      keyTerms: [
        { term: '特权账号', explanation: '拥有管理、删除、权限变更或敏感数据访问能力的账号，是账号接管后的高价值目标。' },
        { term: '工作负载身份', explanation: '由平台签发给服务的短期身份，通常通过联合信任获得，无需保存长期密钥。' },
        { term: '即时提权', explanation: '用户在需要时申请临时高权限，经过审批后在限定时间自动失效。' },
        { term: '职责分离', explanation: '把申请、审批、执行和审计分配给不同主体，降低单点滥用风险。' },
        { term: 'CI', explanation: '持续集成流水线。其中的发布身份属于高权限服务身份，应使用短期凭据和最小权限。' },
      ],
      walkthrough: [
        { title: '盘点高权限入口', detail: '云管理员、数据库超级用户、Kubernetes 集群管理员、CI 发布密钥和备用应急账号都要纳入清单。' },
        { title: '使用个人身份与临时权限', detail: '避免共享账号。用户先以自己的身份认证，再申请短期角色，审批后获得限定权限。' },
        { title: '缩短凭据存在时间', detail: '服务优先使用工作负载联合身份，长期密钥只保留受控例外，设置轮换和泄露响应。' },
        { title: '审计使用过程', detail: '记录审批、提权、命令、对象和持续时间。高风险管理操作需要会话记录和事后复核。' },
      ],
      knowledgeChecks: [
        { question: '为什么共享管理员账号难以安全运营？', answer: '无法确认实际操作者，密码泄露后难以定位来源，人员离开时也难以精确撤销个人权限。' },
        { question: '临时提权是否还需要审计？', answer: '需要。审计应覆盖谁申请、谁批准、获得了什么权限、执行了什么以及何时失效。' },
      ],
    },
    lab: {
      target: '本地特权访问桌面演练',
      tools: ['权限矩阵模板', '审批记录', '云 IAM 模拟配置'],
      steps: [
        '列出一个测试环境的三类特权身份和当前凭据生命周期。',
        '设计一次 30 分钟数据库运维提权，包含申请、审批和撤销。',
        '把模拟长期服务密钥替换为短期工作负载身份。',
        '导出审计时间线，确认能回答谁在何时做了什么。',
      ],
      expected: '高权限临时可控，共享长期凭据被移除，审批和操作审计可完整还原。',
    },
  },
  sec_api_auth: {
    useCase: '移动端、单页应用和第三方系统调用同一组 API，需要按调用方限制身份、权限和生命周期。',
    explanation: 'API 认证要区分用户令牌、客户端凭据和服务身份。令牌应短期、按范围授权、可撤销，并绑定正确的受众；长期通用密钥不适合作为所有客户端的默认方案。',
    code: {
      language: 'typescript',
      bad: "headers: { 'X-Api-Key': 'shared-production-key' }",
      good: "headers: { Authorization: `Bearer ${await tokenService.issueShortLived({ subject, audience, scope })}` }",
      note: '令牌按调用方和资源服务签发，包含受众、scope 和短过期时间，并支持撤销。',
    },
    lesson: {
      objectives: [
        '区分用户令牌、客户端凭据和服务身份。',
        '为 API 设计受众、scope、过期和撤销边界。',
        '在本地 API 中验证过期和错误受众令牌被拒绝。',
      ],
      keyTerms: [
        { term: 'API', explanation: '系统间的调用入口，认证、授权、限速和审计都必须在服务端执行。' },
        { term: '访问令牌', explanation: '调用 API 时携带的短期身份或授权凭据，应明确主体、受众、scope 和有效期。' },
        { term: 'scope', explanation: '令牌允许访问的能力范围，不能用一个全权限令牌覆盖所有接口。' },
        { term: '令牌撤销', explanation: '在退出、设备丢失或风险事件后让令牌提前失效的机制。' },
      ],
      walkthrough: [
        { title: '先区分调用方', detail: '真实用户、移动客户端、后台服务和第三方集成有不同信任边界，不能共用同一个长期密钥。' },
        { title: '签发最小令牌', detail: '令牌包含主体、受众、scope 和短过期时间。资源服务检查受众，避免给 A 服务的令牌调用 B 服务。' },
        { title: '处理刷新和撤销', detail: '刷新令牌只用于换取新访问令牌，支持设备绑定和撤销。高风险操作可以要求重新认证。' },
        { title: '验证失败路径', detail: '测试过期、错误受众、缺失 scope 和已撤销令牌，确保错误不泄露内部细节。' },
      ],
      knowledgeChecks: [
        { question: 'API 网关验证了令牌签名，业务接口还需要检查 scope 吗？', answer: '需要。签名只说明令牌有效，scope 和业务授权决定该令牌能否执行具体动作。' },
        { question: '为什么长期通用 API key 难以安全运营？', answer: '它通常权限过宽、缺少用户上下文且难以轮换。一旦泄露，会影响多个调用方并难以精确撤销。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地 API 令牌实验',
      tools: ['curl.exe', '本地 API', '测试身份服务'],
      steps: [
        '签发一个短过期、单一受众和单一 scope 的测试令牌。',
        '调用允许接口并确认成功，再调用缺少 scope 的接口确认失败。',
        '测试过期令牌、错误受众和已撤销令牌。',
        '检查审计日志只记录令牌标识或哈希，不记录完整令牌。',
      ],
      expected: '合法令牌只访问允许动作，过期、错误受众和撤销令牌均被拒绝，日志无令牌明文。',
    },
  },
  sec_api_authz: {
    useCase: '文档、订单和设备 API 按对象 ID 访问，需要防止用户修改 ID 后读取他人资源。',
    explanation: 'API 授权要覆盖单个对象、列表、批量、导出和嵌套资源。每个入口都必须验证主体、租户和对象关系，不能依赖前端隐藏按钮或接口返回字段看起来正常。',
    code: {
      language: 'typescript',
      bad: 'return documents.findById(req.params.id);',
      good: 'return documents.findOne({ id: req.params.id, tenantId: req.user.tenantId, ownerId: req.user.id });',
      note: '对象查询同时绑定租户和拥有者，缺失对象统一返回 404，减少枚举信息。',
    },
    lesson: {
      objectives: [
        '建立单个、列表、批量和导出接口的授权矩阵。',
        '解释对象级授权为什么必须发生在服务端查询层。',
        '用两个测试账号验证越权被阻断。',
      ],
      keyTerms: [
        { term: '对象级授权', explanation: '每次访问具体资源时，服务端检查当前主体是否有权对该对象执行该动作。' },
        { term: 'IDOR', explanation: '修改对象 ID 后访问他人资源，根因通常是服务端缺少对象级授权。' },
        { term: '批量接口', explanation: '一次提交多个对象或过滤条件的接口。必须逐项授权并限制数量，避免绕过单对象检查。' },
        { term: '租户隔离', explanation: '在查询和写入中绑定 tenantId，确保一个组织不能访问另一个组织的数据。' },
      ],
      walkthrough: [
        { title: '先列资源关系', detail: '明确对象属于用户、租户、项目还是共享空间。权限模型必须能表达这些关系。' },
        { title: '把条件写进查询', detail: '不要先按 ID 查出对象再在分支里判断。查询层同时绑定主体和对象条件更容易保持一致。' },
        { title: '覆盖所有入口', detail: '列表、搜索、导出、批量更新和嵌套子资源都可能绕过单对象接口，需要统一授权策略。' },
        { title: '一致化错误与审计', detail: '无权限和不存在使用相同响应，减少对象枚举；高价值访问记录主体、对象、动作和结果。' },
      ],
      knowledgeChecks: [
        { question: '列表接口只返回自己的数据，是否说明单对象接口也安全？', answer: '不说明。两个接口可能使用不同查询逻辑。必须分别测试单对象、列表、批量、导出和嵌套资源。' },
        { question: '为什么无权限时建议返回 404？', answer: '返回 404 可以降低攻击者通过 403/404 差异判断对象是否存在的可能，但授权仍会在服务端执行。' },
      ],
    },
    lab: {
      target: '本地 API 双账号授权靶场',
      tools: ['两个测试账号', 'curl.exe', 'Burp Repeater'],
      steps: [
        '账号 A 创建唯一测试对象，记录 ID、租户和清理方式。',
        '账号 B 访问该对象、列表过滤和批量接口，记录是否越权。',
        '修复查询条件并重复三类请求，确认统一返回 404。',
        '账号 A 正常访问成功，测试对象删除后审计仍可追踪。',
      ],
      expected: '所有入口都执行对象级授权，跨账号访问失败，本人访问正常且测试数据已清理。',
    },
  },
  sec_api_limits: {
    useCase: '搜索、导出、文件上传和模型调用接口可能被批量请求或超大输入拖垮，需要按成本设置边界。',
    explanation: '限速不等于简单按 IP 计数。身份、租户、端点、成本和并发都要纳入配额；输入长度、数组大小、分页和响应体同样需要上限，否则合法请求也可能耗尽资源。',
    code: {
      language: 'yaml',
      bad: 'rate_limit: none\nmax_page_size: 100000\nmax_request_bytes: unlimited',
      good: 'rate_limit: 60/min\nper_tenant_concurrency: 5\nmax_page_size: 100\nmax_request_bytes: 1048576',
      note: '按身份和租户限制，并为高成本接口设置更小配额、超时和响应上限。',
    },
    lesson: {
      objectives: [
        '按身份、租户、端点和成本设计分层限额。',
        '为分页、字段、数组和响应体设置边界。',
        '在本地服务中验证限速和超大请求被拒绝。',
      ],
      keyTerms: [
        { term: '速率限制', explanation: '限制单位时间内请求次数或并发，避免暴力尝试和资源耗尽。' },
        { term: '配额', explanation: '按用户、租户或服务分配的长期使用上限，与短期速率限制共同控制成本。' },
        { term: '请求体上限', explanation: '限制请求正文、字段、数组和文件大小，防止超大输入占用内存和数据库资源。' },
        { term: '成本预算', explanation: '对模型、导出、搜索等高成本操作记录消耗并设置预算，避免单个调用方产生异常费用。' },
        { term: 'IP', explanation: '网络地址。按 IP 限速是辅助维度，不能单独覆盖共享出口或轮换地址的攻击者。' },
      ],
      walkthrough: [
        { title: '识别高成本路径', detail: '搜索、聚合、导出、上传、转码和模型调用通常比普通读取消耗更多资源，应单独计量。' },
        { title: '分层限速', detail: '结合 IP、用户、租户和端点。共享 IP 不能误伤多人，单租户也不能绕过总额度。' },
        { title: '限制输入与输出', detail: '设置请求体、数组长度、分页大小、超时和响应体上限，避免一次请求占用过多内存和带宽。' },
        { title: '返回可行动错误', detail: '超限响应说明重试时间和配额类型，但不要泄露内部阈值细节；监控持续命中限速的账号。' },
      ],
      knowledgeChecks: [
        { question: '只按 IP 限速为什么不够？', answer: '攻击者可以换 IP，合法用户也可能共享出口。需要结合用户、租户和端点维度，并为高成本动作单独配额。' },
        { question: '分页大小是否只是性能参数？', answer: '不是。过大的分页可以被用来批量导出数据或耗尽内存，必须结合授权、字段白名单和最大条数限制。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地 API 限速实验',
      tools: ['本地 API', 'curl.exe', '小型压力脚本'],
      steps: [
        '对一个普通接口发送超过限额的请求，记录 429 响应和重试提示。',
        '提交超过请求体、数组长度和分页上限的请求，确认被拒绝。',
        '用两个用户和同一租户验证租户总额度与单用户额度同时生效。',
        '检查限速日志包含主体和端点，不包含完整敏感请求体。',
      ],
      expected: '超限请求被稳定拒绝，正常请求不受影响，租户与用户额度生效，日志可用于审计。',
    },
  },
  sec_mobile_storage: {
    useCase: '移动应用需要保存登录令牌、离线文件和设备标识，同时避免设备丢失或调试包泄露。',
    explanation: '移动设备上的普通文件、日志、剪贴板和备份都可能被读取。敏感值应使用系统安全存储，按认证状态访问，并明确哪些数据不能进入备份、截图和调试日志。',
    code: {
      language: 'typescript',
      bad: "await AsyncStorage.setItem('access_token', token);\nconsole.log('token', token);",
      good: "await secureStore.setItem('access_token', token, { requireAuthentication: true, backup: false });\nlogger.info({ event: 'token_stored' });",
      note: '令牌使用系统安全存储并排除备份，日志只记录事件不记录值。',
    },
    lesson: {
      objectives: [
        '区分普通缓存、敏感数据和密钥的存储要求。',
        '使用系统安全存储、认证访问和备份排除。',
        '检查日志、截图和剪贴板中的敏感信息泄露。',
      ],
      keyTerms: [
        { term: '安全存储', explanation: '由操作系统加密和访问控制保护的密钥或凭据存储，例如 Keychain 或 Keystore。' },
        { term: '生物识别', explanation: '使用指纹或面容等本机能力解锁安全存储中的敏感值，不能把生物特征本身保存到应用。' },
        { term: '备份排除', explanation: '标记敏感文件不进入系统或云备份，减少换机和备份泄露范围。' },
        { term: '剪贴板', explanation: '应用间共享文本的系统区域，可能被其他应用读取；敏感内容不应长期停留。' },
      ],
      walkthrough: [
        { title: '先分类数据', detail: '缓存图片、离线文档、访问令牌和数据库密钥的敏感度不同。分类决定存储、备份和清理要求。' },
        { title: '敏感值进入安全存储', detail: '令牌和密钥使用系统安全存储，需要时要求本机认证。普通缓存不保存长期秘密。' },
        { title: '减少旁路暴露', detail: '关闭敏感页面截图，避免日志和崩溃报告打印值，剪贴板设置短时清理。' },
        { title: '退出与丢失处理', detail: '退出登录清理令牌和敏感缓存，支持远程撤销设备会话；设备丢失后可让令牌失效。' },
      ],
      knowledgeChecks: [
        { question: '把令牌加密后放入普通文件是否足够？', answer: '通常不够。解密密钥也可能在同一设备上。应优先使用系统安全存储和受认证的密钥。' },
        { question: '为什么日志脱敏对移动端尤其重要？', answer: '移动日志可能被调试工具、崩溃平台或第三方 SDK 收集，令牌和个人数据会随日志离开应用边界。' },
      ],
    },
    lab: {
      target: '本地移动应用安全存储实验',
      tools: ['Android 模拟器或 iOS 模拟器', '调试工具', '测试账号'],
      steps: [
        '分别把测试令牌写入普通存储和安全存储，比较文件可见性。',
        '启用认证访问和备份排除，确认重启后仍可按设计读取。',
        '检查日志、截图和剪贴板，移除敏感值。',
        '执行退出登录和远程撤销，确认本地值被清理且令牌失效。',
      ],
      expected: '敏感值只存在于安全存储，日志与备份无明文，退出或撤销后应用无法继续使用旧令牌。',
    },
  },
  sec_mobile_release: {
    useCase: '移动应用准备发布到多个渠道，需要确保网络通信、签名、更新和构建包没有被篡改或降级。',
    explanation: '移动发布安全覆盖 TLS 校验、证书固定、应用签名、渠道构建和更新来源。防护要避免把调试包和测试证书带入生产，也要为证书或固定密钥轮换预留路径。',
    code: {
      language: 'yaml',
      bad: 'build: debug\nsigning: shared-test-key\ntls_verify: false\npinning: none',
      good: 'build: release\nsigning: protected-release-key\ntls_verify: true\npinning: primary-with-backup\nchannel: internal-store',
      note: '生产构建保持 TLS 校验，保护签名密钥，并为证书固定保留备份和轮换计划。',
    },
    lesson: {
      objectives: [
        '识别调试构建、错误签名和宽松 TLS 配置的风险。',
        '设计证书固定、签名保护和更新完整性检查。',
        '在本地验证生产包与测试包配置差异。',
      ],
      keyTerms: [
        { term: '证书固定', explanation: '客户端只信任指定证书或公钥，降低恶意 CA 风险，但必须保留备份和轮换预案。' },
        { term: '应用签名', explanation: '平台用来验证应用来源和更新连续性的签名机制；签名密钥泄露可能导致恶意更新。' },
        { term: '完整性校验', explanation: '检查应用文件、更新包和关键资源是否被修改，通常结合签名、哈希和平台安全能力。' },
        { term: '发布渠道', explanation: '应用进入用户设备的商店或分发路径。不同渠道需要一致的安全配置和版本审计。' },
        { term: 'SDK', fullName: 'Software Development Kit（软件开发工具包）', explanation: '为应用提供功能的第三方库和工具集合，也会访问网络、存储和权限，需要纳入发布审查。' },
        { term: 'TLS', explanation: '为网络连接提供加密和身份验证的协议。移动客户端应保持证书与主机名校验。' },
      ],
      walkthrough: [
        { title: '先锁定生产构建', detail: '发布包禁用调试能力，使用生产签名和受保护密钥，确认没有测试凭据和调试端点。' },
        { title: '保护网络通信', detail: '保持系统 TLS 校验，按风险增加证书固定。固定策略必须包含备用证书和版本化轮换。' },
        { title: '验证更新来源', detail: '只接受受信任渠道或服务端签名更新，检查版本、哈希和签名，拒绝降级。' },
        { title: '审查第三方组件', detail: 'SDK、插件和原生库也会访问网络和存储。发布前检查权限、数据收集和已知漏洞。' },
      ],
      knowledgeChecks: [
        { question: '证书固定是否能完全替代系统 TLS 校验？', answer: '不能。固定是在正常验证基础上的额外限制，仍需正确验证证书链、主机名和有效期。' },
        { question: '为什么应用签名密钥需要严格保护？', answer: '签名密钥决定平台是否接受更新。泄露后可能被用来发布看似合法的恶意更新。' },
      ],
    },
    lab: {
      target: '本地移动发布清单演练',
      tools: ['生产与测试构建配置', '签名检查工具', '网络代理'],
      steps: [
        '比较 debug 和 release 构建，确认调试、日志和测试凭据被关闭。',
        '检查 TLS 校验和证书固定配置，验证错误证书被拒绝。',
        '验证更新包签名、版本和哈希，尝试降级后确认被拒绝。',
        '列出渠道、签名密钥、固定证书和第三方 SDK 的负责人。',
      ],
      expected: '生产包无调试与测试配置，错误证书和降级更新被拒绝，发布依赖均有明确负责人。',
    },
  },
  sec_cloud_iam: {
    useCase: '云上服务需要访问对象存储和数据库，但不同环境、服务和人员不应拥有相同管理员权限。',
    explanation: '云 IAM 是云账户的主要授权边界。主体、动作、资源、条件和信任关系共同决定权限。通配符、角色链和长期访问密钥会把局部泄露放大成账户级风险。',
    code: {
      language: 'yaml',
      bad: 'effect: Allow\naction: "*"\nresource: "*"\ncredential: long-lived-access-key',
      good: 'effect: Allow\naction: [storage.objects.get, storage.objects.list]\nresource: test-bucket/export/*\nprincipal: workload-identity',
      note: '只授予明确动作和资源，服务使用短期工作负载身份，不使用长期账户密钥。',
    },
    lesson: {
      objectives: [
        '按主体、动作、资源和条件设计最小云权限。',
        '识别角色信任策略和长期访问密钥的风险。',
        '在本地策略样例中收敛通配符权限。',
      ],
      keyTerms: [
        { term: 'IAM', fullName: 'Identity and Access Management（身份与访问管理）', explanation: '管理云身份、角色、策略和权限边界的系统。' },
        { term: '最小权限', explanation: '身份只拥有完成任务所需的动作和资源范围，并尽量缩短有效时间。' },
        { term: '角色信任策略', explanation: '规定哪些主体可以代入某个云角色。信任范围过宽会让其他账号或服务获得高权限。' },
        { term: '长期访问密钥', explanation: '长期有效的云访问凭据，泄露后可持续使用。应优先工作负载身份和短期令牌。' },
      ],
      walkthrough: [
        { title: '从业务动作反推权限', detail: '列出服务实际读取、写入、删除和列出的资源，拒绝“先给管理员再收紧”的默认做法。' },
        { title: '限制角色链', detail: '检查谁能代入角色、角色又能代入谁。可链式提升的权限可能绕过直接权限边界。' },
        { title: '使用短期身份', detail: '工作负载通过平台联合身份获得短期凭据，减少长期访问密钥在配置和日志中出现。' },
        { title: '持续审计未使用权限', detail: '记录角色使用和失败请求，定期移除未使用动作、跨账号信任和过期例外。' },
      ],
      knowledgeChecks: [
        { question: '云角色有权限是否说明当前主体一定能代入？', answer: '不说明。角色还需要信任策略允许该主体代入，并可能受会话策略、权限边界和条件限制。' },
        { question: '为什么长期访问密钥比短期工作负载身份风险更高？', answer: '长期密钥易于复制、进入配置和日志，且泄露后长期有效；短期身份能自动过期并绑定工作负载。' },
      ],
    },
    lab: {
      target: '本地云 IAM 策略实验',
      tools: ['IAM 策略样例', '权限模拟器', '审计日志'],
      steps: [
        '列出一个测试服务实际需要读取的对象存储路径。',
        '把通配符管理员策略收敛为明确动作和资源。',
        '模拟跨账号角色代入和未授权动作，确认被拒绝。',
        '检查策略变更和访问审计，删除测试长期密钥。',
      ],
      expected: '服务只可访问指定资源，跨账号和未授权动作失败，策略变化有审计记录。',
    },
  },
  sec_cloud_storage: {
    useCase: '用户文件保存在对象存储中，需要通过应用授权或短时签名地址安全下载。',
    explanation: '对象存储绕过应用服务器直接提供数据，桶策略和对象权限就是新的安全边界。默认私有、短时签名、加密和访问日志共同防止公开泄露与不可追踪下载。',
    code: {
      language: 'yaml',
      bad: 'bucket: user-files\npublic_read: true\nsigned_url_ttl: 30d',
      good: 'bucket: user-files\npublic_read: false\nserver_side_encryption: true\nsigned_url_ttl: 5m\naccess_logging: true',
      note: '用户文件默认私有，短时签名 URL 绑定对象，并记录访问日志和异常下载。',
    },
    lesson: {
      objectives: [
        '解释桶策略为什么等同于新的访问控制边界。',
        '设计默认私有、短时签名和加密的对象存储。',
        '在本地对象存储模拟环境中验证公开访问被阻断。',
      ],
      keyTerms: [
        { term: '桶策略', explanation: '对象存储中定义谁能读取、写入或管理桶和对象的规则，错误配置可以绕过应用授权。' },
        { term: 'URL', explanation: '对象存储资源的访问地址，公开 URL 可能进入历史、日志和聊天记录，不能把难猜当作授权。' },
        { term: '服务端加密', explanation: '存储平台在写入磁盘前加密对象，降低底层存储或备份泄露的明文风险。' },
        { term: '访问日志', explanation: '记录谁在何时读取或修改对象，用于检测异常下载和调查数据泄露。' },
      ],
      walkthrough: [
        { title: '默认阻断公开访问', detail: '桶和对象默认私有，任何公开读取都需要明确业务审批、范围限制和监控。' },
        { title: '通过应用授权生成签名', detail: '服务端验证用户身份和对象归属后生成短时签名 URL，签名只覆盖指定对象和动作。' },
        { title: '加密并限制生命周期', detail: '启用服务端加密，定义版本、保留和删除策略，防止旧对象和临时副本长期滞留。' },
        { title: '监控异常访问', detail: '记录对象读取、批量下载、策略变更和公开访问尝试，对异常数量和来源告警。' },
      ],
      knowledgeChecks: [
        { question: '对象 URL 很长且难猜，是否可以视为访问控制？', answer: '不能。URL 会通过日志、浏览器历史和分享传播。访问控制必须由桶策略或短时签名明确执行。' },
        { question: '短时签名 URL 是否还需要对象级授权？', answer: '需要。签名只能证明服务端允许访问，服务端在签名前必须先确认当前用户拥有该对象。' },
      ],
    },
    lab: {
      target: '本地对象存储模拟实验',
      tools: ['本地对象存储模拟器', 'curl.exe', '两个测试账号'],
      steps: [
        '上传测试对象并确认匿名读取失败。',
        '由账号 A 申请短时签名地址，验证过期后访问失败。',
        '用账号 B 尝试获取 A 的签名，确认对象级授权先阻断。',
        '检查桶策略、加密和访问日志，删除测试对象。',
      ],
      expected: '对象默认私有，签名短时且按归属签发，过期和越权访问失败，访问日志完整。',
    },
  },
  sec_cloud_network: {
    useCase: '云上 Web 服务只需要访问数据库和对象存储，不应直接访问管理网段或任意公网地址。',
    explanation: '云网络安全要把入站、出站和管理面分开。私网子网、安全组、出站白名单和管理网络共同缩小横向移动与数据外传范围。',
    code: {
      language: 'yaml',
      bad: 'inbound: 0.0.0.0/0\negress: 0.0.0.0/0\nadmin_access: public-internet',
      good: 'inbound: [load-balancer:443]\negress: [database:5432, storage:443]\nadmin_access: [vpn:22]',
      note: '入站只允许负载均衡，出站只允许依赖服务，管理入口限制到受控网络。',
    },
    lesson: {
      objectives: [
        '区分入站、出站和管理面的网络边界。',
        '用私网子网和安全组缩小横向移动范围。',
        '在本地网络模拟中验证禁止连接被阻断。',
      ],
      keyTerms: [
        { term: '安全组', explanation: '云平台的虚拟防火墙规则，按来源、目标、协议和端口决定流量是否允许。' },
        { term: '私网子网', explanation: '没有直接公网路由的子网，通常用于数据库、缓存和管理组件。' },
        { term: '出站访问', explanation: '工作负载主动连接外部的方向。限制目标可以降低数据外传和 SSRF 影响。' },
        { term: '管理平面', explanation: 'SSH、数据库控制台和云管理接口等高风险管理入口，应与业务网络分离。' },
      ],
      walkthrough: [
        { title: '先画正常依赖', detail: '明确用户、负载均衡、应用、数据库、对象存储和管理网络的正常连接方向。' },
        { title: '默认拒绝再放行', detail: '安全组只开放必要来源和端口，数据库不接受公网访问，管理接口只允许受控网络。' },
        { title: '限制出站', detail: '应用只能访问数据库、对象存储和必要第三方服务，降低失守后的数据外传能力。' },
        { title: '验证实际规则', detail: '从工作负载内部测试允许和禁止连接，保存结果，避免只检查配置界面。' },
      ],
      knowledgeChecks: [
        { question: '数据库设置了强密码是否可以不隔离公网？', answer: '不可以。密码可能泄露或复用，公网暴露会增加暴力尝试和零日漏洞风险。应同时使用网络隔离和强认证。' },
        { question: '为什么出站白名单也属于安全控制？', answer: '攻击者常需要把数据发送到外部或访问云元数据。限制出站目标可以降低外传、SSRF 和横向移动成功率。' },
      ],
    },
    lab: {
      target: '127.0.0.1 本地云网络策略模拟',
      tools: ['容器网络', 'curl.exe', '策略配置'],
      steps: [
        '把 Web、数据库和管理服务放入不同测试网络。',
        '允许 Web 访问数据库必要端口，禁止访问管理端口。',
        '限制 Web 出站到测试对象存储，验证其他公网地址失败。',
        '从工作负载内部记录允许和拒绝结果。',
      ],
      expected: '正常依赖可用，数据库和管理面不暴露，未允许的出站连接失败。',
    },
  },
  sec_cloud_k8s: {
    useCase: '团队在 Kubernetes 中部署多租户工作负载，需要防止容器逃逸、横向移动和凭据滥用。',
    explanation: '容器安全不仅是镜像漏洞。安全上下文、能力、挂载、网络策略、准入控制和工作负载身份共同决定单容器失守后的影响范围。',
    code: {
      language: 'yaml',
      bad: 'securityContext:\n  privileged: true\n  runAsUser: 0\nhostNetwork: true',
      good: 'securityContext:\n  privileged: false\n  runAsNonRoot: true\n  readOnlyRootFilesystem: true\n  capabilities:\n    drop: [ALL]',
      note: '准入策略应阻断特权、root、宿主网络和危险挂载，工作负载按最小能力运行。',
    },
    lesson: {
      objectives: [
        '识别特权容器、宿主挂载和过宽网络的逃逸影响。',
        '用安全上下文和网络策略限制工作负载。',
        '在本地集群中验证危险清单被准入控制拒绝。',
      ],
      keyTerms: [
        { term: 'Kubernetes', explanation: '容器编排平台，通过清单定义工作负载、网络、权限和存储；默认配置不一定最小权限。' },
        { term: '准入控制', explanation: '在资源创建或修改前检查策略的机制，可以阻断特权、root 和危险挂载。' },
        { term: '网络策略', explanation: '限制工作负载之间网络流量的规则，用于实现命名空间或服务级分段。' },
        { term: '运行时安全', explanation: '监控容器运行后的异常进程、文件写入、网络连接和权限变化。' },
      ],
      walkthrough: [
        { title: '先阻断危险清单', detail: '准入控制拒绝 privileged、hostNetwork、宿主目录挂载和 root 用户，避免错误配置进入集群。' },
        { title: '缩小运行时能力', detail: '非 root、只读根文件系统、丢弃全部能力，只按需添加。需要写入的目录单独受限挂载。' },
        { title: '限制网络和身份', detail: '默认拒绝工作负载互通，只开放依赖；使用短期工作负载身份，不把云长期密钥写入 Secret。' },
        { title: '监控并响应', detail: '运行时检测异常进程、反弹连接和敏感文件访问，发现事件时隔离工作负载并保全证据。' },
      ],
      knowledgeChecks: [
        { question: '容器隔离后为什么 privileged 仍然危险？', answer: '特权容器获得接近宿主机的内核能力，可挂载宿主目录或绕过隔离，把容器风险扩大为主机风险。' },
        { question: '网络策略默认拒绝是否会影响业务？', answer: '会暴露未声明的依赖，但这正是需要显式建模的地方。按服务逐步启用并测试正常流量。' },
      ],
    },
    lab: {
      target: '本地 Kubernetes 或清单校验实验',
      tools: ['本地集群或策略模拟器', 'kubectl', '测试清单'],
      steps: [
        '提交一个 privileged、root 和 hostNetwork 的危险测试清单。',
        '启用准入策略并确认清单被拒绝。',
        '改写为非 root、只读根文件系统和丢弃全部能力，确认可启动。',
        '配置默认拒绝网络策略，只开放测试依赖。',
      ],
      expected: '危险工作负载无法创建，最小权限工作负载可运行，未开放网络连接失败。',
    },
  },
  sec_cloud_detect: {
    useCase: '云环境需要检测权限提升、公开存储、异常数据下载和凭据创建，并能在事件中快速隔离。',
    explanation: '云检测需要同时看控制面和数据面。控制面记录谁修改了权限、网络和存储策略；数据面记录对象和工作负载访问。事件响应要预置隔离、撤销凭据和保留证据的步骤。',
    code: {
      language: 'yaml',
      bad: 'cloud_audit: disabled\nobject_access_logs: disabled\nalert: only-billing',
      good: 'cloud_audit: enabled\nobject_access_logs: enabled\nalerts: [policy-change, public-bucket, credential-create, bulk-download]',
      note: '控制面和数据面日志都要采集，并针对权限、公开暴露和批量下载建立告警。',
    },
    lesson: {
      objectives: [
        '区分控制面日志和数据面日志。',
        '为权限变更、公开存储和异常下载设计检测。',
        '在本地日志样例中完成一次云事件时间线还原。',
      ],
      keyTerms: [
        { term: '控制面日志', explanation: '记录云身份、权限、网络、存储策略和管理动作的日志。' },
        { term: '数据面日志', explanation: '记录对象读取、数据库查询和工作负载访问等数据操作，用于发现批量下载和异常访问。' },
        { term: '云审计日志', explanation: '记录云身份调用和管理动作的日志，用于调查谁在何时修改了资源。' },
        { term: '响应预案', explanation: '在事件发生前定义的隔离、撤销、取证和恢复步骤，避免现场临时猜测。' },
      ],
      walkthrough: [
        { title: '先保证日志覆盖', detail: '云审计、对象访问、网络流量和工作负载日志都要进入受控集中平台，并防止攻击者删除。' },
        { title: '定义高风险行为', detail: '权限策略变更、公开桶、长期密钥创建、批量下载和异常地域登录通常比普通错误更重要。' },
        { title: '关联身份和资源', detail: '把主体、来源、角色、资源、动作和结果关联起来，减少只看单个事件的误报。' },
        { title: '预置响应步骤', detail: '事件发生后先限制身份和网络，保存日志与对象证据，再轮换凭据和修复公开配置。' },
      ],
      knowledgeChecks: [
        { question: '只有云审计日志是否足够发现批量数据下载？', answer: '不够。对象访问和数据面日志更能反映实际读取行为，需要与身份和管理事件关联。' },
        { question: '发现公开桶后为什么先保全日志再修改配置？', answer: '日志能说明对象是否已被访问。过早删除日志或对象可能破坏调查证据，修改前应先记录现状。' },
      ],
    },
    lab: {
      target: '本地云日志样例与响应演练',
      tools: ['JSON 日志', '查询脚本', '响应清单'],
      steps: [
        '准备权限变更、公开桶和批量下载三组测试日志。',
        '按主体、资源、时间和结果查询事件并建立时间线。',
        '写出限制身份、隔离资源和保存证据的响应顺序。',
        '验证修复后同一高风险事件能够命中检测规则。',
      ],
      expected: '事件时间线可还原，高风险行为有告警，响应步骤覆盖隔离、取证、轮换和恢复。',
    },
  },
  sec_ai_prompt: {
    useCase: 'AI 助手会读取网页、文件和工具结果，需要防止外部内容伪装成系统指令并诱导危险行为。',
    explanation: '提示注入不能只靠“让模型不要听恶意指令”解决。系统策略、工具权限和危险动作确认必须由代码执行，外部内容只能作为数据进入上下文，不能改变权限边界。',
    code: {
      language: 'typescript',
      bad: "const prompt = `${systemPrompt}\\n${webPageText}\\n${userQuestion}`;\nawait runTools(prompt);",
      good: "const input = [\n  { role: 'system', content: systemPolicy },\n  { role: 'user', content: userQuestion },\n  { role: 'tool', content: { untrusted: true, text: webPageText } },\n];\nawait runTools(input, { allowedTools: ['search'], requireConfirmation: true });",
      note: '外部文本标记为不可信数据，工具白名单和人工确认由运行时强制执行，不依赖模型自行遵守。',
    },
    lesson: {
      objectives: [
        '区分系统指令、用户输入和外部不可信内容。',
        '识别直接与间接提示注入的攻击路径。',
        '用代码层工具权限和确认流程降低注入影响。',
      ],
      keyTerms: [
        { term: 'AI', fullName: 'Artificial Intelligence（人工智能）', explanation: '让系统执行感知、生成、推理或决策任务的技术。AI 输出仍是不确定的建议，不能直接成为权限判断。' },
        { term: 'LLM', fullName: 'Large Language Model（大语言模型）', explanation: '基于大规模文本训练的生成模型，可能受到提示注入、数据泄露和工具滥用影响。' },
        { term: '提示注入', explanation: '攻击者把恶意指令混入用户输入、网页、文件或工具结果，诱导模型忽略原策略或执行危险动作。' },
        { term: '指令层级', explanation: '规定系统策略、开发者规则、用户请求和外部内容优先级与边界的机制，但最终权限必须由代码执行。' },
      ],
      walkthrough: [
        { title: '先标记数据来源', detail: '系统提示、用户输入、网页、文件和工具结果具有不同信任等级。外部内容永远不能提升为系统指令。' },
        { title: '限制模型能做什么', detail: '模型只看到允许使用的工具列表，文件、网络和终端范围由运行时参数和执行环境约束。' },
        { title: '危险动作要求确认', detail: '删除、安装、发送、支付、权限变更和凭据读取等动作必须请求用户确认，并显示实际参数。' },
        { title: '用评测验证边界', detail: '加入直接注入、网页间接注入和工具结果注入样本，断言模型不能越过代码层限制。' },
      ],
      knowledgeChecks: [
        { question: '在系统提示里写“忽略所有恶意指令”是否足够？', answer: '不够。模型可能被新的表达绕过，安全边界必须由权限、工具白名单和确认流程强制执行。' },
        { question: '为什么网页内容不能与系统指令拼接成同一优先级文本？', answer: '网页由外部控制，拼接会模糊数据与指令边界，使攻击者有机会改变模型行为。' },
      ],
    },
    lab: {
      target: '本地提示注入评测集',
      tools: ['本地 AI 应用', '固定攻击样本', '工具调用日志'],
      steps: [
        '准备直接注入、网页间接注入和工具结果注入三类无害测试样本。',
        '记录模型尝试调用的工具、参数和是否需要确认。',
        '启用工具白名单和代码层确认，重复同一组样本。',
        '断言危险工具未被自动调用，所有外部内容仍作为不可信数据。',
      ],
      expected: '注入样本不能改变工具权限或自动触发危险动作，失败样本有日志和回归标记。',
    },
  },
  sec_ai_rag: {
    useCase: '企业知识库问答需要检索多个租户和部门的文档，不能把无权内容送进模型上下文。',
    explanation: 'RAG 的安全边界在检索前。向量相似度不是授权机制，文档切片必须继承源对象权限，查询必须绑定当前主体、租户和部门。返回引用和最小片段也有助于发现越权。',
    code: {
      language: 'typescript',
      bad: 'const chunks = await vectorStore.search({ query, topK: 20 });',
      good: 'const chunks = await vectorStore.search({\n  query,\n  topK: 8,\n  filter: { tenantId: req.user.tenantId, allowedGroups: { containsAny: req.user.groups } },\n});',
      note: '检索条件在向量查询阶段绑定租户和允许群组，不先返回全部结果再在回答层过滤。',
    },
    lesson: {
      objectives: [
        '解释为什么向量检索结果必须先做授权。',
        '让文档切片继承源对象和租户权限。',
        '在本地知识库中验证跨租户检索被阻断。',
      ],
      keyTerms: [
        { term: 'RAG', fullName: 'Retrieval-Augmented Generation（检索增强生成）', explanation: '先从知识库检索内容，再把片段提供给模型生成回答。检索阶段就必须执行权限过滤。' },
        { term: '检索授权', explanation: '在向量查询和文档片段返回前校验当前主体是否有权读取源内容。' },
        { term: '向量索引', explanation: '把文本转换为向量以便相似度搜索的索引。相似不等于有权访问，索引元数据必须保留租户和权限字段。' },
        { term: '引用溯源', explanation: '回答中标注使用的文档和片段，便于用户验证内容并支持审计越权访问。' },
        { term: 'ID', explanation: '用于唯一识别文档、对象或请求的标识符；检索日志中的文档 ID 必须可追溯但不泄露原文。' },
      ],
      walkthrough: [
        { title: '先确定源权限', detail: '文档、章节和切片继承源对象的租户、部门、所有者和敏感等级，不能只给切片存文本。' },
        { title: '检索前过滤', detail: '向量查询携带主体、租户和允许群组条件，未授权切片不进入候选集。' },
        { title: '最小化上下文', detail: '只返回回答所需片段，敏感字段脱敏，并限制模型输出和日志中出现的原文范围。' },
        { title: '审计和回归', detail: '记录检索主体、文档 ID 和命中原因，加入跨租户、共享文档和权限变更后的回归测试。' },
      ],
      knowledgeChecks: [
        { question: '先检索全部文档再让模型不要引用无权内容是否安全？', answer: '不安全。无权内容已经进入模型上下文，可能被总结、推断或通过其他方式泄露。必须在检索前过滤。' },
        { question: '文档权限变化后为什么需要更新索引元数据？', answer: '否则旧权限会被继续用于检索。权限变化必须同步到切片或通过实时授权层校验。' },
      ],
    },
    lab: {
      target: '本地双租户 RAG 实验',
      tools: ['本地知识库', '两个测试账号', '检索日志'],
      steps: [
        '为两个租户建立独立文档和向量切片，记录源对象权限。',
        '用租户 A 查询租户 B 独有关键词，确认无权片段不进入上下文。',
        '把一份文档共享给 A，确认权限更新后检索生效。',
        '检查回答引用和检索日志，不包含越权原文。',
      ],
      expected: '跨租户内容不可检索，共享更新及时生效，回答引用和日志可审计。',
    },
  },
  sec_ai_tools: {
    useCase: 'Agent 可以读取文件、访问网络和执行命令，需要限制它能操作哪些资源以及何时需要用户确认。',
    explanation: '工具调用是模型输出进入真实世界的边界。工具名、参数、路径、网络目标、超时和权限都必须由运行时校验，不能把模型生成的 JSON 直接交给高权限执行器。',
    code: {
      language: 'yaml',
      bad: 'tools: [shell, file, browser, payment]\napproval: none\nfilesystem: /',
      good: 'tools: [file_read, browser_read]\napproval: [file_write, payment]\nfilesystem: ./workspace\nnetwork: allowlist.example.com\ntimeout: 30s',
      note: '按任务授予最小工具和资源范围，危险动作必须用户确认，网络和文件系统有硬边界。',
    },
    lesson: {
      objectives: [
        '把模型输出与真实工具执行权限分离。',
        '为路径、网络、参数和超时设置硬边界。',
        '在本地 Agent 中验证危险工具调用需要确认。',
      ],
      keyTerms: [
        { term: '工具白名单', explanation: '运行时只允许调用明确列出的工具，模型无法自行扩展能力。' },
        { term: '参数校验', explanation: '按 schema 检查工具参数类型、长度、路径和枚举值，拒绝多余或危险字段。' },
        { term: '人工确认', explanation: '在执行删除、写入、发送、支付和权限变更前向用户展示实际参数并请求确认。' },
        { term: '沙箱', explanation: '限制工具访问的文件、网络、进程和系统资源的隔离环境。' },
        { term: 'JSON', fullName: 'JavaScript Object Notation（JSON 数据格式）', explanation: '常用的结构化文本格式。模型生成的 JSON 也必须经过 schema 校验，不能直接执行。' },
      ],
      walkthrough: [
        { title: '先定义任务能力', detail: '任务只需要读取工作区文件时，不授予 shell、浏览器和支付工具。工具集合随任务缩小。' },
        { title: '执行前校验参数', detail: '路径必须解析后位于工作区，网络目标必须在白名单，数组和输出有大小上限。' },
        { title: '危险动作由用户确认', detail: '模型提出动作，运行时展示真实目标、参数和影响，用户确认后才能执行。' },
        { title: '完整记录回执', detail: '记录工具、参数摘要、执行结果、耗时和用户确认，避免只有模型自述“已完成”。' },
      ],
      knowledgeChecks: [
        { question: '模型自己说不会删除文件，是否可以给它文件删除工具？', answer: '不可以。安全边界必须由运行时权限决定，而不是模型承诺。未授权动作不应出现在工具清单里。' },
        { question: '参数校验为什么必须在工具层而不是提示词里？', answer: '提示词可能被绕过，工具层是实际执行边界。路径、网络和目标参数必须在执行前硬校验。' },
      ],
    },
    lab: {
      target: '本地 Agent 工具权限实验',
      tools: ['本地 Agent', '测试工作区', '工具调用日志'],
      steps: [
        '给测试 Agent 只开放工作区文件读取和允许域名浏览器读取。',
        '请求读取工作区外文件，确认路径校验拒绝。',
        '请求访问未允许域名，确认网络白名单拒绝。',
        '启用文件写入工具但要求确认，检查未确认时不会执行。',
      ],
      expected: '越界路径和网络被拦截，危险工具必须确认，调用日志完整记录参数和结果。',
    },
  },
  sec_ai_supply: {
    useCase: '团队引入第三方模型、提示模板、插件和工具包，需要确认来源、版本和权限不会悄悄变化。',
    explanation: 'AI 供应链既有传统依赖风险，也有模型和提示资产风险。远程提示、自动更新插件和来路不明权重可能改变行为或外传数据。发布清单、签名、权限审查和回滚是基础。',
    code: {
      language: 'yaml',
      bad: 'model: remote-latest\nplugin: auto-update\ntemplate_url: untrusted.example/prompt\npermissions: unrestricted',
      good: 'model: registry.example/model@sha256:abc123\nplugin: signed-plugin@1.4.2\nprompt_template: bundled:review/v3\npermissions: [read_workspace]',
      note: '模型、插件和提示模板固定来源与版本，校验签名和哈希，权限按最小集合审查。',
    },
    lesson: {
      objectives: [
        '识别模型、提示模板、插件和依赖的供应链风险。',
        '固定来源和版本并验证签名或哈希。',
        '为 AI 组件建立权限清单和回滚策略。',
      ],
      keyTerms: [
        { term: '模型供应链', explanation: '模型权重、运行时、提示模板、插件和依赖从来源到部署的完整链路。' },
        { term: '提示模板', explanation: '应用内置或远程加载的系统提示和任务说明，版本变化会直接改变模型行为。' },
        { term: '插件签名', explanation: '用密码学签名验证插件来源和完整性的机制，防止被替换或篡改。' },
        { term: '可回滚清单', explanation: '记录每个组件版本、权限和哈希，出现异常时可恢复到已知安全版本。' },
      ],
      walkthrough: [
        { title: '先固定来源', detail: '模型、提示模板、插件和工具包只从受控仓库加载，禁止运行时自动拉取未审查内容。' },
        { title: '验证完整性和权限', detail: '检查签名、哈希和版本，读取插件声明的文件、网络和凭据权限。' },
        { title: '审查行为变化', detail: '提示模板和模型升级也属于行为变更，应在隔离环境运行安全评测和回归。' },
        { title: '保留回滚路径', detail: '保存旧版本、配置和评测结果，发现异常时能快速切换并撤销不需要的权限。' },
      ],
      knowledgeChecks: [
        { question: '模型文件来自官方地址是否可以不做哈希校验？', answer: '仍建议校验固定版本和哈希。地址可能变化，缓存和传输也可能被替换，哈希能证明实际加载内容一致。' },
        { question: '为什么远程提示模板也属于供应链组件？', answer: '它直接控制系统行为、工具使用规则和输出约束，远程变化可能引入数据外传或绕过安全策略。' },
      ],
    },
    lab: {
      target: '本地 AI 组件清单演练',
      tools: ['组件清单模板', '哈希工具', '签名或校验脚本'],
      steps: [
        '列出测试 AI 应用使用的模型、提示模板、插件和运行时版本。',
        '为每个组件记录来源、哈希、权限和负责人。',
        '把远程自动更新改成固定版本，验证校验失败时拒绝加载。',
        '模拟回滚到上一版本，确认安全评测和配置同步恢复。',
      ],
      expected: '所有 AI 组件可追溯和校验，未授权更新被拒绝，回滚后功能和安全评测一致。',
    },
  },
  sec_ai_eval: {
    useCase: 'AI 应用准备升级模型或提示模板，需要证明安全边界没有因为行为变化而退化。',
    explanation: 'AI 安全评测需要版本化攻击样本、权限用例和行为断言。它不只评估回答质量，还要检查提示注入、跨租户检索、危险工具调用、数据泄露和输出编码。',
    code: {
      language: 'yaml',
      bad: 'eval: [helpful, fluent]\nrelease_on: average_score > 0.7',
      good: 'eval: [direct-injection, indirect-injection, cross-tenant-rag, dangerous-tool-confirmation]\nrelease_on: critical_failures == 0\nbaseline: eval-v12',
      note: '上线门禁优先阻断关键安全失败，并用固定基线比较行为变化。',
    },
    lesson: {
      objectives: [
        '建立覆盖提示注入、RAG 越权和工具滥用的回归集。',
        '对关键安全行为使用确定性断言。',
        '把安全评测结果纳入模型和提示发布门禁。',
      ],
      keyTerms: [
        { term: '红队评测', explanation: '用主动构造的对抗样本验证系统是否会泄露数据、越权或执行危险动作。' },
        { term: '安全回归集', explanation: '版本化保存的攻击与权限样本，每次模型、提示或工具变化后重复运行。' },
        { term: '上线门禁', explanation: '在发布前必须满足的安全条件，关键失败应阻断而不是被平均分掩盖。' },
        { term: '风险接受', explanation: '负责人知情接受尚未修复的风险，必须记录理由、补偿措施和到期时间。' },
      ],
      walkthrough: [
        { title: '从威胁模型选样本', detail: '针对提示注入、RAG 越权、工具滥用、敏感数据泄露和输出编码分别建立样本，而不是只收集普通问答。' },
        { title: '断言实际结果', detail: '检查工具是否被调用、检索是否返回无权片段、响应是否包含测试秘密，不只看模型自述。' },
        { title: '固定基线和版本', detail: '记录模型、提示模板、工具和评测集版本，比较同一组样本的前后结果。' },
        { title: '按关键性阻断', detail: '跨租户泄露和未确认危险工具调用应零容忍；平均质量分提高不能抵消安全关键失败。' },
      ],
      knowledgeChecks: [
        { question: '回答质量评测高分能否证明 AI 安全？', answer: '不能。质量指标通常不覆盖越权、工具滥用和数据泄露，必须单独运行安全回归集。' },
        { question: '为什么 AI 评测要看工具调用日志？', answer: '模型的文字回答可能声称没有执行动作，但实际工具调用才是边界。日志能证明是否越权、是否确认和参数是否正确。' },
      ],
    },
    lab: {
      target: '本地 AI 安全回归评测',
      tools: ['固定评测集', '工具调用日志', '本地模型或模拟器'],
      steps: [
        '准备五类安全样本并标记预期失败或允许行为。',
        '运行当前版本，记录回答、检索命中和工具调用。',
        '修改提示模板后复用同一评测集，比较关键安全失败。',
        '设置关键失败为零才允许发布，并保存版本与证据。',
      ],
      expected: '关键安全行为有确定性断言，升级前后结果可比较，高风险失败会阻断发布。',
    },
  },
};
