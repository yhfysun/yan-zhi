# Java 断点调试：按需下载接入方案

> 状态：方案（拍板 2026-10-03：方案 A——按需下载接真，对齐 Python debugpy 的运行时补装模式）
> 关联：`services/dap-client.ts`（现成 DAP 客户端）、`services/debug-manager.ts`（Python=debugpy / Node=CDP 已真实现）、`plugins/java-suite.ts:784-836`（三件套桩）、`routes/env.ts:79-91`（debugpy 一键安装先例）

## 1. 现状问题

`java_debug_set_breakpoint` 只把断点 push 进内存数组就报"断点已设置"——**伪成功**（用户以为断上了，实际 JVM 无感知）；`java_debug_step / continue / eval` 返回"需要接入 DAP 适配器"。`/debug/capability` 路由如实返回 `java.debug:false`，但 UI 三个按钮仍可点。

## 2. 方案

### 2.1 依赖形态（关键取舍）

Java 调试不是 npm 包，是 **Java 进程**：
- **JDWP 本身免费**：JVM 自带（`-agentlib:jdwp=...`），运行（run）模式已在用。
- **断点/单步/求值**需要 DAP 层：采用 **microsoft/java-debug**（com.microsoft.java.debug.plugin，单个 jar ~2MB）+ 最小化启动，**不引入完整 JDT.LS**（60~120MB 的是 jdt.ls，含语言服务；断点调试不需要它）。
  - java-debug plugin 依赖 JDT core（org.eclipse.jdt.core jar，~5MB）——两个 jar 共 ~7MB，随需下载，完全可接受。
  - 代价：不支持"源码级富语义"（这是 jdt.ls 的活）。**本期断点够用，LSP 仍是独立 P2**。

### 2.2 运行时补装（复用 debugpy 模式）

```
.env 检测：.yan-zhi/runtimes/java-debug/ 下有两个 jar 且版本匹配 → 就绪
缺失 → routes/env 提供「一键安装」：
  下载源优先级：npmmirror/阿里云镜像 → GitHub release（与 python 运行时同口径，国内网络可达性已踩平）
  校验 sha256（写死在代码里的已知版本清单，防供应链）
  就绪后 /debug/capability 返回 java.debug:true
```

### 2.3 调试链路

```
java_test_run / 运行配置启动 JVM（现有 debug-manager 的 JDWP attach 已有）
  → JVM 以 -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=<port> 启动
  → dap-client.ts（现有通用 DAP 客户端）spawn java 进程：
       java -cp java-debug.jar:jdt-core.jar com.microsoft.java.debug.plugin.Launcher
       （或直接用 java-debug 的 DAP server 模式）→ DAP over stdio
  → 断点/单步/继续/求值全走标准 DAP 请求（setBreakpoints/next/continue/evaluate）
```

### 2.4 改动点

| 改动 | 文件 |
|---|---|
| `java_debug_set_breakpoint` 接 DAP `setBreakpoints`；断点状态从内存数组改为 DAP 会话状态 | `plugins/java-suite.ts:784` |
| `java_debug_step/continue/eval` 接 DAP `next/continue/evaluate`，删除三处"需要接入 DAP 适配器"桩 | `plugins/java-suite.ts:807-836` |
| Java DAP 会话管理（启动/复用/退出，挂到现有运行会话） | `services/debug-manager.ts`（新增 java 分支） |
| 一键安装（双 jar + sha256 + 镜像优先） | `routes/env.ts`（照抄 debugpy 安装的结构） |
| capability 动态化 | `routes/debug.ts:15-21`（就绪后 `java.debug:true`） |
| UI：未就绪时按钮禁用 + "一键安装"引导（消灭伪成功） | `RunDebugPanel.vue` 相关分支 |

### 2.5 分期与验收

- **P1**：安装器 + 断点/继续/单步（`suspend=y` 起步，attach 到已运行进程 P2）。
- **验收**：对示例 Spring Boot 项目——下断点 → 请求命中 → 断在指定行（编辑器高亮联动，现有断点 gutter 已有）→ 单步 → evaluate 表达式返回真实值；全程无"伪成功"。
- **风险**：java-debug 对 JDK 版本有要求（≥8，JDK 17+ 兼容性最好）——环境配置页（`EnvConfig.vue` Java tab）已有 JDK 检测，安装前校验；用户 JDK 过老给明确提示。
