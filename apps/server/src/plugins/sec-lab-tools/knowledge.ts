// 安全知识库：技能参考 / 战例 / 速查（sec-lab P4，2026-10-17）。
//
// ★ 为什么内置在代码里而不是读 `.claude/skills`：打包后的应用里那个目录不一定存在，
//   而"知识库打不开"会让这三条命令形同虚设。内置内容短、可维护，覆盖最高频的判断。
// ★ 这里的 skill **不是**本仓 skill 系统里的技能（那套是可执行的提示词包），
//   而是"给人看的方法论速记" —— 两者不要混（混了以后 `@技能` 会召唤到纯文档）。
import type { ToolOutput } from '../sec-lab-types.js';

export interface KbEntry {
  name: string;
  desc: string;
  tags: string[];
  body: string;
}

export const SEC_SKILLS: KbEntry[] = [
  {
    name: 'recon', desc: '信息收集方法论：先被动后主动，先面后点', tags: ['recon', 'osint'],
    body: `1. 被动优先：WHOIS / CT 日志 / DNS 记录 / 公开检索，不向目标发包。
2. 建立资产清单：主域 → 子域 → IP → 端口 → 服务版本。
3. 只对清单里**已授权**的目标做主动探测。
4. 每一步都留证据（响应头、证书、banner），报告要能复现。
5. 发现新资产先确认归属，再决定是否纳入范围 —— 影子资产最容易越界。`,
  },
  {
    name: 'web-pentest', desc: 'Web 应用渗透检查表：从面到点', tags: ['web', 'checklist'],
    body: `入口面：爬虫 / JS 接口 / 目录爆破 / 参数枚举。
配置面：安全响应头 / CORS / Cookie 属性 / 目录遍历 / 调试端点。
认证面：登录表单 / JWT / 会话固定 / 默认口令 / 找回流程。
注入面：SQLi / XSS / SSRF / 模板注入 / 命令注入 / 反序列化。
业务面：越权（水平/垂直）/ 支付金额篡改 / 并发竞态。
★ 每类先做**只读验证**；写操作与利用链必须单独授权。`,
  },
  {
    name: 'vuln-verify', desc: '漏洞验证与误报控制', tags: ['verify', 'quality'],
    body: `1. 先复现，再定级：没有证据的发现项只能算"可疑"。
2. 误报来源：自定义 404、WAF 拦截页、CDN 缓存、动态内容。
3. 控制变量：同一参数、同一请求、只改注入字符，对比响应。
4. 无回显漏洞用带外（OAST）确认，别用"看起来像"下结论。
5. 定级按**可利用性 × 影响**，不是按扫描器标签。`,
  },
  {
    name: 'intranet', desc: '内网评估要点（授权范围内）', tags: ['intranet'],
    body: `· 先做存活与端口测绘，再谈漏洞。
· 常见高风险：SMB 未签名 / 匿名共享、RDP 暴露、Netlogon、默认口令、未打补丁的中间件。
· 横向移动属利用行为，需要**额外书面授权**；本工具只做发现与验证。
· 凭据只验证"是否可用"，不采集、不落盘、不复用。`,
  },
  {
    name: 'cloud', desc: '云与容器配置检查', tags: ['cloud', 'container'],
    body: `· 对象存储：匿名读写、目录列举、预签名 URL 过期时间。
· 元数据服务：169.254.169.254 是否可从业务侧访问（SSRF 的高价值目标）。
· 容器：特权模式、挂载 docker.sock、latest 标签、以 root 运行。
· K8s：匿名 API、Dashboard 暴露、RBAC 过宽。
★ 云 API 的越权测试需要明确的服务范围与账号授权。`,
  },
  {
    name: 'mobile', desc: 'Android 应用测试要点', tags: ['mobile', 'android'],
    body: `· 传输：明文 HTTP、证书校验缺失、自定义 TrustManager。
· 存储：SharedPreferences / 数据库明文存 token、日志泄露。
· 组件：导出 Activity/Service/Receiver、ContentProvider 越权。
· 逆向：加固识别、硬编码密钥、签名校验是否可绕过。
· 本工具只提供靶场模拟器启动；真机测试需自行准备授权环境。`,
  },
  {
    name: 'crypto', desc: '编解码与 JWT 速记', tags: ['crypto'],
    body: `· 看到 = 结尾先试 base64；看到一串大写字母数字试 base32；比特币风格试 base58。
· JWT：header/payload 是 base64url，**不加密**；alg=none 一律视为严重缺陷。
· 哈希只能识别类型，不能"解密"；碰撞与彩虹表需要外部工具。
· 不要凭字面猜编码：用 /decode 逐个试，比人眼可靠。`,
  },
  {
    name: 'reporting', desc: '安全评估报告写法', tags: ['report'],
    body: `结论先行：最严重的问题与总体暴露面放第一屏。
每条发现：标题 / 级别 / 证据（请求与响应片段）/ 影响 / 修复建议。
移除误报：标 fp 的条目不会进报告（状态机已支持）。
可复现：写清目标、参数、payload，让开发能照着复现。
不夸大：不确定就写"待确认"，不要为了显得专业而抬级。`,
  },
];

export const WARSTORIES: KbEntry[] = [
  {
    name: 'php-deserialization', desc: 'PHP 反序列化：从魔术方法到危险 sink', tags: ['php', 'deserialize'],
    body: `现象：接口接收 base64 字符串，解码后进入 unserialize()。
关键点：pop 链通常由 __destruct / __wakeup 触发，最终落到 file_put_contents / system。
排查顺序：找 unserialize 调用点 → 找可控类 → 找魔术方法里的危险操作。
验证：先在本地同版本 PHP 复现对象链，再对目标做**只读**验证（如读取一个可控路径）。
教训：只看"有没有 unserialize"不够，要看**类是不是可控**。`,
  },
  {
    name: 'jwt-none', desc: 'JWT alg=none：最容易漏的签名缺陷', tags: ['jwt', 'auth'],
    body: `现象：把 header 改成 {"alg":"none"}、去掉签名段，服务端仍然接受。
根因：服务端信任 token 自称的算法，而不是白名单校验。
验证：只需改 header 与 payload，不需要任何密钥。
修复：服务端固定期望算法；拒绝 alg=none；校验签名后再读 payload。
教训：JWT 的"签名"只有在服务端**强制校验算法**时才成立。`,
  },
  {
    name: 'git-exposure', desc: '.git 目录暴露：一次拿到全部源码', tags: ['exposure', 'git'],
    body: `现象：/.git/config 可访问，随后可拉取 objects 还原源码与历史。
验证：GET /.git/config 看是否含 [core]；再试 /.git/HEAD。
影响：源码泄露 → 硬编码密钥、内部接口、历史提交里的口令全部暴露。
修复：Web 服务器拒绝 /.git/*；部署产物不带 .git；泄露后**轮换全部密钥**。
教训：暴露的不只是代码，还有"曾经写进代码的东西"。`,
  },
];

export const CHEATSHEETS: KbEntry[] = [
  {
    name: 'nmap', desc: 'nmap 常用参数速查', tags: ['nmap', 'scan'],
    body: `-sS          半开 SYN 扫描（需权限）
-sT          全连接扫描（无权限时）
-sV          服务与版本识别
-sC          默认脚本
-p 80,443    指定端口；-p- 全端口
--top-ports 100
-T4          速度模板（别对生产用 T5）
--script safe  只跑安全脚本
-oX out.xml  输出 XML（便于解析）
★ 本工具只接管白名单内的参数组合，脚本类需显式授权。`,
  },
  {
    name: 'curl', desc: 'curl 调试速查', tags: ['curl', 'http'],
    body: `-i            显示响应头
-I            只取头（HEAD）
-v            详细握手与请求
-L            跟随重定向
-H 'X: y'     自定义头
-d 'a=1'      POST 表单
--data-raw    POST 原始体
-A 'ua'       User-Agent
--resolve host:443:IP  指定解析（测 Host 头与 CDN 回源）
★ 带凭据的请求不要贴进工单/聊天。`,
  },
  {
    name: 'jwt', desc: 'JWT 检查步骤', tags: ['jwt'],
    body: `1. /jwt <token> 解析 header/payload。
2. 看 alg：none → 严重；HS* → 弱密钥可离线验证。
3. 看 exp：缺失或过长都是问题。
4. 看敏感字段：是否把 role/isAdmin 放在 payload 里（可篡改面）。
5. 看 kid/jku：是否可注入路径或外部 URL。
★ 本工具不解密也不需要密钥。`,
  },
  {
    name: 'sqlmap', desc: 'sqlmap 参数速查（B 轨，需授权）', tags: ['sqlmap', 'sqli'],
    body: `--batch          非交互
-u "url"         目标
--cookie / --headers
--level 1-5      检测深度
--risk 1-3       风险（3 会用时间盲注等）
--dbs / --tables / --dump
--os-shell       落地（本工具黑名单，禁止）
★ 先用 /sqli 做只读验证；sqlmap 只在明确授权下用，且不要 --os-shell。`,
  },
  {
    name: 'ffuf', desc: 'ffuf 目录/参数爆破速查', tags: ['ffuf', 'dirb'],
    body: `-u https://t/FUZZ -w wordlist.txt
-fc 404          过滤状态码
-fs 1234         过滤响应长度（去自定义 404）
-mc 200,301,403  只留这些状态
-rate 50         限速（别把目标打挂）
-H 'Host: vhost' 虚拟主机枚举
★ 本工具的 /dirsearch 已内置随机路径基线，先跑它更省事。`,
  },
];

function indexOf(list: KbEntry[], q: string): KbEntry[] {
  const k = String(q || '').trim().toLowerCase();
  if (!k) return list;
  return list.filter((e) => e.name.includes(k) || e.desc.toLowerCase().includes(k) || e.tags.some((t) => t.includes(k)));
}

function render(tool: string, list: KbEntry[], label: string, cmd: string): ToolOutput {
  return {
    tool, target: '', risk: 'passive',
    summary: `${label}共 ${list.length} 条：\n` + list.map((e) => `· ${e.name} —— ${e.desc}`).join('\n') +
      `\n\n用 /${cmd} <name> 看正文。`,
    findings: [],
    raw: list.map((e) => ({ name: e.name, desc: e.desc, tags: e.tags })),
  };
}

function detail(tool: string, list: KbEntry[], name: string): ToolOutput {
  const entry = list.find((e) => e.name === name) || indexOf(list, name)[0];
  if (!entry) throw new Error(`没有「${name}」，可用：${list.map((e) => e.name).join(' / ')}`);
  return {
    tool, target: '', risk: 'passive',
    summary: `${entry.name} —— ${entry.desc}\n\n${entry.body}`,
    findings: [],
    raw: entry,
  };
}

/** `/skill list|load <name>` */
export function runSkill(action: string, name: string): ToolOutput {
  const a = String(action || 'list').toLowerCase();
  if (a === 'list') return render('sec_skill', SEC_SKILLS, '安全技能参考', 'skill');
  if (a === 'load' || a === 'show') return detail('sec_skill', SEC_SKILLS, name);
  throw new Error('action 必须是 list / load');
}

/** `/warstory [topic]` */
export function runWarstory(topic: string): ToolOutput {
  const t = String(topic || '').trim();
  if (!t) return render('warstory', WARSTORIES, '战例库', 'warstory');
  const hits = indexOf(WARSTORIES, t);
  return hits.length === 1 ? detail('warstory', WARSTORIES, hits[0].name) : render('warstory', hits, '匹配的战例', 'warstory');
}

/** `/cheatsheet [topic]` */
export function runCheatsheet(topic: string): ToolOutput {
  const t = String(topic || '').trim();
  if (!t) return render('cheatsheet', CHEATSHEETS, '速查表', 'cheatsheet');
  const hits = indexOf(CHEATSHEETS, t);
  return hits.length === 1 ? detail('cheatsheet', CHEATSHEETS, hits[0].name) : render('cheatsheet', hits, '匹配的速查', 'cheatsheet');
}
