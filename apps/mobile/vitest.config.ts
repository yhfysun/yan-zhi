// 移动端单测配置。
//
// ★★ 必须导出**纯对象**，不能用 `defineConfig`：
// apps/mobile 未声明 vitest 依赖（它只在根 .pnpm 里），`defineConfig` 会在
// 加载配置时 `import 'vitest/config'` → ERR_MODULE_NOT_FOUND。
// 纯对象配置不 import 任何包，vitest 直接消费。
//
// ★ 为什么要给 apps/mobile 单独配：本项目此前只有 packages/ui 有测试体系，
// 移动端纯逻辑（如 path-utils 的路径归一化）无处安放，只能靠"打包后手测" ——
// 而移动端手测成本极高（要真机 / 模拟器），导致 bug 反复。
// 见 path-utils.ts 顶部说明（它就是因「预览报文件不存在」而抽出来的）。
export default {
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
};