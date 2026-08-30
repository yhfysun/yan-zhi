---
name: code-security-audit
description: 代码安全审计与漏洞扫描。当用户要求"代码安全检查""安全审计""漏洞扫描""检查代码有没有安全问题"时触发。检查 SQL 注入、XSS、硬编码密钥、路径遍历、命令注入、不安全反序列化等常见漏洞，支持多语言（Python/JavaScript/TypeScript/Java/Go）。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 代码安全审计（code-security-audit）

对代码进行安全审计，检查常见安全漏洞。结合静态分析工具（semgrep/bandit/eslint）和人工审查模式，覆盖 OWASP Top 10。

## 何时触发

- 用户说"安全审计""漏洞扫描""代码安全检查"等
- 用户要求检查某个项目/文件的安全问题
- 用户要求审查依赖是否有已知漏洞

## 依赖安装

```bash
# 通用静态分析
pip install semgrep
# Python 专项
pip install bandit safety
# Node.js 专项
npm install -g eslint eslint-plugin-security
# 依赖审计
pip install pip-audit
npm install -g npm-audit
```

## 标准流程

1. **确定范围**：明确审计的目录/文件/语言
2. **工具扫描**：运行 semgrep/bandit/eslint 自动扫描
3. **人工审查**：基于检查清单逐项审查关键代码
4. **汇总报告**：按严重程度分类，给出修复建议

## 自动扫描

### Semgrep（多语言通用）

```bash
# 扫描所有规则
semgrep --config auto ./src

# 特定规则集
semgrep --config p/owasp-top-ten ./src
semgrep --config p/security-audit ./src
semgrep --config p/secrets ./src

# 输出 JSON
semgrep --config auto --json ./src > results.json
```

### Bandit（Python 专项）

```bash
bandit -r ./src -f json -o bandit-report.json
bandit -r ./src -ll  # 只显示中高风险
```

### ESLint 安全插件（JS/TS）

```bash
eslint ./src --ext .js,.ts,.tsx --plugin security --rule '{"security/detect-object-injection": "error"}'
```

### 依赖漏洞审计

```bash
# Python
pip-audit
safety check

# Node.js
npm audit
npm audit --audit-level=high
```

## 人工审查检查清单

### 1. SQL 注入

```python
# 危险：拼接 SQL
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")

# 安全：参数化查询
cursor.execute("SELECT * FROM users WHERE name = ?", (name,))
```

检查点：所有数据库查询是否用参数化/ORM，有无字符串拼接 SQL。

### 2. XSS（跨站脚本）

```javascript
// 危险：直接插入 HTML
element.innerHTML = userInput

// 安全：文本内容
element.textContent = userInput
// 或转义
import DOMPurify from 'dompurify'
element.innerHTML = DOMPurify.sanitize(userInput)
```

检查点：`innerHTML`/`v-html`/`dangerouslySetInnerHTML` 是否对输入做了转义。

### 3. 硬编码密钥/凭证

```python
# 危险
API_KEY = "sk-xxxxxxxxxxxx"
DB_PASSWORD = "admin123"

# 安全：从环境变量读取
import os
API_KEY = os.environ.get("API_KEY")
```

检查点：源码中是否有 API Key、密码、Token 等硬编码。

### 4. 路径遍历

```python
# 危险
path = os.path.join(base_dir, user_input)  # user_input 可能含 ../

# 安全：校验路径
real_path = os.path.realpath(os.path.join(base_dir, user_input))
if not real_path.startswith(os.path.realpath(base_dir)):
    raise ValueError("非法路径")
```

检查点：文件操作是否校验路径不超出允许范围。

### 5. 命令注入

```python
# 危险
os.system(f"ls {user_input}")
subprocess.call(f"convert {filename} out.png", shell=True)

# 安全：不用 shell=True，传列表
subprocess.call(["convert", filename, "out.png"])
```

检查点：`os.system`/`subprocess.call(shell=True)`/`exec` 是否用了未净化的输入。

### 6. 不安全反序列化

```python
# 危险
import pickle
data = pickle.loads(user_input)

# 安全：用 JSON
import json
data = json.loads(user_input)
```

检查点：`pickle.loads`/`yaml.load`（非 `safe_load`）/`eval` 是否处理了不可信输入。

### 7. 权限与认证

检查点：
- 敏感接口是否有认证/鉴权
- 是否存在越权（IDOR）风险
- 密码是否加密存储（bcrypt/argon2）
- JWT 是否校验签名和过期

### 8. HTTPS 与传输安全

检查点：
- API 是否强制 HTTPS
- 是否禁用了 SSL 证书校验（`verify=False`）
- Cookie 是否设置 `Secure`/`HttpOnly`/`SameSite`

## 报告格式

```
## 安全审计报告

### 严重（Critical）
- [SQL注入] src/db.py:42 — 用户输入直接拼接 SQL
  修复：改用参数化查询

### 高危（High）
- [硬编码密钥] config.js:10 — API_KEY 明文写在源码
  修复：移到环境变量

### 中危（Medium）
- [XSS] components/Comment.vue:25 — v-html 未转义
  修复：用 DOMPurify.sanitize

### 低危（Low）
- [信息泄露] app.js:5 — 错误信息直接返回给用户
  修复：返回通用错误消息

### 依赖漏洞
- lodash@4.17.4 — CVE-2021-23337（原型链污染）
  修复：升级到 4.17.21+
```

## 注意事项

- 自动扫描有误报，需人工确认
- 重点关注：输入验证、认证授权、数据加密、错误处理
- 修复建议要给出具体代码示例
- 依赖漏洞检查 `npm audit` / `pip-audit` 不可少
- 不要在对话中输出真实密钥/Token，用 `***` 脱敏