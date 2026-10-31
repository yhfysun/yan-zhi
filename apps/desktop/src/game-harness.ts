/**
 * 弹幕游戏 harness：dev-only 入口，绕开直播页授权墙，直接挂 DanmakuGame。
 * 用法：desktop 的 vite 起来后访问 /game-harness.html?mode=chibi|stars|debate|surname|mbti
 * 交互冒烟只做「能渲染 + 能收礼物/弹幕 + 能切玩法」，不看像素。
 */
import { createApp, h, ref } from 'vue'
import DanmakuGame from '@yan-zhi/ui/components/live/DanmakuGame.vue'

const mode = new URLSearchParams(location.search).get('mode') || 'chibi'

const app = createApp({
  setup() {
    const sayLog = ref<string[]>([])
    const onSay = (text: string) => {
      sayLog.value = [...sayLog.value.slice(-9), text]
    }
    return () =>
      h('div', { style: 'position:relative;width:360px;height:640px;' }, [
        h(DanmakuGame, { active: true, onSay: onSay }),
        h(
          'div',
          {
            id: 'say-log',
            style:
              'position:fixed;left:8px;bottom:8px;max-width:340px;font:11px monospace;color:#9fe08f;z-index:9;white-space:pre-wrap;text-shadow:0 1px 2px #000;',
          },
          sayLog.value.join('\n'),
        ),
      ])
  },
})
void mode
app.mount('#app')
