export type SecurityTerm = {
  term: string;
  /** 英文全称或中文展开，用于第一次出现的专业名称 */
  fullName?: string;
  /** 面向初学者的通俗解释，避免只给同义替换 */
  explanation: string;
};

export const SECURITY_GLOSSARY = {
  STRIDE: {
    fullName: 'Spoofing / Tampering / Repudiation / Information disclosure / Denial of service / Elevation of privilege',
    explanation: '一种威胁建模检查表：身份伪造、数据篡改、抵赖、信息泄露、拒绝服务、权限提升。它用来系统提出六类威胁，不是漏洞扫描器，也不是某个产品。',
  },
  API: {
    fullName: 'Application Programming Interface（应用程序编程接口）',
    explanation: '系统之间约定好的调用入口。前端提交数据、服务访问数据库或其他服务时，通常都通过 API 完成。',
  },
  Nginx: {
    explanation: '常用的 Web 服务器和反向代理，负责接收浏览器请求、转发给应用、终止 TLS，并可添加安全响应头。',
  },
  威胁建模: {
    explanation: '在写代码或上线前，系统梳理要保护什么、谁会滥用、从哪个边界进入、会造成什么影响，以及用什么控制来降低风险。',
  },
  数据流图: {
    fullName: 'Data Flow Diagram（数据流图，简称 DFD）',
    explanation: '用箭头画出数据在用户、浏览器、服务、数据库和存储之间如何流动，帮助发现信任边界和遗漏的访问路径。',
  },
  对象存储: {
    explanation: '专门保存图片、文档、视频等文件的云存储服务，例如 S3 兼容存储。文件访问权限不能只靠 URL 是否难猜。',
  },
  '预签名 URL': {
    explanation: '由服务端临时生成、带有效期和访问权限的下载地址。时间到期或签名不匹配后，地址不能继续使用。',
  },
  多租户: {
    explanation: '同一套系统服务多个组织或客户，每个租户的数据必须彼此隔离，查询时通常要绑定 tenantId。',
  },
  上传限额: {
    explanation: '限制单个文件大小、用户总容量、上传频率或并发数，防止磁盘、带宽和内存被耗尽。',
  },
  MIME: {
    fullName: 'Multipurpose Internet Mail Extensions（媒体类型标识）',
    explanation: '用 text/plain、image/png 等类型描述文件内容。浏览器声明的 MIME 可以被伪造，服务端仍需检查真实内容。',
  },
  校验和: {
    explanation: '根据文件内容计算出的摘要值。文件内容改变后校验和也会变化，可用于发现篡改或传输损坏。',
  },
  认证: {
    explanation: '回答“你是谁”，例如通过密码、验证码、通行密钥或其他身份凭证验证用户。',
  },
  会话: {
    explanation: '用户登录成功后，服务端发给浏览器的一段短期身份凭证，后续请求用它证明仍是同一个登录用户。',
  },
  密码哈希: {
    explanation: '把密码转换成不可逆的固定长度结果。数据库只保存哈希，验证时重新计算并比较，不保存明文密码。',
  },
  慢哈希: {
    explanation: '故意消耗较多计算资源的密码哈希方式，让攻击者批量猜测密码的成本显著升高。',
  },
  盐: {
    explanation: '每个密码独有的一段随机数据，加入哈希计算后，使相同密码也不会得到相同结果，抑制彩虹表攻击。',
  },
  Argon2: {
    explanation: '现代密码哈希算法，可通过内存、迭代次数和并行度提高猜测成本，常用于保存登录密码。',
  },
  bcrypt: {
    explanation: '常用的慢密码哈希算法，带随机盐和可调工作因子，适合保存密码，不适合普通数据加密。',
  },
  scrypt: {
    explanation: '需要较多内存的密码哈希算法，能提高大规模并行猜测的成本。',
  },
  MFA: {
    fullName: 'Multi-Factor Authentication（多因素认证）',
    explanation: '登录时同时验证两类以上因素，例如密码加手机验证码或安全密钥，降低密码泄露后的账号接管风险。',
  },
  Cookie: {
    explanation: '浏览器按域名保存并随请求自动发送的小段数据，常用于会话。Cookie 可能被脚本、跨站请求或错误日志泄露。',
  },
  HttpOnly: {
    explanation: 'Cookie 属性，禁止页面 JavaScript 直接读取该 Cookie，可降低会话令牌被 XSS 窃取的风险。',
  },
  Secure: {
    explanation: 'Cookie 属性，只允许浏览器通过 HTTPS 发送该 Cookie，避免明文网络传输。',
  },
  SameSite: {
    explanation: 'Cookie 属性，控制跨站请求是否携带 Cookie，可降低 CSRF 风险，但不是完整的 CSRF 防护。',
  },
  会话固定: {
    explanation: '攻击者先让受害者使用一个已知会话 ID，受害者登录后服务端未换新 ID，攻击者便可能继续使用旧 ID 接管会话。',
  },
  会话轮换: {
    explanation: '登录、提权或敏感操作后签发新的会话 ID，并让旧 ID 失效，减少会话被提前窃取后的风险。',
  },
  令牌: {
    explanation: '服务端签发、用于证明身份或授权的一段数据。令牌通常有有效期、权限范围和撤销机制。',
  },
  CSRF: {
    fullName: 'Cross-Site Request Forgery（跨站请求伪造）',
    explanation: '攻击者诱导已登录用户的浏览器向目标网站发送非预期请求。SameSite、CSRF token 和二次确认可降低风险。',
  },
  撞库: {
    explanation: '攻击者拿其他网站泄露的账号密码批量尝试登录。密码复用会让一次泄露扩散到多个账号。',
  },
  账号接管: {
    explanation: '攻击者获得受害者账号控制权，例如窃取会话、重置密码或绕过多因素认证。',
  },
  限速: {
    explanation: '限制单位时间内允许的请求次数，并对重复失败增加延迟、验证码或临时封禁，降低暴力尝试成本。',
  },
  TLS: {
    fullName: 'Transport Layer Security（传输层安全协议）',
    explanation: '为网络连接提供加密、完整性保护和服务器身份验证。HTTPS 就是 HTTP 运行在 TLS 之上。',
  },
  IP: {
    fullName: 'Internet Protocol（互联网协议）',
    explanation: '为网络主机分配地址并转发数据包的协议。回环、私网和公网地址在访问控制中的含义不同。',
  },
  RBAC: {
    fullName: 'Role-Based Access Control（基于角色的访问控制）',
    explanation: '先给用户分配角色，再给角色分配权限。它适合管理稳定职责，但对象级授权仍需单独检查。',
  },
  'SHA-256': {
    fullName: 'Secure Hash Algorithm 256-bit（256 位安全哈希算法）',
    explanation: '生成 256 位摘要的哈希算法，可用于校验文件完整性。它不是适合保存用户密码的慢哈希。',
  },
  HTTPS: {
    fullName: 'Hypertext Transfer Protocol Secure（安全超文本传输协议）',
    explanation: '在 HTTP 外增加 TLS 保护的访问方式，浏览器与服务器之间的内容不容易被窃听或篡改。',
  },
  入站访问: {
    explanation: '外部流量进入系统的方向，例如用户访问 Web 443 端口。入站规则应默认拒绝并按需开放。',
  },
  出站访问: {
    explanation: '系统主动连接外部的方向，例如服务访问数据库、对象存储或第三方 API。限制目的地可降低数据外传和横向移动。',
  },
  VPN: {
    fullName: 'Virtual Private Network（虚拟专用网络）',
    explanation: '通过加密隧道把远程设备接入受控内网，常用于限制管理面访问来源。',
  },
  堡垒机: {
    explanation: '集中管理和审计服务器登录、命令与文件操作的受控入口，减少直接暴露 SSH 等高危管理端口。',
  },
  横向移动: {
    explanation: '攻击者控制一台主机后，利用凭据、网络或漏洞继续访问其他主机和服务。分段和最小权限用于缩小这种扩散。',
  },
  安全组: {
    explanation: '云平台提供的虚拟防火墙规则，按来源、目标和端口决定允许或拒绝网络流量。',
  },
  NetworkPolicy: {
    explanation: 'Kubernetes 中限制 Pod 之间网络流量的策略，用于实现命名空间或服务级分段。',
  },
  审计日志: {
    explanation: '记录谁在什么时间对什么对象做了什么、结果如何的日志，主要服务于追责、调查和合规，不只用于排障。',
  },
  requestId: {
    explanation: '为一次请求生成的唯一标识，方便把前端、网关、应用和日志系统中的同一条链路关联起来。',
  },
  Authorization: {
    explanation: 'HTTP 请求头，常携带 Bearer 令牌或认证信息。它属于秘密数据，不能原样写入日志或错误页面。',
  },
  日志完整性: {
    explanation: '保证日志没有被悄悄删除、修改或伪造，例如使用受限写入、签名、哈希链和只追加存储。',
  },
  日志保留周期: {
    explanation: '日志保存多久后删除或归档。周期要同时满足安全调查、业务排障、隐私和合规要求。',
  },
  SQL: {
    fullName: 'Structured Query Language（结构化查询语言）',
    explanation: '关系型数据库使用的查询语言，用来读取、写入和修改表数据。用户输入一旦被当成 SQL 语法就会形成注入风险。',
  },
  'SQL 注入': {
    explanation: '应用把不可信输入拼进 SQL，使输入改变查询结构，可能绕过条件、读取或修改未授权数据。',
  },
  参数化查询: {
    explanation: '先固定 SQL 结构，再把用户值作为参数单独传给数据库，值不会参与语法解析，是 SQL 注入的根本修复方式。',
  },
  ORM: {
    fullName: 'Object-Relational Mapping（对象关系映射）',
    explanation: '把数据库表和程序对象互相映射的框架。ORM 通常支持参数化，但原生 SQL、动态排序和拼接 JPQL 仍可能注入。',
  },
  标识符白名单: {
    explanation: '表名、列名、排序方向等无法作为普通参数绑定的位置，只能映射到代码中固定允许的值。',
  },
  二次注入: {
    explanation: '恶意数据先被存入数据库，随后在另一处被取出并再次拼进查询或命令，首次过滤往往无法发现问题。',
  },
  'ORDER BY': {
    explanation: 'SQL 排序子句。列名和 ASC/DESC 方向通常不能直接参数化，必须使用固定白名单映射。',
  },
  WHERE: {
    explanation: 'SQL 中筛选记录的子句。业务查询应在 WHERE 条件中同时绑定对象 ID、租户和权限范围。',
  },
  XSS: {
    fullName: 'Cross-Site Scripting（跨站脚本）',
    explanation: '应用把不可信数据输出到浏览器页面，浏览器把它当成脚本或 HTML 结构执行，可能窃取数据或代表用户操作。',
  },
  DOM: {
    fullName: 'Document Object Model（文档对象模型）',
    explanation: '浏览器把 HTML 页面表示成可由 JavaScript 读取和修改的树结构。把用户输入写入危险 DOM 位置可能导致 XSS。',
  },
  HTML: {
    fullName: 'Hypertext Markup Language（超文本标记语言）',
    explanation: '描述网页结构和内容的标记语言。原始用户文本只有在被当成 HTML 解析时才可能形成标签或脚本。',
  },
  输出编码: {
    explanation: '根据数据最终进入的 HTML 文本、属性、URL 或脚本上下文，把特殊字符转换成不会改变页面结构的形式。',
  },
  富文本消毒: {
    explanation: '允许有限 HTML 标签和属性，同时移除脚本、事件属性和危险 URL。消毒库本身必须可信并持续更新。',
  },
  CSP: {
    fullName: 'Content Security Policy（内容安全策略）',
    explanation: '浏览器安全策略，通过响应头限制页面能加载和执行哪些脚本、样式和资源。它是纵深防御，不能替代输出编码。',
  },
  DOMPurify: {
    explanation: '常用的 HTML 消毒库，用于清理富文本中的危险标签、属性和链接协议。',
  },
  innerHTML: {
    explanation: 'JavaScript 接口，会把字符串当成 HTML 解析并插入页面。直接写入用户输入会形成 XSS 风险。',
  },
  textContent: {
    explanation: 'JavaScript 接口，把字符串作为纯文本插入页面，不会解析成 HTML 标签，适合展示普通用户内容。',
  },
  'DOM XSS': {
    explanation: '浏览器端脚本把不可信数据写入 innerHTML 等可执行 DOM 位置，导致页面执行攻击者内容。',
  },
  SVG: {
    fullName: 'Scalable Vector Graphics（可缩放矢量图形）',
    explanation: '基于 XML 的矢量图格式。SVG 可包含脚本和链接，上传或内联展示时不能只按图片处理。',
  },
  IDOR: {
    fullName: 'Insecure Direct Object Reference（不安全的直接对象引用）',
    explanation: '攻击者修改 URL、请求体或参数中的对象 ID，访问不属于自己的订单、文档或其他资源。根因通常是缺少服务端对象级授权。',
  },
  对象级授权: {
    explanation: '每次访问具体资源时，服务端都检查当前用户是否有权操作这个对象，而不是只确认用户已登录。',
  },
  租户隔离: {
    explanation: '查询和写入都绑定当前 tenantId，确保一个组织或客户不能读到另一个租户的数据。',
  },
  对象枚举: {
    explanation: '攻击者通过连续尝试 ID 或比较响应差异，推测系统里存在哪些对象以及自己能否访问。',
  },
  SSRF: {
    fullName: 'Server-Side Request Forgery（服务端请求伪造）',
    explanation: '攻击者诱导服务器访问自己指定的 URL，借服务器的网络位置访问内网、云元数据或本机管理接口。',
  },
  URL: {
    fullName: 'Uniform Resource Locator（统一资源定位符）',
    explanation: '表示网络资源地址的字符串，包含协议、主机、端口、路径和查询参数。只检查字符串外观不足以判断目标是否安全。',
  },
  DNS: {
    fullName: 'Domain Name System（域名系统）',
    explanation: '把域名解析成 IP 地址的系统。安全校验必须关注解析后的地址，而不只是原始域名字符串。',
  },
  'DNS 重绑定': {
    explanation: '攻击者让域名第一次解析到允许地址，后续请求改解析到私网地址，从而绕过只检查域名的防护。',
  },
  'URL 白名单': {
    explanation: '只允许明确列出的协议、主机和端口，而不是尝试排除所有危险字符串。',
  },
  私网地址: {
    explanation: '只在内部网络可达的 IP 范围，例如 10.0.0.0/8、172.16.0.0/12 和 192.168.0.0/16。服务端抓取应默认拒绝。',
  },
  回环地址: {
    explanation: '通常指 127.0.0.1 或 ::1，只指向本机。生产环境的远程抓取功能不应允许访问回环管理接口。',
  },
  云元数据: {
    explanation: '云平台提供给实例的内部信息接口，可能包含临时凭据。SSRF 访问这类地址可能造成云账号权限泄露。',
  },
  Webhook: {
    explanation: '一个系统在事件发生时主动向另一个 URL 发送请求。接收和发送 Webhook 时都要校验目标、签名和内容。',
  },
  重定向: {
    explanation: '服务器用 3xx 状态让客户端跳到另一个地址。安全校验必须在每一跳重新检查，或直接禁止自动跟随。',
  },
  ROE: {
    fullName: 'Rules of Engagement（行动规则）',
    explanation: '授权测试的书面规则，规定能测什么、何时测、使用什么账号、限制哪些动作、出现异常时如何停止。',
  },
  渗透测试: {
    explanation: '在明确授权范围和时间窗内，模拟攻击者验证系统安全问题，并以最小影响保存证据和提出修复建议。',
  },
  授权范围: {
    explanation: '明确列出允许测试的域名、IP、端口、账号、环境和时间窗，范围外资产不能主动探测。',
  },
  攻击面: {
    explanation: '攻击者可能接触到的入口、服务、端口、账号、接口和数据路径。入口越少，防护和监控越容易维护。',
  },
  CMDB: {
    fullName: 'Configuration Management Database（配置管理数据库）',
    explanation: '记录企业资产、服务、负责人和依赖关系的数据库，用于确认目标归属，避免误测第三方系统。',
  },
  服务指纹: {
    explanation: '根据响应头、证书、banner 或行为推断服务类型和版本。它是线索，不能只凭版本号断定存在漏洞。',
  },
  banner: {
    explanation: '服务在连接或响应中返回的欢迎信息，常包含软件名称和版本。banner 可以被修改，不能单独作为漏洞结论。',
  },
  被动信息收集: {
    explanation: '不直接向目标发送主动探测请求，而是从公开资料、证书、DNS 历史和已有资产库收集信息。',
  },
  主动探测: {
    explanation: '直接向已授权目标发送请求或扫描数据包，以确认端口、服务和页面。必须控制速率和范围。',
  },
  最小影响: {
    explanation: '只做证明问题所需的最小操作，不导出无关数据、不持久化、不破坏业务，并在测试后恢复状态。',
  },
  证据链: {
    explanation: '把前置条件、账号、请求、响应、时间、业务影响和处理记录连成可复核的完整证据。',
  },
  最小复现: {
    explanation: '用最少步骤和单个测试对象稳定证明问题，避免批量枚举、读取大量数据或修改真实记录。',
  },
  可利用性: {
    explanation: '攻击者实际触发问题需要什么条件，例如登录、特定网络位置、用户交互或复杂前置状态。',
  },
  风险评级: {
    explanation: '综合技术影响、业务后果、可利用性和现有控制确定风险等级，不能只复制扫描器分数。',
  },
  复测: {
    explanation: '修复后用同一账号、对象和最小请求重新验证，并确认正常业务没有被破坏。',
  },
  'Burp Repeater': {
    explanation: 'Burp Suite 中用于修改并重复发送单个 HTTP 请求的工具，适合最小化复现和对比响应。',
  },
  Nmap: {
    explanation: '常用的网络端口和服务识别工具。授权测试中应限制目标、速率和扫描类型，避免影响服务。',
  },
  ffuf: {
    explanation: '快速 Web 模糊测试工具，可用字典发现路径或参数。必须限制并发、速率和授权范围。',
  },
  curl: {
    explanation: '命令行 HTTP 客户端，用于发送单个请求并查看状态码、响应头和响应体，适合可重复的最小验证。',
  },
  OWASP: {
    fullName: 'Open Worldwide Application Security Project（开放 Web 应用安全项目）',
    explanation: '发布 Web 安全风险清单、测试指南和开源靶场的国际社区，OWASP Top 10 常用于课程和风险评估参考。',
  },
  Docker: {
    explanation: '把应用及其依赖打包成容器并隔离运行的平台。靶场使用容器便于重建、快照和限制网络。',
  },
  'Docker Compose': {
    explanation: '用 YAML 文件定义多个 Docker 容器、网络和卷并一起启动的工具，适合搭建本地可重复靶场。',
  },
  'Juice Shop': {
    explanation: 'OWASP 提供的故意包含 Web 漏洞的教学应用，只应在本地或专用隔离环境练习。',
  },
  WebGoat: {
    explanation: 'OWASP 提供的 Web 安全教学靶场，用分课练习演示常见漏洞和修复。',
  },
  数据快照: {
    explanation: '在固定时间点保存环境或数据状态。每次测试前恢复快照，能让结果可重复并清除上次残留。',
  },
  'OWASP ZAP': {
    fullName: 'OWASP Zed Attack Proxy（OWASP 攻击代理）',
    explanation: '开源 Web 安全扫描和代理工具，可执行被动扫描、主动扫描和手工请求分析。',
  },
  基线扫描: {
    explanation: '用一组固定规则做低影响检查，并保存首次或已知状态作为后续比较基准。',
  },
  Nuclei: {
    explanation: '基于模板执行安全检测的开源扫描工具。模板版本、目标范围和速率必须固定并记录。',
  },
  模板: {
    explanation: '扫描器执行的规则文件，描述要发送什么请求以及如何判断响应。固定模板版本才能让前后结果可比。',
  },
  JSONL: {
    fullName: 'JSON Lines（逐行 JSON）',
    explanation: '每行保存一个独立 JSON 对象的文本格式，便于扫描器流式输出、去重和后续处理。',
  },
  Playwright: {
    explanation: '浏览器自动化测试框架，可创建独立浏览器上下文、保存登录状态并断言页面或接口行为。',
  },
  CLI: {
    fullName: 'Command-Line Interface（命令行界面）',
    explanation: '通过终端输入命令操作程序的界面，例如运行构建、测试、扫描或本地服务。',
  },
  'browser context': {
    explanation: 'Playwright 中相互隔离的浏览器会话，各自保存 Cookie、localStorage 和缓存。测试两个账号时必须分开。',
  },
  UUID: {
    fullName: 'Universally Unique Identifier（通用唯一识别码）',
    explanation: '用于生成难以重复的标识符，可给测试对象加唯一标记，方便追踪和清理。',
  },
  storageState: {
    explanation: 'Playwright 保存和恢复 Cookie、localStorage 等登录状态的机制，用于复用测试账号会话。',
  },
  断言: {
    explanation: '测试中必须成立的条件，例如越权请求应返回 403 或 404。没有断言的自动化脚本只算操作记录。',
  },
  trace: {
    explanation: 'Playwright 对测试步骤、网络请求和页面快照的记录，用于排查失败和保存证据。',
  },
  CI: {
    fullName: 'Continuous Integration（持续集成）',
    explanation: '代码提交后自动执行构建、测试和安全检查的流程，尽早发现回归和依赖问题。',
  },
  'CI/CD': {
    fullName: 'Continuous Integration / Continuous Delivery（持续集成与持续交付）',
    explanation: '把自动构建、测试、安全检查、发布和部署串成可重复流水线。',
  },
  质量门: {
    explanation: '在合并或发布前必须满足的检查条件。质量门应阻断已确认且可达的高风险问题，并允许有时限的例外。',
  },
  误报: {
    explanation: '工具报告为问题，但人工验证后确认实际不可达或不存在风险。误报需要记录理由和复核证据。',
  },
  豁免: {
    explanation: '经过批准暂时不修复某项发现，必须记录责任人、理由、补偿措施和到期时间。',
  },
  C: {
    explanation: '一种底层系统编程语言，不自动管理数组边界和字符串长度，网络输入处理必须显式检查容量。',
  },
  'C++': {
    explanation: '支持面向对象、泛型和资源生命周期管理的系统编程语言，安全抽象通常优于裸指针和手工内存管理。',
  },
  缓冲区: {
    explanation: '程序用来临时保存数据的一段连续内存。写入长度超过容量就会越界，可能破坏其他数据甚至执行恶意代码。',
  },
  'null 终止符': {
    explanation: 'C 字符串末尾的 \\0 字符，用来标记字符串结束。复制时没有保留终止符会导致越界读取。',
  },
  strcpy: {
    explanation: 'C 字符串复制函数，不知道目标缓冲区容量，输入过长时会写越界。安全代码应改用有界复制并检查长度。',
  },
  sprintf: {
    explanation: 'C 格式化输出函数，不限制目标缓冲区大小，容易因长输入写越界。应优先使用 snprintf 并检查返回值。',
  },
  snprintf: {
    explanation: '带目标容量限制的 C 格式化函数。返回值可能需要截断的长度，大于等于容量时必须处理超长输入。',
  },
  strlcpy: {
    explanation: '带目标容量的字符串复制函数，保证结果以 null 结尾，并返回源字符串长度，便于判断是否被截断。',
  },
  ASan: {
    fullName: 'AddressSanitizer（地址消毒器）',
    explanation: '编译器和运行时检查工具，用于发现越界访问、释放后使用和内存泄漏等内存错误。',
  },
  UBSan: {
    fullName: 'UndefinedBehaviorSanitizer（未定义行为消毒器）',
    explanation: '运行时检查工具，用于发现整数溢出、非法类型转换和越界等 C/C++ 未定义行为。',
  },
  sanitizer: {
    explanation: '编译器提供的运行时安全检查工具，例如 ASan 和 UBSan，用额外检查发现普通测试可能漏掉的内存错误。',
  },
  gdb: {
    explanation: 'GNU 调试器，可逐步运行程序、查看调用栈和变量，用于定位崩溃和内存错误。',
  },
  RAII: {
    fullName: 'Resource Acquisition Is Initialization（资源获取即初始化）',
    explanation: 'C++ 资源管理方式：对象构造时获取资源，析构时自动释放，减少异常路径上的泄漏和重复释放。',
  },
  'std::vector': {
    explanation: 'C++ 标准库的动态数组容器，自动管理容量和生命周期，并提供 size() 等边界信息。',
  },
  'std::span': {
    explanation: 'C++ 标准库中带长度的连续内存视图，不拥有数据，但能把指针和长度一起传递以保留边界。',
  },
  'std::string_view': {
    explanation: 'C++ 的只读字符串视图，不拥有字符数据。底层字符串销毁后继续使用视图会产生悬空引用。',
  },
  智能指针: {
    explanation: 'C++ 中自动管理对象生命周期的指针包装，例如 unique_ptr 和 shared_ptr，用于减少手工 delete。',
  },
  'new/delete': {
    explanation: 'C++ 手工分配和释放动态内存的运算符。异常、提前返回或重复释放容易导致泄漏和悬空指针。',
  },
  异常安全: {
    explanation: '异常发生时程序仍能保持资源不泄漏、对象状态有效且不破坏数据结构的性质。',
  },
  Java: {
    explanation: '运行在 JVM 上的面向对象语言，常用于企业后端。类型安全不能替代数据库参数化、授权和反序列化防护。',
  },
  JDBC: {
    fullName: 'Java Database Connectivity（Java 数据库连接）',
    explanation: 'Java 访问关系型数据库的标准接口，参数绑定通过 PreparedStatement 完成。',
  },
  PreparedStatement: {
    explanation: 'JDBC 的预编译 SQL 接口，用占位符绑定用户值，避免输入改变 SQL 结构。',
  },
  JPA: {
    fullName: 'Jakarta Persistence API（Java 持久化接口）',
    explanation: 'Java 的对象关系映射标准，常与 Hibernate 等实现配合。动态查询仍要避免字符串拼接用户输入。',
  },
  JPQL: {
    fullName: 'Java Persistence Query Language（Java 持久化查询语言）',
    explanation: 'JPA 使用的面向对象查询语言。拼接 JPQL 仍可能形成注入，应使用参数绑定和固定排序字段。',
  },
  'Spring Boot': {
    explanation: '常用的 Java 应用框架，提供 Web、数据库、配置和验证组件。安全配置仍需要开发者正确使用授权和参数化。',
  },
  SpEL: {
    fullName: 'Spring Expression Language（Spring 表达式语言）',
    explanation: 'Spring 的动态表达式能力。若把外部输入直接交给 SpEL 求值，可能造成表达式注入。',
  },
  反序列化: {
    explanation: '把字节流或文本恢复成程序对象。不可信数据的反序列化可能触发危险类和方法，造成远程代码执行。',
  },
  远程代码执行: {
    explanation: '攻击者让目标系统运行自己的代码。它通常代表严重失陷，可导致数据窃取、持久化和横向移动。',
  },
  'Bean Validation': {
    explanation: 'Java 中通过注解声明字段长度、格式和范围约束的验证机制，但业务授权仍需在服务层单独检查。',
  },
  Python: {
    explanation: '广泛用于脚本、后端和自动化的动态语言。拼接 shell、SQL、路径或模板时仍需要明确的信任边界。',
  },
  subprocess: {
    explanation: 'Python 启动外部程序的模块。使用参数列表和 shell=False 可以避免用户输入被 shell 重新解释。',
  },
  shell: {
    explanation: '解释命令字符串的程序。它支持管道、变量和重定向，因此把不可信输入交给 shell 容易形成命令注入。',
  },
  'shell=True': {
    explanation: 'Python subprocess 中让命令经由 shell 执行的选项。与字符串拼接同时使用会显著扩大命令注入风险。',
  },
  'Path.resolve': {
    explanation: 'Python 把相对路径、.. 和符号链接规范化为真实绝对路径的方法，路径校验应在解析后进行。',
  },
  ffmpeg: {
    explanation: '常用的音视频处理工具。调用时程序名应固定，文件路径和参数作为独立参数传入，避免经过 shell。',
  },
  pytest: {
    explanation: 'Python 常用测试框架，用于编写路径边界、命令参数和错误处理等自动化测试。',
  },
  命令注入: {
    explanation: '不可信输入进入 shell 或命令参数后，被解释成额外命令。修复关键是避免 shell 解释并使用参数列表和允许列表。',
  },
  路径穿越: {
    explanation: '攻击者使用 ../、绝对路径或符号链接逃逸允许目录，读取或覆盖其他文件。',
  },
  允许列表: {
    explanation: '只接受事先明确允许的值，例如固定命令、文件扩展名或域名，而不是试图列举所有危险输入。',
  },
  JavaScript: {
    explanation: '运行在浏览器和 Node.js 中的脚本语言。浏览器端要防 DOM XSS，服务端要限制网络和文件访问。',
  },
  'Node.js': {
    explanation: '在服务器运行 JavaScript 的运行时。服务端 fetch 用户 URL、读取文件和执行子进程都需要权限边界。',
  },
  'URL allowlist': {
    explanation: 'URL 允许列表，只接受明确允许的协议、主机和端口，常用于 SSRF 防护。',
  },
  AbortSignal: {
    explanation: '浏览器和 Node.js 中用于取消异步操作的信号对象，配合 timeout 可限制请求最长等待时间。',
  },
  fetch: {
    explanation: 'Web 和 Node.js 中发送 HTTP 请求的接口。默认不会按业务安全要求限制私网、重定向或响应体大小。',
  },
  PHP: {
    explanation: '常用于 Web 开发的服务端语言。字符串拼接 SQL、直接输出 HTML 和宽松文件上传是常见风险来源。',
  },
  PDO: {
    fullName: 'PHP Data Objects（PHP 数据对象）',
    explanation: 'PHP 的统一数据库访问接口，支持 prepare 和参数绑定，用于避免 SQL 注入。',
  },
  htmlspecialchars: {
    explanation: 'PHP 的 HTML 编码函数，把 & < > 引号等字符转成实体，避免用户内容变成页面结构。',
  },
  'session ID': {
    explanation: '服务端识别一次登录会话的随机标识。登录后应轮换，并通过 Cookie 属性限制读取和传输。',
  },
  addslashes: {
    explanation: 'PHP 给引号等字符加反斜杠的旧函数，不能可靠防止 SQL 注入，不应替代 PDO 参数绑定。',
  },
  echo: {
    explanation: 'PHP 输出内容的语句。直接 echo 用户输入会让它进入 HTML 上下文，应按上下文编码。',
  },
  SQLite: {
    explanation: '轻量级嵌入式关系型数据库，常用于本地靶场和桌面应用。查询同样需要参数绑定。',
  },
  MySQL: {
    explanation: '常用的关系型数据库。应用账号应使用最小权限，查询值必须参数化。',
  },
  Go: {
    explanation: '强调并发和部署简单的编译型语言。网络请求仍需显式设置超时、响应大小和 SSRF 边界。',
  },
  HTTP: {
    fullName: 'Hypertext Transfer Protocol（超文本传输协议）',
    explanation: '浏览器、客户端和服务端交换请求与响应的应用层协议。状态码告诉客户端请求结果。',
  },
  'http.Client': {
    explanation: 'Go 的 HTTP 客户端类型。默认配置不包含业务需要的总超时、响应体限制或目标白名单。',
  },
  Transport: {
    explanation: 'Go HTTP 客户端处理连接、代理、TLS 和拨号的底层组件，可用来限制目标 IP 和连接超时。',
  },
  context: {
    explanation: 'Go 中传递取消信号、截止时间和请求级数据的机制，用于避免网络操作无限等待。',
  },
  'io.LimitReader': {
    explanation: 'Go 中只读取指定最大字节数的读取器包装，用于防止超大响应耗尽内存和带宽。',
  },
  重定向策略: {
    explanation: '明确是否自动跟随跳转、最多跟随几次，以及每一跳是否重新校验目标地址。',
  },
  Rust: {
    explanation: '强调内存安全和所有权模型的编译型语言。unsafe、FFI、路径和外部命令仍需单独审计。',
  },
  ownership: {
    explanation: 'Rust 的所有权规则，规定每份值的负责人和生命周期，在编译期减少悬空引用和数据竞争。',
  },
  unsafe: {
    explanation: 'Rust 中绕过部分编译期安全检查的代码块。开发者必须自己证明指针、长度和生命周期不变量成立。',
  },
  FFI: {
    fullName: 'Foreign Function Interface（外部函数接口）',
    explanation: '一种语言调用另一种语言函数的接口。跨语言传递指针和长度时必须重新验证边界和生命周期。',
  },
  canonicalize: {
    explanation: 'Rust 把路径解析成规范绝对路径并处理 .. 和符号链接的方法，之后才能校验是否仍在允许目录内。',
  },
  Command: {
    explanation: 'Rust 启动外部程序的类型。程序名和参数应分开传递，避免拼成 shell 命令字符串。',
  },
  Miri: {
    explanation: 'Rust 的动态检查工具，可发现部分未定义行为，但覆盖面仍有限，不能替代 unsafe 审计和测试。',
  },
  clippy: {
    explanation: 'Rust 的静态代码检查工具，可提示常见错误和可疑写法，但不能判断所有业务授权问题。',
  },
  cargo: {
    explanation: 'Rust 的构建、依赖和测试工具，通过 cargo test、clippy 等命令执行质量检查。',
  },
  WAF: {
    fullName: 'Web Application Firewall（Web 应用防火墙）',
    explanation: '检查 HTTP 流量并匹配攻击特征的防护产品。它能降低部分风险，但可能被绕过，不能替代代码修复和授权。',
  },
  SIEM: {
    fullName: 'Security Information and Event Management（安全信息和事件管理）',
    explanation: '集中收集、关联和分析日志的安全平台，用于检测异常、告警和事件调查。',
  },
  SOC: {
    fullName: 'Security Operations Center（安全运营中心）',
    explanation: '负责持续监控、检测、分析和响应安全事件的团队与流程。',
  },
  检测规则: {
    explanation: '把日志字段、时间窗、阈值和上下文组合成可解释安全信号的逻辑，用来判断是否需要告警。',
  },
  基线: {
    explanation: '正常业务量、来源、时间和行为的已知参考状态。偏离基线只是线索，仍需结合上下文判断。',
  },
  误报治理: {
    explanation: '通过白名单、聚合、上下文补充和人工复核减少无效告警，同时保留真实攻击的可见性。',
  },
  纵深防御: {
    explanation: '在身份、网络、主机、应用、数据和监控等层放置互补控制，单层失效时仍有其他防线。',
  },
  HSTS: {
    fullName: 'HTTP Strict Transport Security（HTTP 严格传输安全）',
    explanation: '让浏览器在指定时间内只通过 HTTPS 访问站点，降低降级和 Cookie 明文传输风险。',
  },
  安全响应头: {
    explanation: '服务器返回给浏览器的安全策略头，例如 HSTS、CSP、X-Frame-Options 和 X-Content-Type-Options。',
  },
  'X-Content-Type-Options': {
    explanation: '安全响应头，设置为 nosniff 后浏览器不会把声明类型不符的内容自行猜测成脚本或样式。',
  },
  'X-Frame-Options': {
    explanation: '安全响应头，限制页面能否被其他站点嵌入 iframe，用于降低点击劫持风险。',
  },
  SLA: {
    fullName: 'Service Level Agreement（服务级别协议）',
    explanation: '对服务可用性、响应时间或修复时限的约定。安全修复也要明确不同风险等级的时限。',
  },
  事件响应: {
    explanation: '从准备、识别、遏制、根除、恢复到复盘的一整套安全事件处理流程，目标是控制影响并保留证据。',
  },
  遏制: {
    explanation: '限制攻击者继续访问、扩散或破坏，例如隔离网络、禁用会话，同时尽量保留调查证据。',
  },
  隔离: {
    explanation: '把受影响主机、账号或服务与正常网络和资源分开，防止影响扩大。隔离前要记录必要现场信息。',
  },
  取证: {
    explanation: '按可审计方式采集和保存进程、网络、日志和文件证据，记录时间、来源、执行人和哈希。',
  },
  根因: {
    explanation: '导致安全事件发生的根本原因，例如未修复的入口、弱凭据或缺失授权。只删除恶意文件不等于根除。',
  },
  凭据轮换: {
    explanation: '事件后更换密码、令牌、密钥和证书，并让旧凭据失效，防止攻击者继续使用已窃取的身份。',
  },
  DevSecOps: {
    fullName: 'Development, Security and Operations（开发、安全与运维一体化）',
    explanation: '把安全检查嵌入需求、编码、依赖、构建、部署和运营流程，而不是等上线后再补安全。',
  },
  SAST: {
    fullName: 'Static Application Security Testing（静态应用安全测试）',
    explanation: '不运行程序，直接分析源代码和配置中的危险模式与数据流。它可能漏掉运行时配置和第三方服务问题。',
  },
  DAST: {
    fullName: 'Dynamic Application Security Testing（动态应用安全测试）',
    explanation: '向运行中的服务发送测试流量，验证实际可达的漏洞。需要明确目标、账号、速率和授权范围。',
  },
  SCA: {
    fullName: 'Software Composition Analysis（软件成分分析）',
    explanation: '检查项目使用的第三方依赖、传递依赖及其已知漏洞和许可证风险。',
  },
  SBOM: {
    fullName: 'Software Bill of Materials（软件物料清单）',
    explanation: '记录构建产物包含哪些组件、版本、来源和许可证的机器可读清单，用于供应链追踪和漏洞影响定位。',
  },
  Secrets: {
    explanation: '密钥、令牌、密码和证书等秘密配置。真实值不能进入代码仓库、日志、截图或构建产物。',
  },
  依赖扫描: {
    explanation: '根据锁文件和依赖清单检查第三方组件版本及已知漏洞，并确定受影响范围。',
  },
  锁文件: {
    explanation: '记录项目实际安装的依赖版本和来源，确保不同机器和 CI 环境得到一致的依赖树。',
  },
  传递依赖: {
    explanation: '项目没有直接声明、但由其他依赖引入的组件。它仍会进入构建产物，也可能包含漏洞。',
  },
  SPDX: {
    fullName: 'Software Package Data Exchange（软件包数据交换格式）',
    explanation: '常见的 SBOM 标准格式，用统一字段描述组件、版本、许可证和依赖关系。',
  },
  来源证明: {
    explanation: '证明构建产物来自特定源码、构建流程和签名者的证据，用于判断发布物是否可信。',
  },
  SRE: {
    fullName: 'Site Reliability Engineering（站点可靠性工程）',
    explanation: '用工程方法维护服务可靠性的角色和实践，常与发布、监控、容量和故障响应协作。',
  },
  'Secret Manager': {
    explanation: '专门的密钥管理系统，负责安全保存、访问控制、审计和轮换密码、令牌和证书。',
  },
  轮换: {
    explanation: '在计划周期内或怀疑泄露时更换密钥、令牌和凭据，并让旧值失效。',
  },
  最小作用域: {
    explanation: '密钥或令牌只拥有完成当前任务所需的资源和操作权限，减少泄露后的影响。',
  },
  环境变量: {
    explanation: '运行时注入配置的键值。它比硬编码更容易替换，但环境变量本身仍可能被进程、日志或错误页面泄露。',
  },
  供应链: {
    explanation: '从源码、依赖、构建、制品到发布环境的完整链条。任一环节被篡改都可能影响最终软件。',
  },
  签名: {
    explanation: '用私钥对软件或元数据生成可验证标记，接收方用公钥确认来源和内容未被篡改。',
  },
} satisfies Record<string, Omit<SecurityTerm, 'term'>>;

export type SecurityTermKey = keyof typeof SECURITY_GLOSSARY;

export function securityTerms(keys: readonly SecurityTermKey[]): SecurityTerm[] {
  return keys.map((key) => ({ term: key, ...SECURITY_GLOSSARY[key] }));
}

export const SECURITY_MODULE_TERM_KEYS = {
  sec_fund_threat_model: ['STRIDE', '数据流图', '对象存储', '预签名 URL', '多租户', 'MIME'],
  sec_fund_auth: ['密码哈希', '慢哈希', 'MFA', 'HttpOnly', 'SameSite', 'CSRF'],
  sec_fund_network: ['TLS', 'HTTPS', 'VPN', '堡垒机', 'NetworkPolicy'],
  sec_fund_logging: ['审计日志', 'requestId', 'Authorization', '日志完整性'],
  sec_web_sqli: ['SQL', '参数化查询', 'ORM', '标识符白名单', '二次注入'],
  sec_web_xss: ['XSS', 'DOM', 'CSP', 'innerHTML', 'textContent'],
  sec_web_access: ['IDOR', '对象级授权', '租户隔离', '对象枚举'],
  sec_web_ssrf: ['SSRF', 'DNS 重绑定', '云元数据', 'Webhook'],
  sec_pentest_scope: ['ROE', '授权范围', '最小影响'],
  sec_pentest_discover: ['CMDB', '服务指纹', 'Nmap'],
  sec_pentest_validate: ['最小复现', '证据链', 'Burp Repeater'],
  sec_pentest_report: ['风险评级', '复测'],
  sec_auto_lab: ['Docker Compose', 'OWASP', '数据快照'],
  sec_auto_scan: ['OWASP ZAP', '基线扫描', 'Nuclei', '模板', 'JSONL'],
  sec_auto_authz: ['Playwright', 'browser context', 'storageState', '断言', 'trace'],
  sec_auto_pipeline: ['CI/CD', '质量门', '误报', '豁免'],
  sec_lang_c: ['C', 'snprintf', 'ASan', 'UBSan'],
  sec_lang_cpp: ['C++', 'RAII', 'std::span', 'std::string_view'],
  sec_lang_java: ['Java', 'JDBC', 'PreparedStatement', 'JPA', 'SpEL'],
  sec_lang_python: ['Python', 'subprocess', 'shell=True', 'Path.resolve'],
  sec_lang_javascript: ['JavaScript', 'Node.js', 'DOM', 'AbortSignal', 'fetch'],
  sec_lang_php: ['PHP', 'PDO', 'htmlspecialchars', 'session ID'],
  sec_lang_go: ['Go', 'HTTP', 'http.Client', 'Transport', 'context'],
  sec_lang_rust: ['Rust', 'ownership', 'unsafe', 'FFI', 'Miri'],
  sec_def_layer: ['WAF', '纵深防御', 'HSTS', '安全响应头'],
  sec_def_detect: ['SIEM', '检测规则', '基线', '误报治理'],
  sec_def_ir: ['事件响应', '遏制', '取证', '根因', '凭据轮换'],
  sec_dev_ci: ['SAST', 'DAST', 'SCA'],
  sec_dev_secrets: ['Secrets', 'Secret Manager', '轮换', '最小作用域'],
  sec_dev_sbom: ['SBOM', '传递依赖', 'SPDX', '来源证明'],
} satisfies Record<string, readonly SecurityTermKey[]>;

export const SECURITY_PATH_TERM_KEYS = {
  sec_fundamentals: [
    'API', 'Nginx', '威胁建模', 'STRIDE', '数据流图', '对象存储', '预签名 URL', '多租户', '上传限额', 'MIME',
    '认证', '会话', '密码哈希', '慢哈希', '盐', 'Argon2', 'bcrypt', 'scrypt', 'MFA', 'Cookie', 'HttpOnly',
    'Secure', 'SameSite', '会话固定', '会话轮换', '令牌', 'CSRF', '撞库', '账号接管', '限速', 'TLS', 'HTTPS',
    'IP', 'HTML', 'SHA-256', 'RBAC', 'SSRF',
    '入站访问', '出站访问', 'VPN', '堡垒机', '横向移动', '安全组', 'NetworkPolicy', '审计日志', 'requestId',
    'Authorization', '日志完整性', '日志保留周期',
  ],
  sec_web: [
    'API', 'Nginx', 'SQL', 'SQL 注入', '参数化查询', 'ORM', '标识符白名单', '二次注入', 'ORDER BY', 'XSS',
    'WHERE', 'RBAC', 'HTTPS',
    'DOM', 'HTML', '输出编码', '富文本消毒', 'CSP', 'DOMPurify', 'innerHTML', 'textContent', 'SVG', 'IDOR',
    '对象级授权', '租户隔离', '对象枚举', 'SSRF', 'URL', 'DNS', 'DNS 重绑定', 'URL 白名单', '私网地址',
    '回环地址', '云元数据', 'Webhook', '重定向', 'OWASP',
  ],
  sec_pentest: [
    'ROE', '渗透测试', '授权范围', '攻击面', 'CMDB', '服务指纹', 'banner', '被动信息收集', '主动探测',
    '最小影响', '证据链', '最小复现', '可利用性', '风险评级', '复测', 'Burp Repeater', 'Nmap', 'ffuf',
    'curl', 'OWASP', 'SQL', 'IDOR', '授权范围',
  ],
  sec_automation: [
    'OWASP', 'Docker', 'Docker Compose', 'Juice Shop', 'WebGoat', '数据快照', '回环地址', 'OWASP ZAP',
    '基线扫描', 'Nuclei', '模板', 'JSONL', 'Playwright', 'browser context', 'UUID', 'storageState', '断言', 'trace',
    'CI', 'CI/CD', '质量门', '误报', '豁免', 'SSRF', 'IDOR', 'API',
    'SAST', 'DAST',
  ],
  sec_languages: [
    'C', 'C++', '缓冲区', 'null 终止符', 'strcpy', 'sprintf', 'snprintf', 'strlcpy', 'ASan', 'UBSan',
    'sanitizer', 'gdb', 'RAII', 'std::vector', 'std::span', 'std::string_view', '智能指针', 'new/delete',
    '异常安全', 'Java', 'JDBC', 'PreparedStatement', 'JPA', 'JPQL', 'Spring Boot', 'SpEL', '反序列化',
    '远程代码执行', 'Bean Validation', 'Python', 'subprocess', 'shell', 'shell=True', 'Path.resolve', 'ffmpeg',
    'pytest', '命令注入', '路径穿越', '允许列表', 'JavaScript', 'Node.js', 'DOM', 'DOM XSS', 'XSS', 'CSP',
    'URL allowlist', 'AbortSignal', 'fetch', 'SSRF', 'PHP', 'PDO', 'htmlspecialchars', 'MIME', 'session ID',
    'addslashes', 'echo', 'SQLite', 'MySQL', 'Go', 'HTTP', 'http.Client', 'Transport', 'context',
    'io.LimitReader', '重定向策略', 'Rust', 'ownership', 'unsafe', 'FFI', 'canonicalize', 'Command', 'Miri',
    'clippy', 'cargo', 'SQL', 'ORM', 'API', 'IDOR', 'HTTPS', 'CLI',
  ],
  sec_defense: [
    'WAF', 'SIEM', 'SOC', '检测规则', '基线', '误报', '误报治理', '纵深防御', '攻击面', 'HSTS', '安全响应头',
    'X-Content-Type-Options', 'X-Frame-Options', 'SLA', '事件响应', '遏制', '隔离', '取证', '根因', '凭据轮换',
    'TLS', 'CSP', 'Nginx', 'SQL', 'IP',
  ],
  sec_devsecops: [
    'DevSecOps', 'SAST', 'DAST', 'SCA', 'SBOM', 'Secrets', '依赖扫描', '锁文件', '传递依赖', 'SPDX',
    '来源证明', 'SRE', 'Secret Manager', '轮换', '最小作用域', '环境变量', '供应链', '签名', 'CI', 'CI/CD',
    '质量门', '误报', '豁免', 'API',
  ],
} satisfies Record<string, readonly SecurityTermKey[]>;
