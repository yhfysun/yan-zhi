// 前端镜像：apps/server/src/services/dev-env.ts 的 DevEnvConfig。
// 两边字段需保持一致（后端是真相源），改动时同步修改。
export interface DevEnvConfig {
  javaHome: string;
  mavenHome: string;
  pythonPath: string;
  nodePath: string;
  cCompilerPath: string;
  cppCompilerPath: string;
  goPath: string;
  cmakePath: string;
  gitPath: string;
  defaultShell: 'powershell' | 'cmd' | 'bash';
  extraEnv: Record<string, string>;
  javaOpts: string;
  mavenOpts: string;
  pipIndexUrl: string;
}

export interface DevToolStatus {
  id: 'java' | 'maven' | 'python' | 'node' | 'c' | 'cpp' | 'go' | 'cmake' | 'git';
  label: string;
  path: string;
  version: string;
  ok: boolean;
  error: string;
}
