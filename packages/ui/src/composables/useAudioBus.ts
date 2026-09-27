// 全局音频总线：同一时刻只允许一路音频在响。
//
// 为什么必须有：一轮配音任务会产出几十条音频产物，每条卡片各持一个 <audio>；
// 不做互斥的话，播了第二条第一条还在响 —— 两路声音叠在一起，用户根本分不清
// 是哪条在播，只能一条条去点暂停。这里让"开始播"顺带把其它实例停掉。
//
// 只登记 <audio> 元素本身（不登记组件实例），组件卸载时自行注销，无内存泄漏。

const players = new Set<HTMLAudioElement>();

/** 组件挂载时登记自己的 audio 元素 */
export function registerAudio(el: HTMLAudioElement) {
  players.add(el);
}

/** 组件卸载时注销（元素被 GC 前必须摘掉，否则集合会越攒越大） */
export function unregisterAudio(el: HTMLAudioElement) {
  players.delete(el);
}

/** 某一路开始播放前调用：停掉其余正在播的音频 */
export function pauseOtherAudio(el: HTMLAudioElement) {
  for (const p of players) {
    if (p !== el && !p.paused) {
      try { p.pause(); } catch { /* 元素已卸载，忽略 */ }
    }
  }
}