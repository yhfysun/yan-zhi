// 宠物窗「代玩避让」定位计算 —— 纯函数模块（可 node --test 真跑）。
//
// ★ 背景（2026-10-29）：智能体代玩游戏时，宠物窗是置顶透明窗，会盖住游戏画面。
//   已拍板的策略是"缩小并挪到右下角"，结束后恢复原位原尺寸。
//   把"算到哪"抽成纯函数：多屏（workArea 的 x/y 可能为负）、留边、避开底部执行条
//   三类边界都直接单测，不靠人眼看窗口。

/**
 * 右下角停靠矩形。
 * @param {{x:number,y:number,width:number,height:number}} workArea 目标显示器工作区
 * @param {{w:number,h:number}} size 宠物窗尺寸
 * @param {{margin?:number,avoidBottom?:number}} [opts] 边距 / 底部额外留白（执行条高度）
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function dockRect(workArea, size, opts) {
  const o = opts || {};
  const area = workArea || { x: 0, y: 0, width: 0, height: 0 };
  const margin = Number.isFinite(Number(o.margin)) ? Number(o.margin) : 12;
  const avoidBottom = Math.max(0, Number(o.avoidBottom) || 0);
  const w = Math.max(1, Math.round(Number(size && size.w) || 1));
  const h = Math.max(1, Math.round(Number(size && size.h) || 1));
  const x = Math.round(area.x + area.width - w - margin);
  const y = Math.round(area.y + area.height - h - margin - avoidBottom);
  // 区域比窗口还小时钳到左上角，别把宠物丢出屏幕
  return {
    x: Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - w))),
    y: Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - h))),
    width: w,
    height: h,
  };
}

/** 按比例缩放宠物窗尺寸（代玩时缩到 0.7，保留原宽高比） */
function scaledSize(size, scale) {
  const s = Math.min(2, Math.max(0.5, Number(scale) || 1));
  return {
    w: Math.max(1, Math.round((Number(size && size.w) || 1) * s)),
    h: Math.max(1, Math.round((Number(size && size.h) || 1) * s)),
  };
}

module.exports = { dockRect, scaledSize };
