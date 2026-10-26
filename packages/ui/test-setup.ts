// vitest 全局前置：jsdom 环境缺 window.matchMedia 的兜底。
//
// 背景：ConsoleShell → useIsMobile 在模块顶层调用 window.matchMedia；
// jsdom 没有实现它，两个 mount 测试（consoleShell / shopConsole）整套挂掉。
// 只在真有 window 的环境补（node 环境的用例不受影响）。
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
