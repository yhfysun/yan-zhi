// Peek 入口：manifest 的 entry 不能带 query，这里带参数跳到桌面层页面。
// ★ 必须用外部脚本：插件资源有 CSP，内联 <script> 不会执行。
location.replace('./layer.html?peek=1');
