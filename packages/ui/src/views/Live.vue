<template>
  <div class="page live-page">
    <header class="page-header">
      <div>
        <h2 class="page-title">直播</h2>
        <div class="page-sub">宠物主播 · 本地预演</div>
      </div>
      <div class="header-actions">
        <span class="live-status" :class="{ 'live-status--on': live }">
          <i />{{ statusText }}
        </span>
        <el-button v-if="live" :icon="recording ? VideoPause : VideoCamera" @click="toggleRecord">
          {{ recording ? `停止录制 ${recElapsed}` : '录制' }}
        </el-button>
        <el-button v-if="live" :type="streaming ? 'danger' : 'default'" :icon="Promotion" @click="toggleStream">
          {{ streaming ? '停止推流' : '推流' }}
        </el-button>
        <el-button v-if="!live" type="primary" :icon="VideoPlay" @click="onStart">开播</el-button>
        <el-button v-else type="danger" :icon="VideoPause" @click="onStop">下播</el-button>
      </div>
    </header>

    <div class="live-layout">
      <section class="live-stage-wrap">
        <div class="live-stage" ref="stageEl" :data-live="live ? '1' : '0'" :data-scene="liveStore.scene">
          <div class="live-bg" />

          <div v-if="maskOn && isCaptureScene" class="live-mask" />

          <div v-if="isCaptureScene" class="live-capture">
            <img
              v-if="liveStore.scene === 'game-pip' && gameMode === 'cdp' && gameFrame"
              class="live-capture__video"
              :src="gameFrame"
              alt=""
            />
            <video v-else ref="captureVideo" class="live-capture__video" autoplay muted playsinline />
            <div v-if="liveStore.scene === 'game-pip' && gameMode === 'cdp' ? !gameFrame : !capturing" class="live-capture__empty">
              {{ liveStore.scene === 'game-pip' && gameMode === 'cdp' ? '先在浏览器页打开游戏，再点「开始画面」' : '选择窗口后点「开始采集」' }}
            </div>
          </div>

          <div class="live-badges">
            <span v-if="live" class="live-tag live-tag--on"><i />直播中</span>
            <span v-if="recording" class="live-tag live-tag--rec"><i />REC {{ recElapsed }}</span>
            <span v-if="streaming" class="live-tag live-tag--on"><i />推流中</span>
            <span class="live-tag">AI 生成</span>
          </div>

          <div v-if="showPet" class="live-performer-slot live-slot--pet">
            <PetPerformer
              :state="petState"
              :action="action"
              :pack="pack"
              :renderer="renderer"
              :scale="scale"
              :active="visible"
              :visible="visible"
            />
          </div>
          <div v-if="showAvatar" class="live-performer-slot live-slot--avatar">
            <AvatarPerformer
              :vrm-id="avatarId"
              :expression="avatarExpression"
              :speaking="ttsSpeaking"
              :active="visible"
              :visible="visible"
            />
          </div>

          <DanmakuGame
            v-if="liveStore.scene === 'danmaku-game'"
            ref="gameRef"
            :active="visible"
            @say="onGameSay"
          />

          <div class="live-danmaku">
            <span
              v-for="item in flyingDanmaku"
              :key="item.id"
              class="live-dm"
              :style="{ top: item.lane * 11 + 8 + '%' }"
            >{{ item.text }}</span>
          </div>

          <Transition name="live-caption-fade">
            <div v-if="caption" class="live-caption">
              <span class="live-caption__who">{{ performerName }}</span>
              <span class="live-caption__text">{{ caption }}</span>
            </div>
          </Transition>

          <div v-if="!live" class="live-offline">
            <div class="live-offline__title">未开播</div>
            <div class="live-offline__sub">开播后这块画布就是推送画面</div>
          </div>
        </div>
        <div class="live-stage-meta">9:16 · {{ sceneLabel(liveStore.scene) }}</div>
      </section>

      <aside class="live-panel">
        <div class="live-card">
          <div class="live-card__title">场景</div>
          <div class="live-scenes">
            <button
              v-for="s in scenes"
              :key="s.key"
              type="button"
              class="live-scene-btn"
              :class="{ active: liveStore.scene === s.key }"
              :disabled="s.disabled"
              :title="s.hint || ''"
              @click="pickScene(s.key)"
            >{{ s.label }}</button>
          </div>
          <div v-if="pendingScenesHint" class="live-hint">{{ pendingScenesHint }}</div>
        </div>

        <div class="live-card">
          <div class="live-card__title">状态</div>
          <div class="live-kv"><span>直播</span><b>{{ statusText }}</b></div>
          <div class="live-kv"><span>推流</span><b>{{ streamText }}</b></div>
          <div class="live-kv"><span>阶段</span><b>{{ phaseText }}</b></div>
          <div class="live-kv"><span>字幕来源</span><b>{{ sourceText }}</b></div>
        </div>

        <div v-if="liveStore.scene === 'danmaku-game'" class="live-card">
          <div class="live-card__title">弹幕游戏 · 赤壁</div>
          <div class="live-actions">
            <el-button size="small" @click="gameGift('fairy')">仙女棒 +2</el-button>
            <el-button size="small" @click="gameGift('donut')">甜甜圈 +8</el-button>
            <el-button size="small" @click="gameGift('battery')">能量电池 +12</el-button>
          </div>
          <div class="live-actions">
            <el-button size="small" type="primary" @click="gameGift('super')">超级空投 +24</el-button>
            <el-button size="small" @click="gameReset">重开一局</el-button>
          </div>
          <div class="live-actions">
            <el-switch v-model="sourceOn" size="small" active-text="模拟弹幕流" @change="toggleSource" />
          </div>
          <div class="live-hint">
            改写度到 60% 就掀翻史实结局。打开「模拟弹幕流」会从服务端按节奏投递演示弹幕，
            整条链路和真实弹幕一致：源 → /api/live/danmaku → 游戏
          </div>
        </div>

        <div v-if="isCaptureScene" class="live-card">
          <div class="live-card__title">直播工作区</div>
          <el-radio-group v-if="liveStore.scene === 'game-pip'" v-model="gameMode" size="small">
            <el-radio-button value="window">窗口采集</el-radio-button>
            <el-radio-button value="cdp">浏览器帧流</el-radio-button>
          </el-radio-group>

          <template v-if="liveStore.scene === 'game-pip' && gameMode === 'cdp'">
            <div class="live-actions">
              <el-button size="small" type="primary" @click="toggleGameFrames">
                {{ gameCasting ? '停止画面' : '开始画面' }}
              </el-button>
            </div>
            <div v-if="gameError" class="live-hint live-hint--err">{{ gameError }}</div>
            <div v-else class="live-hint">
              采应用内浏览器当前页（与智能体操作同一页），延迟更低、窗口被遮挡也不影响
            </div>
          </template>

          <template v-else>
            <div class="live-actions">
              <el-button size="small" :disabled="!chat.currentConvId" @click="openWorkspace">打开任务执行窗</el-button>
              <el-button size="small" @click="refreshSources">刷新列表</el-button>
            </div>
            <el-select v-model="captureSourceId" size="small" class="live-select" placeholder="选择要播的窗口">
              <el-option v-for="s in captureSources" :key="s.id" :label="sourceLabel(s)" :value="s.id" />
            </el-select>
            <div class="live-actions">
              <el-button size="small" type="primary" :disabled="!captureSourceId" @click="toggleCapture">
                {{ capturing ? '停止采集' : '开始采集' }}
              </el-button>
            </div>
            <div v-if="captureError" class="live-hint live-hint--err">{{ captureError }}</div>
            <div v-if="captureWarning" class="live-hint live-hint--warn">{{ captureWarning }}</div>
            <div v-else class="live-hint">任务执行窗不含会话列表与文件路径，优先选它</div>
          </template>

          <div class="live-voice-row">
            <el-switch v-model="maskOn" size="small" />
            <span class="live-hint">隐私遮罩（盖住左侧）</span>
          </div>
        </div>

        <div class="live-card">
          <div class="live-card__title">形象</div>

          <div v-if="showAvatar" class="live-field">
            <span class="live-field__label">虚拟人</span>
            <el-select v-model="avatarId" size="small" class="live-select" placeholder="选择模型">
              <el-option v-for="v in PET_BUILTIN_VRMS" :key="v.id" :label="v.name" :value="v.id" />
            </el-select>
          </div>

          <template v-if="showPet">
            <div class="live-field">
              <span class="live-field__label">宠物</span>
              <el-radio-group v-model="renderer" size="small" class="live-field__control">
                <el-radio-button value="2d">2D 精灵</el-radio-button>
                <el-radio-button value="3d">3D 模型</el-radio-button>
              </el-radio-group>
            </div>
            <div v-if="renderer === '2d'" class="live-field">
              <span class="live-field__label" />
              <el-select v-model="pack" size="small" class="live-select" placeholder="选择精灵">
                <el-option v-for="p in PET_PACKS" :key="p.id" :label="p.label" :value="p.id" />
              </el-select>
            </div>
            <div class="live-slider">
              <span>大小</span>
              <el-slider v-model="scale" :min="1.2" :max="2.6" :step="0.1" size="small" />
            </div>
          </template>

          <div v-if="!showAvatar && !showPet" class="live-hint">该场景不显示主播形象</div>
        </div>

        <div class="live-card">
          <div class="live-card__title">语音</div>
          <div class="live-voice-row">
            <el-switch v-model="ttsEnabled" size="small" />
            <span class="live-hint">播报字幕</span>
            <span v-if="ttsSpeaking" class="live-voice-state">念话中</span>
          </div>
          <el-select
            v-if="voicePacks.length"
            v-model="voicePackId"
            size="small"
            class="live-select"
            placeholder="选择语音包"
          >
            <el-option v-for="p in voicePacks" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
          <div v-else class="live-hint">没有本地语音包，播报会走 Edge 在线合成（需联网）</div>
          <div v-if="ttsEngine" class="live-hint">当前引擎：{{ TTS_ENGINE_LABEL[ttsEngine] || '本地语音包' }}</div>
          <div v-if="ttsError" class="live-hint live-hint--err">{{ ttsError }}</div>
        </div>
      </aside>

      <aside class="live-panel live-panel--interact">
        <div class="live-card">
          <div class="live-card__title">动作</div>
          <div class="live-actions">
            <el-button
              v-for="a in LIVE_ACTIONS"
              :key="a.key"
              size="small"
              @click="playAction(a.key)"
            >{{ a.label }}</el-button>
          </div>
        </div>

        <div class="live-card">
          <div class="live-card__title">说话</div>
          <el-input
            v-model="speech"
            size="small"
            placeholder="输入一句，回车让宠物说"
            :disabled="!live"
            @keyup.enter="onSay"
          />
          <div class="live-hint">{{ live ? '正文优先级最高，会顶掉正在播的垫场话' : '开播后才能播报' }}</div>
        </div>

        <div class="live-card">
          <div class="live-card__title">弹幕</div>
          <el-input v-model="dmText" size="small" placeholder="模拟一条观众弹幕" @keyup.enter="onDanmaku" />
          <div class="live-actions">
            <el-button size="small" @click="onDanmaku">发弹幕</el-button>
            <el-button size="small" :disabled="!live || !dmText.trim()" @click="onReplyDanmaku">让它回应</el-button>
          </div>
          <div class="live-hint">提问会派到当前打开的会话，回答自动播报；没有打开的会话时不派发</div>
        </div>

        <div class="live-card live-card--note">
          录制会把当前舞台画面存成视频（能转 mp4 就转），落在系统的视频目录；
          推流实时推到平台，断流会自动重连（最多 5 次）。
        </div>
      </aside>
    </div>

    <el-dialog v-model="streamDialog" title="推流到直播平台" width="520px" append-to-body>
      <div class="live-dialog">
        <div class="live-dialog__label">推流地址（含推流码）</div>
        <el-input
          v-model="streamUrl"
          type="password"
          show-password
          placeholder="rtmp://push.example.com/live/xxxxxxxx"
          @keyup.enter="confirmStream"
        />
        <div class="live-hint">
          把平台后台给的「推流地址 + 推流码」整串粘进来。地址里带写入凭证，本机会加密保存。
        </div>
        <div v-if="streamError" class="live-dialog__err">{{ streamError }}</div>
      </div>
      <template #footer>
        <el-button @click="streamDialog = false">取消</el-button>
        <el-button type="primary" :loading="streamBusy" @click="confirmStream">开始推流</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 直播页（B0：宠物主体 + 场景画布 + 播报调度）
 *
 * 刻意只做"宠物主播"这一个场景：虚拟人还没接、窗口捕获还没做，
 * 先摆一排空壳场景只会让入口看起来能用其实不能用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Promotion, VideoCamera, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/client'
import PetPerformer from '../components/live/PetPerformer.vue'
import AvatarPerformer from '../components/live/AvatarPerformer.vue'
import DanmakuGame from '../components/live/DanmakuGame.vue'
import { PET_PACKS } from '../components/pet/pet-assets'
import { startStageRecording } from '../composables/live-recorder'
import { isRtmpUrl, maskRtmpUrl, startLiveStream, type LiveStreamHandle } from '../composables/live-stream'
import { useLiveTts } from '../composables/useLiveTts'
import { useLiveDanmaku, type IncomingDanmaku } from '../composables/useLiveDanmaku'
import { useLiveAsk } from '../composables/useLiveAsk'
import { useWindowCapture } from '../composables/useWindowCapture'
import { useGameFrames } from '../composables/useGameFrames'
import { narrateActivity, sameActivity } from '../composables/live-narrator'
import type { RegionRecorderHandle } from '../composables/region-recorder'
import { derivePetActivity, usePetStore, PET_BUILTIN_VRMS, type PetActivity } from '../stores/pet'
import { useChatStore } from '../stores/chat'
import {
  LIVE_SCENES,
  petStateOfPhase,
  sceneLabel,
  useLiveStore,
  type LiveScene,
} from '../stores/live'

const liveStore = useLiveStore()
const petStore = usePetStore()
petStore.init()
const chat = useChatStore()

const gameRef = ref<InstanceType<typeof DanmakuGame> | null>(null)
const sourceOn = ref(false)
function gameGift(id: string) { gameRef.value?.gift(id) }
function gameReset() { gameRef.value?.reset() }
function onGameSay(text: string) { liveStore.say(text, 'danmaku') }
async function toggleSource(v: boolean | string | number) {
  try {
    await api.post('/live/source', { kind: v ? 'replay' : 'off' })
  } catch {
    sourceOn.value = false
    ElMessage.error('弹幕源切换失败')
  }
}

const visible = ref(true)
const live = computed(() => liveStore.status === 'live')

const renderer = ref<'2d' | '3d'>(petStore.settings.renderer === '3d' ? '3d' : '2d')

/**
 * 场景 → 出哪些主播。
 * game-pip 复用窗口采集（选游戏/浏览器窗口），暂不做 CDP 帧流：
 * 帧流要绑定到 agent 正在操作的浏览器实例，属于下一步的低延迟优化。
 */
const PENDING_SCENES = new Set<LiveScene>()
const scenes = LIVE_SCENES.map((s) => ({ ...s, disabled: false, hint: '' }))
const pendingScenesHint = ''
const isCaptureScene = computed(
  () => liveStore.scene === 'task-live' || liveStore.scene === 'game-pip'
)
const showPet = computed(
  () => liveStore.scene === 'pet-full' || liveStore.scene === 'duo' || liveStore.scene === 'game-pip'
)
const showAvatar = computed(
  () => liveStore.scene === 'avatar-full' || liveStore.scene === 'duo' || liveStore.scene === 'task-live'
)

function pickScene(key: LiveScene): void {
  if (PENDING_SCENES.has(key)) return
  liveStore.setScene(key)
}
const pack = ref(petStore.settings.pack || 'boba')

/**
 * 直播用的 VRM 形象。刻意**不复用** petStore.settings.vrmBuiltin：
 * 那是宠物窗 3D 形象的偏好，两边同时改会互相打架；这里单独存一份。
 */
/** 播报引擎的展示名。写成映射表而不是模板三元：引擎值加了新枚举时这里只补一行 */
const TTS_ENGINE_LABEL: Record<string, string> = {
  edge: 'Edge 在线',
  system: '系统语音（离线）',
  local: '本地语音包',
}

const AVATAR_STORAGE_KEY = 'yz.live.avatar'
const avatarId = ref(
  (() => {
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY)
      if (saved && PET_BUILTIN_VRMS.some((v) => v.id === saved)) return saved
    } catch { /* 存储不可用时用默认 */ }
    return PET_BUILTIN_VRMS[0]?.id || 'shino'
  })()
)
watch(avatarId, (id) => {
  try { localStorage.setItem(AVATAR_STORAGE_KEY, id) } catch { /* 仅本窗口生效 */ }
})
const scale = ref(2.2)
const action = ref<string | null>(null)
let actionTimer = 0

const speech = ref('')
const dmText = ref('')

const stageEl = ref<HTMLElement | null>(null)
const recording = ref(false)
const recElapsed = ref('00:00')
let recHandle: RegionRecorderHandle | null = null
let recTimer = 0
let recStartedAt = 0

const streaming = ref(false)
const streamDialog = ref(false)
const streamBusy = ref(false)
const streamUrl = ref('')
const streamError = ref('')
const streamState = ref<'idle' | 'live' | 'error' | 'reconnecting'>('idle')
let streamHandle: LiveStreamHandle | null = null
let offStreamStatus: (() => void) | null = null
let stoppingStream = false

/** 断流重连：2s→4s→8s→15s，最多 5 次 */
const MAX_RECONNECT = 5
let reconnectTry = 0
let reconnectTimer = 0

function cancelReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = 0
  }
  reconnectTry = 0
}

async function scheduleReconnect(): Promise<void> {
  if (!streamHandle) return
  reconnectTry += 1
  if (reconnectTry > MAX_RECONNECT) {
    streamState.value = 'error'
    streaming.value = false
    ElMessage.error('推流重连失败，请手动重新开播')
    return
  }
  const delay = Math.min(15000, 2000 * 2 ** (reconnectTry - 1))
  streamState.value = 'reconnecting'
  ElMessage.warning(`推流中断，${Math.round(delay / 1000)} 秒后重连（${reconnectTry}/${MAX_RECONNECT}）`)
  reconnectTimer = window.setTimeout(async () => {
    reconnectTimer = 0
    const handle = streamHandle
    if (!handle) return
    try {
      await handle.reconnect()
      reconnectTry = 0
      streamState.value = 'live'
      ElMessage.success('推流已恢复')
    } catch {
      void scheduleReconnect()
    }
  }, delay)
}

const STREAM_KEY = 'live:rtmp:url'
const keyring = () => (window as any).electronAPI?.keyring

const {
  packs: voicePacks,
  packId: voicePackId,
  enabled: ttsEnabled,
  speaking: ttsSpeaking,
  error: ttsError,
  engine: ttsEngine,
  refresh: refreshVoices,
  speak: speakVoice,
  stop: stopVoice,
  dispose: disposeVoice,
} = useLiveTts()

const LIVE_ACTIONS = [
  { key: 'pet', label: '摸摸' },
  { key: 'wave', label: '招手' },
  { key: 'look', label: '张望' },
  { key: 'spin', label: '转圈' },
  { key: 'hop', label: '跳一跳' },
]

const performerName = computed(() => PET_PACKS.find((p) => p.id === pack.value)?.label || '宠物')

const petState = computed(() => (live.value ? petStateOfPhase(liveStore.phase) : 'idle'))

/** 虚拟人表情跟随直播阶段：回弹幕时思考、游戏中开心、其余中性 */
const avatarExpression = computed<'neutral' | 'thinking' | 'happy' | 'confused'>(() => {
  if (liveStore.phase === 'replying') return 'thinking'
  if (liveStore.phase === 'playing') return 'happy'
  return 'neutral'
})

const STATUS_TEXT: Record<string, string> = {
  offline: '未开播',
  starting: '启动中',
  live: '直播中',
  wrapping: '收尾中',
  ended: '已结束',
}
const PHASE_TEXT: Record<string, string> = {
  idle: '待机',
  talking: '播报中',
  playing: '游戏中',
  replying: '回弹幕',
}
const SOURCE_TEXT: Record<string, string> = {
  reply: '正文',
  danmaku: '弹幕回复',
  narration: '任务旁白',
  filler: '垫场',
}

const statusText = computed(() => STATUS_TEXT[liveStore.status] || liveStore.status)
const phaseText = computed(() => PHASE_TEXT[liveStore.phase] || liveStore.phase)
const sourceText = computed(() =>
  liveStore.captionSource ? SOURCE_TEXT[liveStore.captionSource] || liveStore.captionSource : '—'
)
const streamText = computed(() => {
  if (streamState.value === 'reconnecting') return `重连中 ${reconnectTry}/${MAX_RECONNECT}`
  if (streaming.value) return '推流中'
  if (streamState.value === 'error') return '异常'
  return '未推流'
})
const caption = computed(() => liveStore.caption)

/** 只播最后 6 条：更多会让动画层变成一堵墙 */
const flyingDanmaku = computed(() => liveStore.danmaku.slice(-6))

function onStart() {
  if (!liveStore.start()) return
  // 开播即进直播模式：服务端只放行只读白名单，观众输入不可信
  void setLiveMode(true)
  startDanmaku()
  liveStore.say(`大家好，我是${performerName.value}。今天想看点什么？`, 'filler')
}

async function setLiveMode(on: boolean): Promise<void> {
  try {
    await api.post('/live', { on })
  } catch {
    // 开关失败不阻断画面，但必须让操作者知道保护没生效
    if (on) ElMessage.warning('直播模式未能开启，工具权限未收敛')
  }
}

function onStop() {
  if (recHandle) void stopRecording()
  if (streamHandle) void stopStreaming(true)
  stopVoice()
  stopDanmaku()
  void setLiveMode(false)
  liveStore.stop()
  action.value = null
}

function playAction(key: string) {
  action.value = key
  clearTimeout(actionTimer)
  actionTimer = window.setTimeout(() => {
    action.value = null
  }, 1600)
}

/* ---------- 弹幕接入 ---------- */

const { ask: askAgent } = useLiveAsk({
  onReply: (reply) => {
    liveStore.say(reply, 'reply')
  },
})
const { start: startDanmaku, stop: stopDanmaku } = useLiveDanmaku({ onItem: handleDanmaku })

function handleDanmaku(item: IncomingDanmaku) {
  liveStore.pushDanmaku(item.text)
  // 弹幕游戏场景下，同一条弹幕直接驱动战局（1/2 选边，其余推进本方）
  if (liveStore.scene === 'danmaku-game') gameRef.value?.comment(item.text, item.from)
  // 只有白名单动作词会驱动宠物；注入类（kind=ignore）只展示
  if (item.kind === 'action' && item.action) {
    playAction(item.action)
    return
  }
  // 提问派到当前打开的会话；没有会话就不派（不凭空造会话）
  if (item.kind === 'question') {
    const convId = String(chat.currentConvId || '')
    if (convId) askAgent(item.text, convId)
  }
}

/* ---------- 任务实录：采集别的窗口 ---------- */

const {
  sources: captureSources,
  stream: captureStream,
  active: capturing,
  refresh: refreshSources,
  start: startCapture,
  stop: stopCapture,
} = useWindowCapture()
const captureSourceId = ref('')
const captureError = ref('')
const captureVideo = ref<HTMLVideoElement | null>(null)
const maskOn = ref(false)

/* ---------- 游戏画面第二种来源：CDP 帧流 ---------- */
const gameMode = ref<'window' | 'cdp'>('window')
const gameFrame = ref('')
const gameError = ref('')
const {
  active: gameCasting,
  start: startGameFrames,
  stop: stopGameFrames,
} = useGameFrames({
  onFrame: (url) => { gameFrame.value = url },
})

async function toggleGameFrames() {
  if (gameCasting.value) {
    stopGameFrames()
    return
  }
  gameError.value = ''
  try {
    await startGameFrames()
  } catch (e: any) {
    gameError.value = e?.message || String(e)
  }
}

const selectedSource = computed(
  () => captureSources.value.find((s) => s.id === captureSourceId.value) || null
)
const captureWarning = computed(() =>
  selectedSource.value && !selectedSource.value.safe
    ? '这个窗口不是直播工作区，画面里可能有会话列表、文件路径等隐私内容'
    : ''
)

function sourceLabel(s: { name: string; safe: boolean }): string {
  return `${s.name}${s.safe ? ' · 工作区' : ''}`
}

/** 一键开任务执行窗：这个窗口本身就是"干净布局"，采它不会带上会话列表 */
function openWorkspace(): void {
  const convId = String(chat.currentConvId || '')
  if (!convId) {
    ElMessage.warning('先在任务页打开一个会话')
    return
  }
  try {
    ;(window as any).electronAPI?.childWindow?.open?.({
      key: `live-task-${convId}`,
      route: `/task-window/${convId}`,
      width: 1280,
      height: 800,
      alwaysOnTop: false,
    })
    window.setTimeout(() => { void refreshSources() }, 900)
  } catch {
    ElMessage.warning('当前环境无法打开独立窗口')
  }
}

watch(
  () => liveStore.scene,
  (s) => {
    if (s === 'task-live' || s === 'game-pip') void refreshSources()
    // 离开游戏解说就停帧流：CDP 附加不该在别处继续耗着
    if (s !== 'game-pip') stopGameFrames()
  },
)

watch(captureStream, (s) => {
  if (captureVideo.value) captureVideo.value.srcObject = s
})

async function toggleCapture() {
  if (capturing.value) {
    stopCapture()
    return
  }
  if (!captureSourceId.value) {
    captureError.value = '先选一个窗口'
    return
  }
  captureError.value = ''
  try {
    const s = await startCapture(captureSourceId.value)
    if (captureVideo.value) captureVideo.value.srcObject = s
  } catch (e: any) {
    captureError.value = e?.message || String(e)
  }
}

function onSay() {
  if (liveStore.say(speech.value, 'reply')) speech.value = ''
}

function onDanmaku() {
  const text = dmText.value
  if (!liveStore.pushDanmaku(text)) return
  if (liveStore.scene === 'danmaku-game') gameRef.value?.comment(text, '手动观众')
  dmText.value = ''
}

function onReplyDanmaku() {
  const text = dmText.value.trim()
  if (!text) return
  if (liveStore.say(`这位观众说：${text}`, 'danmaku')) dmText.value = ''
}

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function stopTimer() {
  recording.value = false
  if (recTimer) {
    clearInterval(recTimer)
    recTimer = 0
  }
  recElapsed.value = '00:00'
}

async function toggleRecord() {
  if (recording.value) {
    await stopRecording()
    return
  }
  if (!live.value) {
    ElMessage.warning('先开播再录制')
    return
  }
  if (!stageEl.value) return
  try {
    recHandle = await startStageRecording({
      el: stageEl.value,
      fps: 20,
      maxMs: 10 * 60 * 1000,
      onAutoStop: (file) => {
        recHandle = null
        stopTimer()
        if (file) ElMessage.success(`已达 10 分钟上限，已保存：${file}`)
      },
    })
    recording.value = true
    recStartedAt = Date.now()
    recTimer = window.setInterval(() => {
      recElapsed.value = fmtElapsed(Date.now() - recStartedAt)
    }, 500)
    ElMessage.success('开始录制主播画面')
  } catch (e: any) {
    stopTimer()
    ElMessage.warning('录制未开始：' + (e?.message || e))
  }
}

async function stopRecording() {
  const handle = recHandle
  recHandle = null
  stopTimer()
  if (!handle) return
  try {
    const file = await handle.stop()
    if (file) ElMessage.success(`已保存：${file}`)
    else ElMessage.warning('录制已停止，但保存失败（检查视频目录权限 / ffmpeg）')
  } catch (e: any) {
    ElMessage.warning('录制收尾失败：' + (e?.message || e))
  }
}

onBeforeUnmount(() => {
  clearTimeout(actionTimer)
  visible.value = false
  if (recHandle) {
    const handle = recHandle
    recHandle = null
    void handle.stop()
  }
  if (streamHandle) void stopStreaming(true)
  disposeVoice()
  stopDanmaku()
  stopCapture()
  stopGameFrames()
  void setLiveMode(false)
  stopTimer()
})

/* ---------- 推流 ---------- */

async function loadStreamUrl() {
  try {
    const saved = await keyring()?.get?.(STREAM_KEY)
    if (typeof saved === 'string' && saved) streamUrl.value = saved
  } catch { /* 读不到就让用户重新填 */ }
}

function toggleStream() {
  if (streaming.value) {
    void stopStreaming()
    return
  }
  streamError.value = ''
  streamDialog.value = true
}

async function confirmStream() {
  const url = streamUrl.value.trim()
  if (!isRtmpUrl(url)) {
    streamError.value = '推流地址必须以 rtmp:// 或 rtmps:// 开头'
    return
  }
  if (!stageEl.value) return

  streamBusy.value = true
  streamError.value = ''
  cancelReconnect()
  try {
    await keyring()?.set?.(STREAM_KEY, url)
    streamHandle = await startLiveStream({ el: stageEl.value, rtmpUrl: url, fps: 20, bitrateKbps: 2500 })
    streaming.value = true
    streamState.value = 'live'
    streamDialog.value = false
    subscribeStreamStatus()
    ElMessage.success(`已开始推流：${maskRtmpUrl(url)}`)
  } catch (e: any) {
    streamError.value = e?.message || String(e)
    streamState.value = 'error'
  } finally {
    streamBusy.value = false
  }
}

function subscribeStreamStatus() {
  offStreamStatus?.()
  const onStatus = (window as any).electronAPI?.liveStream?.onStatus
  if (!onStatus) return
  offStreamStatus = onStatus((p: any) => {
    if (!p) return
    if (p.state === 'error') {
      streamState.value = 'error'
      ElMessage.warning('推流失败：' + (p.message || '未知原因'))
      void stopStreaming(true)
      return
    }
    if (p.state === 'stopped' && !stoppingStream) {
      // 非本端主动停止：多半是网络断开或平台踢流 —— 交给重连，不要直接判死
      void scheduleReconnect()
    }
  })
}

async function stopStreaming(silent = false) {
  cancelReconnect()
  const handle = streamHandle
  streamHandle = null
  if (!handle) {
    streaming.value = false
    streamState.value = silent ? streamState.value : 'idle'
    return
  }
  stoppingStream = true
  try {
    await handle.stop()
  } catch { /* 收尾失败不影响状态复位 */ }
  stoppingStream = false
  streaming.value = false
  streamState.value = 'idle'
  offStreamStatus?.()
  offStreamStatus = null
  if (!silent) ElMessage.success('已停止推流')
}

onMounted(() => {
  void loadStreamUrl()
  void refreshVoices()
})

// 任务旁白：只在消息条数变化时算一次（流式片段每帧扫全量消息代价太高）。
// 旁白走 narration 优先级 —— 正文在播时会被自动丢弃，不会打断回答。
const lastActivity = ref<PetActivity | null>(null)
watch(
  () => chat.currentMessages.length,
  () => {
    if (liveStore.status !== 'live') return
    const activity = derivePetActivity(chat.currentMessages)
    if (sameActivity(activity, lastActivity.value)) return
    lastActivity.value = activity
    const line = narrateActivity(activity)
    if (line) liveStore.say(line, 'narration')
  },
)

// 字幕上屏即播报：序号变化才触发（同一句话重复播报是靠 say() 内部自增）
watch(
  () => liveStore.captionSeq,
  () => {
    if (!liveStore.caption) return
    void speakVoice(liveStore.caption, {
      onEnd: () => {
        if (liveStore.phase === 'talking') liveStore.setPhase('idle')
      },
    })
  },
)
</script>

<style src="./live.css"></style>
