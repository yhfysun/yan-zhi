<template>
  <div class="rc-page" :class="{ immersive: immersive }">
    <!-- ============ 配对/设置阶段 ============ -->
    <div v-if="phase === 'setup' || phase === 'pending' || phase === 'ended'" class="rc-setup">
      <div class="rc-card">
        <div class="rc-brand-row">
          <div class="rc-brand">
            <span class="rc-logo">言智 · 远程控制</span>
            <span class="rc-sub">{{ setupTab === 'host' ? '本机作为被控端：扫码 / 地址即可连入' : '连接到局域网内运行言智的电脑' }}</span>
          </div>
          <button v-if="phase !== 'pending'" class="rc-close" title="关闭页面" @click="closeRemotePage">✕</button>
        </div>

        <template v-if="phase === 'setup'">
          <div class="rc-tabs">
            <button class="rc-tab" :class="{ active: setupTab === 'control' }" @click="setupTab = 'control'">控制电脑</button>
            <button class="rc-tab" :class="{ active: setupTab === 'host' }" @click="openHostTab">被连 · 本机</button>
            <button class="rc-tab" :class="{ active: setupTab === 'android' }" @click="openAndroidTab">安卓镜像</button>
          </div>

          <template v-if="setupTab === 'control'">
            <label class="rc-label">被控端地址</label>
            <select
              v-if="peers.length" :value="currentPeerHost" class="rc-input rc-peer-sel"
              title="已保存的被控端：选一个自动填好地址和授权码"
              @change="pickPeer"
            >
              <option value="">＋ 手动输入新地址</option>
              <option v-for="p in peers" :key="p.host" :value="p.host">{{ peerLabel(p) }}</option>
            </select>
            <input
              v-model="form.host" class="rc-input" placeholder="http://192.168.1.100:3001（也可粘贴被控端邀请链接）"
              spellcheck="false" @paste="onHostPaste" @change="adoptHostInput"
            />
            <label class="rc-label">授权码</label>
            <input
              v-model="form.code" class="rc-input rc-code" placeholder="被控端「设置 → 局域网」或插件页查看"
              spellcheck="false" autocomplete="off" @keyup.enter="pair" />
                    <button class="rc-btn rc-btn-primary" :disabled="pairing || !form.host.trim()" @click="pair">
              {{ pairing ? '配对中…' : '连接' }}
            </button>
            <button v-if="isTouch" class="rc-btn" :disabled="pairing" @click="startScan">📷 扫码连接</button>
            <div class="rc-hint">首次连接需要在被控端电脑上点击确认；可勾选「信任此设备」后免确认直连。</div>
            <div class="rc-hint">跨公网：这里填被控端的公网地址（端口需放行或走内网穿透），并在被控端插件设置开启「允许非内网配对」。</div>
          </template>

          <template v-else-if="setupTab === 'android'">
            <div v-if="androidLoading" class="rc-hint">正在检测设备…</div>
            <template v-else-if="androidDevices.length">
              <label class="rc-label">选择设备（USB / 无线调试）</label>
              <select v-model="androidPick" class="rc-input rc-peer-sel">
                <option v-for="d in androidDevices" :key="d.serial" :value="d.serial">
                  {{ d.model || d.serial }}{{ d.state === 'device' ? '' : '（未授权）' }}
                </option>
              </select>
              <button class="rc-btn rc-btn-primary" :disabled="!androidPick" @click="connectAndroid">开始镜像</button>
              <button class="rc-btn" :disabled="androidLoading" @click="loadAndroidDevices">刷新设备</button>
              <div class="rc-hint">画面直接嵌在本页：点按 = 点手机、拖动 = 滑动；返回 / Home / 最近任务在右侧「操作」抽屉里。</div>
            </template>
            <template v-else>
              <div class="rc-hint">没有检测到安卓设备。请用 USB 连接并打开「USB 调试」，或先在终端完成无线调试配对。</div>
              <button class="rc-btn" @click="loadAndroidDevices">重试</button>
            </template>
          </template>

          <template v-else>
            <div v-if="hostTabLoading" class="rc-hint">加载中…</div>
            <template v-else-if="hostPluginEnabled">
              <div class="rc-host-qr">
                <img v-if="hostQrUrl" :src="hostQrUrl" alt="控制端扫码连接二维码" />
                <div v-else class="rc-hint">—（未检测到局域网 IP）</div>
              </div>
              <div class="rc-host-line"><span class="rc-k2">授权码</span><code class="rc-host-code">{{ hostCode || '—' }}</code></div>
              <div v-if="hostIps.length > 1" class="rc-host-line">
                <span class="rc-k2">连接 IP</span>
                <select v-model="hostSelectedIp" class="rc-host-ipsel" title="手机用哪块网卡的 IP 连本机">
                  <option v-for="ip in hostIps" :key="ip.address" :value="ip.address">
                    {{ ip.address }}{{ ip.name ? ` · ${ip.name}` : '' }}{{ isVirtualNic(ip.name) ? '（虚拟网卡）' : '' }}
                  </option>
                </select>
              </div>
              <div class="rc-host-line"><span class="rc-k2">控制端地址</span><code class="rc-host-addr">{{ hostPreferredIp ? `http://${hostPreferredIp}:${hostPort}/remote` : '—' }}</code></div>
              <div class="rc-host-line"><span class="rc-k2">通道</span><span class="rc-host-mode">{{ hostMode === 'webrtc-capable' ? 'WebRTC 低延迟（本机界面已就绪）' : '待会话评估（连入时优先 WebRTC）' }}</span></div>
              <div v-if="hostPortRule !== null" class="rc-host-line">
                <span class="rc-k2">防火墙</span>
                <span class="rc-host-mode">{{ hostPortRule ? `已放行 TCP ${hostPort}` : `未放行 TCP ${hostPort}（其它设备连不进来）` }}</span>
                <button v-if="!hostPortRule" class="rc-btn" :disabled="hostPortBusy" @click="openLanPort">{{ hostPortBusy ? '处理中…' : '开放端口' }}</button>
              </div>
              <div class="rc-host-actions">
                <button class="rc-btn" @click="rotateHostCode">换一个码</button>
                <button class="rc-btn" @click="copyHostInvite">复制邀请</button>
                <button class="rc-btn" @click="router.push('/settings?pane=lan')">管理</button>
              </div>
              <div class="rc-hint">手机扫码或打开地址即可连接；新设备首次连接需在本机点击确认（可信任免确认）。急停：Ctrl+Alt+Esc。</div>
            </template>
            <template v-else>
              <div class="rc-hint">remote-control 插件未启用（或当前无权限读取）。被控端管理仅在本机桌面端可用。</div>
              <button class="rc-btn rc-btn-primary" @click="router.push('/plugins')">去插件管理启用</button>
            </template>
          </template>
        </template>

        <template v-else-if="phase === 'ended'">
          <div class="rc-end-reason">{{ endedReason || '会话已结束' }}</div>
          <button class="rc-btn" @click="resetToSetup">重新配对</button>
          <button class="rc-btn rc-btn-primary" @click="closeRemotePage">关闭页面</button>
        </template>

        <template v-else-if="phase === 'pending'">
          <div class="rc-waiting">
            <div class="rc-spinner"></div>
            <div class="rc-wait-title">正在等待被控端确认…</div>
            <div class="rc-wait-sub">请在电脑上查看「远程控制」确认弹窗，点击允许</div>
            <div v-if="confirmLeft > 0" class="rc-wait-sub">还有 {{ confirmLeft }} 秒未确认将自动取消</div>
          </div>
          <button class="rc-btn" @click="abortPair">取消</button>
        </template>
      </div>

      <!-- 扫码浮层：摄像头取景解码（jsQR），对准被控端设置页二维码即可直达连接 -->
      <div v-if="scanning" class="rc-scan" @click.self="stopScan">
        <div class="rc-scan-box">
          <video ref="scanVideoRef" class="rc-scan-video" autoplay playsinline muted></video>
          <div class="rc-scan-tip">对准被控端「设置 → 局域网」的二维码</div>
          <div v-if="scanError" class="rc-scan-err">{{ scanError }}</div>
          <button class="rc-btn" @click="stopScan">取消</button>
        </div>
      </div>
    </div>

    <!-- ============ 会话中 ============ -->
    <div
      v-show="phase === 'live'" ref="stageRef" class="rc-stage"
      @contextmenu.prevent
      @pointerdown="onStagePointerDown" @pointermove="onStagePointerMove" @pointerup="onStagePointerUp" @pointercancel="onStagePointerCancel"
      @wheel.prevent="onStageWheel"
      @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onFileDrop"
    >
      <!-- 安卓镜像：自研 scrcpy 客户端 + WebCodecs 解码，与电脑会话共用同一套会话壳 -->
      <AndroidMirrorStage
        v-if="linkKind === 'android' && phase === 'live'"
        ref="androidStageRef" :serial="androidSerial" :interactive="inputAllowed" @meta="onAndroidMeta"
      />

      <video
        v-show="linkKind !== 'android' && mode === 'webrtc'" ref="videoRef" class="rc-video" autoplay playsinline muted
        :style="mediaStyle" @loadedmetadata="syncNativeFromVideo" @resize="syncNativeFromVideo"
      ></video>
      <canvas v-show="linkKind !== 'android' && mode === 'jpeg'" ref="canvasRef" class="rc-video" :style="mediaStyle"></canvas>

      <!-- 首帧未到：明确告诉用户在建立画面，而不是留一块纯黑让人以为挂了 -->
      <div v-if="phase === 'live' && !hasFrame && linkKind !== 'android'" class="rc-wait-overlay">
        <div class="rc-spinner"></div>
        <div class="rc-wait-title">正在建立画面…</div>
        <div class="rc-wait-sub">{{ mode === 'webrtc' ? 'WebRTC 协商中，12 秒未出画面会自动切兼容模式' : '兼容模式正在启动采集，首帧通常需要几秒' }}</div>
      </div>

      <!-- 流到了但 video 被自动播放策略暂停：WebView 会给暂停的视频画一个系统播放图标
           盖在画面上（2026-10-28 实报：状态栏显示已连接、解码有首帧，画面被巨大播放图标
           覆盖）。手势触发的 play 必然放行 —— 这是保底出口，一键可解。 -->
      <div
        v-if="phase === 'live' && mode === 'webrtc' && hasFrame && !isPlaying && linkKind !== 'android'"
        class="rc-play-overlay"
        @pointerdown.stop.prevent="manualPlay"
      >
        <div class="rc-play-btn">▶</div>
        <div class="rc-wait-sub">点一下开始播放画面</div>
      </div>

      <!-- 坐标未就绪：画面能看但点不动。必须明说，否则用户只会以为远控坏了 -->
      <div
        v-if="phase === 'live' && hasFrame && screen.w <= 0 && linkKind !== 'android'"
        class="rc-geo-overlay"
      >
        <div class="rc-spinner"></div>
        <span>正在同步屏幕坐标…</span>
        <span class="rc-geo-sub">此时点击不会生效，已自动重试</span>
      </div>

      <!-- 只读观看：常驻可见 + 一键请求操控（不让用户自己猜「点不动是不是卡了」） -->
      <div v-if="phase === 'live' && !inputAllowed" class="rc-readonly" @pointerdown.stop>
        <span class="rc-ro-dot"></span>
        <div class="rc-ro-text">
          <b>只读观看</b>
          <span>{{ inputGranted ? '你已切换到仅观看' : '被控端未授予操作权限' }}</span>
        </div>
        <button :disabled="inputRequesting" @click="inputGranted ? toggleViewOnly() : requestInput()">
          {{ inputRequesting ? '等待确认…' : inputGranted ? '恢复操控' : '请求操控' }}
        </button>
      </div>

      <!-- 自绘光标已删（2026-10-27 横屏重构）：仿真鼠标左上角的箭头就是唯一光标，不再有第二个 -->
      <div v-if="fx.visible" class="rc-tap-fx" :class="fx.button" :style="fxStyle"></div>

      <!-- 顶部状态胶囊（桌面非全屏显示；手机沉浸态藏起，入口全在悬浮球菜单） -->
      <div class="rc-topbar" :class="{ hidden: hudHidden }" @pointerdown.stop>
        <button class="rc-topback" title="断开连接" @click="disconnect">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="rc-dot" :class="mode"></span>
        <span class="rc-status">{{ statusText }}</span>
        <select
          v-if="displays.length > 1" v-model="currentDisplay"
          class="rc-select rc-select-disp" title="采集显示器" @change="selectDisplay(currentDisplay)"
        >
          <option v-for="(d, i) in displays" :key="d.id" :value="d.id">{{ displayShortLabel(d, i) }}</option>
        </select>
        <select v-if="mode === 'jpeg'" v-model="qualityPreset" class="rc-select" title="画质" @change="applyQuality">
          <option value="smooth">流畅</option>
          <option value="balance">均衡</option>
          <option value="sharp">清晰</option>
        </select>
        <button class="rc-topback" title="操作面板" @click="actionsOpen = !actionsOpen">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <button class="rc-topback" :title="immersive ? '退出全屏（Esc）' : '全屏 / 最大化'" @click="toggleFullscreen">
          <svg v-if="!immersive" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"/></svg>
          <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h5V4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>
        </button>
      </div>

      <!-- 右侧栏已删除（2026-10-27 横屏重构）：入口全部收进悬浮球菜单 -->

      <!-- 操作面板（底部抽屉）：低频功能都在这里 -->
      <div v-if="actionsOpen" class="rc-sheet" :class="{ touch: isTouch }" @pointerdown.stop @click.stop>
        <div class="rc-sheet-head">
          <span>操作</span>
          <button class="rc-panel-x" @click="actionsOpen = false">✕</button>
        </div>
        <div class="rc-sheet-grid">
          <button v-if="linkKind !== 'android'" class="rc-act" @click="doAction(rightClickAtLast)">
            <b>🖱</b><span>右键单击</span>
          </button>
          <button class="rc-act" @click="doAction(toggleViewOnly)">
            <b>👁</b><span>{{ viewOnlySelf ? '退出仅观看' : '仅观看' }}</span>
          </button>
          <button class="rc-act" @click="doAction(openClipboardPanel)">
            <b>📋</b><span>剪贴板</span>
          </button>
          <button class="rc-act" @click="doAction(openFilePanel)">
            <b>🗂</b><span>文件传输</span>
          </button>
          <button class="rc-act" @click="doAction(toggleAudio)">
            <b>{{ audioOn ? '🔊' : '🔇' }}</b><span>声音{{ audioOn ? '开' : '关' }}</span>
          </button>
          <button class="rc-act" @click="doAction(toggleZoom)">
            <b>⛶</b><span>{{ zoomLabel }}</span>
          </button>
          <button class="rc-act" @click="doAction(toggleFullscreen)">
            <b>🖥</b><span>{{ immersive ? '退出全屏' : '全屏' }}</span>
          </button>
          <!-- 兼容模式掉下来后唯一能自愈的入口：被控端采集层在场就原地升回 WebRTC -->
          <button v-if="linkKind !== 'android' && mode === 'jpeg'" class="rc-act" @click="doAction(retryWebRtc)">
            <b>⚡</b><span>重试 WebRTC</span>
          </button>
          <button class="rc-act" @click="doAction(openDiag)">
            <b>🩺</b><span>诊断</span>
          </button>
          <button class="rc-act danger" @click="doAction(disconnect)">
            <b>✕</b><span>断开</span>
          </button>
        </div>
        <div v-if="phase === 'live' && linkKind !== 'android'" class="rc-sheet-row">
          <span class="rc-sheet-label">显示器</span>
          <button
            v-for="(d, i) in displays" :key="d.id" class="rc-chip"
            :class="{ active: currentDisplay === d.id }" @click="selectDisplay(d.id)"
          >{{ displayShortLabel(d, i) }}</button>
          <button class="rc-chip" @click="requestDisplays" title="重新枚举被控端显示器">刷新</button>
        </div>
        <div v-if="linkKind === 'android'" class="rc-sheet-row">
          <span class="rc-sheet-label">手机按键</span>
          <button class="rc-chip" @click="androidKey(4)">返回</button>
          <button class="rc-chip" @click="androidKey(3)">Home</button>
          <button class="rc-chip" @click="androidKey(187)">最近任务</button>
          <button class="rc-chip" @click="androidKey(24)">音量+</button>
          <button class="rc-chip" @click="androidKey(25)">音量-</button>
        </div>
        <div v-if="mode === 'jpeg' && linkKind !== 'android'" class="rc-sheet-row">
          <span class="rc-sheet-label">画质</span>
          <button
            v-for="q in QUALITY_OPTIONS" :key="q.value" class="rc-chip"
            :class="{ active: qualityPreset === q.value }" @click="qualityPreset = q.value"
          >{{ q.label }}</button>
        </div>
      </div>

      <!-- ===== 指针箭头：画在真实注入坐标处（2026-10-31 对标 UU） =====
           箭头尖 = 热点 = 注入坐标。它和下面的控制器是**两个**元素：
           控制器独立悬浮，不再压在指针周围，所以指针能走到任何一个角落（含最底部任务栏）。 -->
      <div v-if="linkKind !== 'android' && mouseVisible" class="rc-pointer" :style="vmouseStyle">
        <svg width="20" height="26" viewBox="0 0 18 24"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.5 L10 13 L16 13 Z" fill="#fff" stroke="#111" stroke-width="1.2"/></svg>
      </div>

      <!-- ===== 仿真鼠标控制器（UU 口径）：独立悬浮在右侧中部 =====
           拖它 = 移动指针（相对位移，跟手且与缩放无关）；单击 = 左键；长按 = 右键；
           中滚轮上下拖 = 滚动。控制器本身不跟着指针跑，所以永远不会挡住要点的东西。 -->
      <div
        v-if="linkKind !== 'android' && mouseVisible" ref="vmouseRef" class="rc-vmctrl"
        :class="{ dim: ctrlDimmed, press: vmPress !== '' }"
        @pointerdown.stop="onCtrlPointerDown" @pointermove.stop="onCtrlPointerMove"
        @pointerup.stop="onCtrlPointerUp" @pointercancel.stop="onCtrlPointerUp"
        @contextmenu.prevent
      >
        <svg class="rc-vm-icon" viewBox="0 0 24 34" aria-hidden="true">
          <rect x="2" y="1" width="20" height="32" rx="10" fill="rgba(255,255,255,0.92)" stroke="rgba(17,24,34,0.55)" stroke-width="1.6" />
          <line x1="12" y1="2.5" x2="12" y2="13" stroke="rgba(17,24,34,0.45)" stroke-width="1.4" />
          <rect x="10.6" y="5" width="2.8" height="5.4" rx="1.4" fill="rgba(17,24,34,0.55)" />
        </svg>
        <div
          class="rc-vm-wheel" :class="{ active: vmWheelActive }" title="上下拖动滚动"
          @pointerdown.stop="onVmWheelDown" @pointermove.stop="onVmWheelMove"
          @pointerup.stop="onVmWheelUp" @pointercancel.stop="onVmWheelUp"
        ><i></i></div>
        <span class="rc-vm-hint">拖 · 点 · 长按</span>
      </div>

      <!-- ===== 侧栏工具栏（仅触屏控制端，2026-10-31 对标 UU） =====
           悬浮球与独立浮按钮全部删掉：入口固定贴在右侧，图标 + 小字，不挡画面正中；
           桌面端没有这条栏 —— 顶栏的「操作 / 全屏」两个按钮就够用。 -->
      <div v-if="phase === 'live' && isTouch" class="rc-sidebar" @pointerdown.stop @click.stop>
        <button class="rc-sbtn" @click="actionsOpen = true">
          <span class="rc-sbtn-ic">☰</span><span class="rc-sbtn-lb">操作</span>
        </button>
        <button class="rc-sbtn" :class="{ on: mouseVisible }" @click="toggleMouseMode">
          <span class="rc-sbtn-ic">🖱</span><span class="rc-sbtn-lb">鼠标</span>
        </button>
        <button v-if="linkKind !== 'android'" class="rc-sbtn" :class="{ on: kbDirect }" @click="openKeyboardPanel">
          <span class="rc-sbtn-ic">⌨</span><span class="rc-sbtn-lb">键盘</span>
        </button>
        <button class="rc-sbtn" :class="{ on: immersive }" @click="toggleFullscreen">
          <span class="rc-sbtn-ic">⛶</span><span class="rc-sbtn-lb">{{ immersive ? '退出' : '全屏' }}</span>
        </button>
        <button class="rc-sbtn danger" @click="disconnect">
          <span class="rc-sbtn-ic">⏻</span><span class="rc-sbtn-lb">断开</span>
        </button>
      </div>

      <!-- ===== 直通键盘：隐藏 input 唤系统输入法，打字逐字注入电脑光标处 =====
           无任何自绘输入框/面板；打完字自动失焦收起键盘。 -->
      <input
        v-if="kbDirect" ref="kbInputRef" class="rc-kb-input" type="text" autocomplete="off"
        autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send"
        @input="onKbInput" @keydown="onKbKeydown" @blur="kbDirect = false"
        @compositionstart="kbComposing = true" @compositionend="onKbCompositionEnd"
      />

      <!-- 剪贴板面板（纯文本；全屏下 Ctrl+V 直通注入 = 用被控端剪贴板粘贴） -->
      <div v-if="clipPanelOpen" class="rc-panel" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">剪贴板互通<button class="rc-panel-x" @click="clipPanelOpen = false">✕</button></div>
        <textarea v-model="clipText" class="rc-panel-text" rows="4" placeholder="把要发送的内容粘贴到这里；「取远端」会把被控端剪贴板填进来"></textarea>
        <div class="rc-panel-actions">
          <button class="rc-btn rc-btn-primary" :disabled="!clipText.trim() || clipBusy" @click="sendClipboard">发送到被控端</button>
          <button class="rc-btn" :disabled="clipBusy" @click="pullClipboard">取被控端剪贴板</button>
          <span v-if="clipBusy" class="rc-busy">…</span>
        </div>
        <div class="rc-hint">全屏下直接 Ctrl+V 会把按键注入被控端（粘贴其本地剪贴板）。</div>
      </div>

      <!-- 文件面板（发送 → 被控端接收目录；列表/下载 ← 接收目录） -->
      <div v-if="filePanelOpen" class="rc-panel rc-panel-wide" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">文件传输<button class="rc-panel-x" @click="filePanelOpen = false">✕</button></div>
        <div
          class="rc-file-drop" :class="{ over: fileDrag }"
          @dragover.prevent="fileDrag = true" @dragleave.prevent="fileDrag = false" @drop.prevent="onPanelFileDrop"
          @click="fileInputRef?.click()"
        >拖文件到这里发送，或点击选择（≤500MB/个）</div>
        <input ref="fileInputRef" type="file" multiple style="display: none" @change="onFilePick" />
        <div class="rc-file-list">
          <div v-if="files.length === 0 && !fileBusy" class="rc-file-empty">接收目录暂无文件</div>
          <div v-for="f in files" :key="f.name" class="rc-file-item">
            <span class="rc-file-name" :title="f.name">{{ f.name }}</span>
            <span class="rc-file-size">{{ fmtSize(f.size) }}</span>
            <button class="rc-tbtn" @click="downloadFile(f.name)">下载</button>
          </div>
        </div>
        <div v-if="fileBusy" class="rc-hint">传输中，请稍候…</div>
      </div>

      <!-- 输入链路诊断：坐标/尺寸/权限一眼看全，坏了能自己判断断在哪一段 -->
      <div v-if="diagOpen" class="rc-panel rc-panel-wide" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">输入链路诊断<button class="rc-panel-x" @click="diagOpen = false">✕</button></div>
        <div class="rc-diag">
          <div class="rc-diag-row"><span>连接 / 模式</span><b>{{ linkKind }} · {{ mode }}</b></div>
          <div class="rc-diag-row"><span>远端屏幕</span><b>{{ screen.w }}×{{ screen.h }} @ {{ screen.x }},{{ screen.y }}</b></div>
          <div class="rc-diag-row"><span>几何来源</span><b>{{ screenSource || '未拿到' }}</b></div>
          <div class="rc-diag-row"><span>显示矩形</span><b>{{ Math.round(displayedRect.w) }}×{{ Math.round(displayedRect.h) }} @ {{ Math.round(displayedRect.x) }},{{ Math.round(displayedRect.y) }}</b></div>
          <div class="rc-diag-row"><span>视口</span><b>{{ viewport.w }}×{{ viewport.h }}</b></div>
          <div class="rc-diag-row"><span>可操控</span><b>{{ inputAllowed ? '是' : (inputGranted ? '否 · 本地仅观看' : '否 · 被控端未授权') }}</b></div>
          <div class="rc-diag-row"><span>最后输入</span><b>{{ lastInput || '—' }}</b></div>
          <div class="rc-diag-row"><span>最后回执</span><b>{{ lastInputError || '正常' }}</b></div>
        </div>
        <div class="rc-panel-actions">
          <button class="rc-btn rc-btn-primary" @click="send({ type: 'screen.request' })">重新同步坐标</button>
        </div>
      </div>

      <!-- 拖拽投递遮罩 -->
      <div v-if="dragOver" class="rc-drop-hint">松开发送到被控端「言智远控」目录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 远程控制 · 控制端页（/remote，bare+guest 路由）。
 *
 * 通道：配对（授权码/设备令牌）→ WS（信令 + 输入 + JPEG 回退帧）→ WebRTC 视频主通道。
 * 沉浸模式：Fullscreen + 隐藏全部 UI，仅剩可拖动悬浮球（点按呼出 / 3s 自动隐藏）——
 * 「放大后跟直接操作电脑一样」的落点在本页。
 * P1：音频转发开关 / 剪贴板互通 / 文件收发 / 适应窗口与 1:1 缩放（捏合缩放+平移）/
 *     JPEG 模式远端光标自绘 / 多显示器切换（displays.info + display.select，悬浮球/顶栏）。
 *
 * ★ 坐标映射（自算显示矩形）：视频/画布按「contain」几何手工定位（object-fit:fill +
 *   显式 left/top/width/height），toScreen 全程用 displayedRect 换算 —— 不依赖
 *   getBoundingClientRect 与 object-fit 的组合行为，缩放/平移/黑边下都精确。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CSSProperties } from 'vue';
import { ElMessage } from 'element-plus';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { parseRcScanPayload, normalizeHostInput } from '../utils/rcScan';
import { describeConnectError } from '../utils/rcError';
import { RemoteGestureRecognizer, type RemoteGestureEvent } from '../utils/remote-gesture';
import { parseNetworkIpResponse, sortLanIps, pickDefaultLanIp, isVirtualNic, type LanIp } from '../utils/lanIp';
import {
  RC_PEERS_KEY, RC_LAST_HOST_KEY, normalizeRcHost, parseRcPeers, upsertRcPeer, peerLabel, type RcPeer,
} from '../utils/rcPeers';
import { api, API_BASE, buildRequestHeaders } from '../api/client';
import { useSettingsStore } from '../stores/settings';
import AndroidMirrorStage from '../components/AndroidMirrorStage.vue';

type Phase = 'setup' | 'pending' | 'live' | 'ended';
interface ScreenRect { x: number; y: number; w: number; h: number }
interface FileEntry { name: string; size: number; mtime: number }
/** 被控端显示器（displays.info；坐标为虚拟屏物理像素，与注入坐标同系） */
interface RcDisplayInfo { id: string; label: string; primary: boolean; x: number; y: number; w: number; h: number }
/** ICE 服务器（跨公网打洞/中继；结构同 RTCIceServer） */
interface RcIceServer { urls: string[]; username?: string; credential?: string }

const RC_FILE_MAX = 500 * 1024 * 1024;
/** 配对请求超时：地址不通时 fetch 会挂到系统 TCP 超时（几分钟），必须自己掐断 */
const PAIR_TIMEOUT_MS = 10_000;
/** 等待被控端点确认的上限：必须**大于**被控端确认弹窗的存活时间（90s），
 *  否则用户看到弹窗再点「允许」时控制端已经放弃 —— 实报「我授权了对方还是没反应，
 *  过一会又说超时没确认」。服务端 pending 留 120s，足够覆盖本窗口。 */
const CONFIRM_TIMEOUT_MS = 95_000;
/** 单次 WS 连接上限：连不上不能一直挂在 CONNECTING（那样心跳永远不再重试） */
const WS_CONNECT_TIMEOUT_MS = 8_000;
/** 悬浮球空闲变暗间隔（ms）：与原型一致 4s */
const BALL_DIM_MS = 4000;

const phase = ref<Phase>('setup');
const pairing = ref(false);
const endedReason = ref('');
const mode = ref<'' | 'webrtc' | 'jpeg'>('');
/** 是否已收到第一帧（两种通道都算）：用来把「还在连接」和「黑屏故障」区分开 */
const hasFrame = ref(false);
const screen = ref<ScreenRect>({ x: 0, y: 0, w: 0, h: 0 });
const immersive = ref(false);
const kbInputRef = ref<HTMLInputElement>();
/**
 * 直通键盘开启中：隐藏 input 持焦点唤系统输入法，打字逐字注入电脑光标处。
 */
const kbDirect = ref(false);
/** 中文输入法组字中：拼音阶段不发，组字完成后由 compositionend 整串发 */
const kbComposing = ref(false);
const clipPanelOpen = ref(false);
const clipText = ref('');
const clipBusy = ref(false);
const filePanelOpen = ref(false);
const fileDrag = ref(false);
const fileBusy = ref(false);
const files = ref<FileEntry[]>([]);
const audioOn = ref(false);
const dragOver = ref(false);
const qualityPreset = ref<'smooth' | 'balance' | 'sharp'>('balance');
const displays = ref<RcDisplayInfo[]>([]);
/**
 * 本条会话是否授予输入（false = 只读观看）。
 *
 * 来源只有服务端：session.granted / session.resume / session.input。
 * 客户端不自己猜「点不动是不是卡了」—— 只读时底部常驻一条可恢复的提示，
 * 点「请求操控」由被控端本人在场确认（照 UU 观看模式的口径，不重连）。
 */
/**
 * 输入权限两档（与 UU 口径一致）：
 *  - `inputGranted`：被控端是否授予输入（确认弹窗里选「仅观看」时为 false，控制端不能自行越过）；
 *  - `viewOnlySelf`：控制端自己在 [操作]-[仅观看] 里开的一档（纯本地偏好，随时自己退出）。
 * 生效权限 = 两者与。只读时底部常驻一条提示，不做成"点不动也没解释"。
 */
const inputGranted = ref(true);
const viewOnlySelf = ref(false);
const inputAllowed = computed(() => inputGranted.value && !viewOnlySelf.value);
/** 已发出请求、等被控端确认（按钮置灰，避免连点） */
const inputRequesting = ref(false);


const currentDisplay = ref('');
const iceServers = ref<RcIceServer[]>([]);

// ---- 缩放几何 ----
const viewport = reactive({ w: 0, h: 0 });
const native = reactive({ w: 0, h: 0 });
const zoomMode = ref<'fit' | 'fill' | 'free'>('fill');
/** 用户手动调过缩放：之后的自动选档不再覆盖他的选择 */
let zoomTouchedByUser = false;
/**
 * 按「画面比例 vs 视口比例」自动选铺满/适应。
 *
 * 默认铺满（cover）在宽屏看宽屏时最爽，但切到 1280×1024 这类偏方的小屏、或竖屏手机看
 * 横屏桌面时，铺满会把画面裁掉一圈 —— 表现就是「小屏没居中、两边看不到」。
 * 比例差得多就自动用适应（contain）：整屏可见且居中。用户手动缩放后不再干预。
 */
function autoFitZoom(): void {
  if (zoomTouchedByUser) return;
  if (!native.w || !native.h || !viewport.w || !viewport.h) return;
  const srcRatio = native.w / native.h;
  const viewportRatio = viewport.w / viewport.h;
  const want: 'fit' | 'fill' = Math.abs(Math.log(srcRatio / viewportRatio)) > 0.25 ? 'fit' : 'fill';
  if (zoomMode.value === want) return;
  zoomMode.value = want;
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
}
/**
 * 仿真鼠标显隐（旧 mouseMode 语义并入：显示 = 指针模式）。
 * 触屏默认显示（UU 口径：手指不挡目标）；桌面端默认隐藏。
 */
const mouseVisible = ref(false);
const mousePos = reactive({ x: 0, y: 0 });
const actionsOpen = ref(false);
/** 诊断面板：几何 / 权限 / 最后一条输入与回执 */
const diagOpen = ref(false);
const lastInput = ref('');
const lastInputError = ref('');
/** 点按反馈（显示坐标）：单击 / 右键时给一个短暂光圈 */
const fx = reactive({ visible: false, x: 0, y: 0, button: 'left' as 'left' | 'right' });
const QUALITY_OPTIONS = [
  { value: 'smooth' as const, label: '流畅' },
  { value: 'balance' as const, label: '均衡' },
  { value: 'sharp' as const, label: '清晰' },
];
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });

const vmouseRef = ref<HTMLElement>();
/** 按压反馈：left / right / 无（控制器高亮用） */
const vmPress = ref<'' | 'left' | 'right'>('');
const vmWheelActive = ref(false);
let vmWheelLastY = 0;
/** 控制器 4s 无操作变暗 */
const ctrlDimmed = ref(false);
let ctrlDimTimer: number | null = null;

const statusText = computed(() => {
  if (linkKind.value === 'android') {
    const ro = inputAllowed.value ? '' : '只读观看 · ';
    return `${ro}安卓镜像 · ${androidName.value || '已连接'}`;
  }
  const ro = inputAllowed.value ? '' : '只读观看 · ';
  if (mode.value === 'webrtc') return ro + (zoomMode.value === 'free' ? `WebRTC · ${Math.round(zoom.value * 100)}%` : 'WebRTC 已连接');
  if (mode.value === 'jpeg') return ro + (zoomMode.value === 'free' ? `兼容模式 · ${Math.round(zoom.value * 100)}%` : '兼容模式已连接');
  return '连接中…';
});
/**
 * 顶栏可见性：
 *  - 触屏全屏：直接藏（入口在悬浮球）；
 *  - 桌面全屏：无球可用，顶栏自动隐藏、鼠标移到顶部再浮出 —— 否则想退出全屏时找不到按钮。
 */
const hudIdleHidden = ref(false);
const hudHidden = computed(() => (isTouch ? immersive.value : immersive.value && hudIdleHidden.value));
let hudIdleTimer: number | null = null;
/** 重新开始顶栏空闲倒计时（桌面全屏专用） */
function restartHudIdle(): void {
  if (hudIdleTimer) {
    window.clearTimeout(hudIdleTimer);
    hudIdleTimer = null;
  }
  hudIdleHidden.value = false;
  if (!immersive.value || isTouch) return;
  hudIdleTimer = window.setTimeout(() => { hudIdleHidden.value = true; }, 2600);
}
function onHudPointerMove(e: PointerEvent): void {
  if (!immersive.value || isTouch) return;
  if (e.clientY <= 72 && hudIdleHidden.value) restartHudIdle();
}
/** 缩放档位文案：按钮显示「切过去会变成什么」（fit→适应、fill→1:1、free→铺满） */
const zoomLabel = computed(() => {
  if (zoomMode.value === 'fit') return '适应';
  if (zoomMode.value === 'fill') return '铺满';
  return `${Math.round(zoom.value * 100)}%`;
});

/**
 * 上次连过的被控端：手机 App 里 window.location.origin 是壳的 localhost，毫无意义，
 * 不记住的话每次都要手输一遍 IP。
 *
 * 2026-10-26 起升级成「已保存的被控端」清单（地址 + 授权码成对）：
 *   用户要求「授权码也要记录啊，还有多个能下拉选择」—— 只记地址、每次重敲码不够用，
 *   几台常用机器也切不了。清单口径见 utils/rcPeers.ts，这里只管读写与联动。
 */
const peers = ref<RcPeer[]>([]);
const form = reactive({ host: window.location.origin, code: '' });
/** 当前地址命中的已保存项（下拉高亮用；手敲别的地址时为 '' ） */
const currentPeerHost = computed(() => {
  const key = normalizeRcHost(form.host).toLowerCase();
  return peers.value.find((p) => normalizeRcHost(p.host).toLowerCase() === key)?.host || '';
});

function readPeers(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(RC_PEERS_KEY) || 'null');
    peers.value = parseRcPeers(raw, localStorage.getItem(RC_LAST_HOST_KEY) || '');
  } catch {
    peers.value = [];
  }
}
function writePeers(): void {
  try {
    localStorage.setItem(RC_PEERS_KEY, JSON.stringify(peers.value));
  } catch { /* 隐私模式忽略 */ }
}
/** 记住一次成功的连接：地址 + 授权码成对存，最近用的提到最前 */
function rememberPeer(host: string): void {
  peers.value = upsertRcPeer(peers.value, host, form.code, Date.now());
  writePeers();
}
/** 下拉选中：自动填地址和授权码（码值不展示在下拉里，选中的时候才填进来） */
function pickPeer(e: Event): void {
  const host = (e.target as HTMLSelectElement).value;
  const p = peers.value.find((x) => x.host === host);
  if (!p) return;
  form.host = p.host;
  if (p.code) form.code = p.code;
}
const route = useRoute();
const router = useRouter();
// setup 阶段三页签：控制电脑 / 被连·本机（二维码+授权码）/ 安卓镜像（本机直连手机）
const setupTab = ref<'control' | 'host' | 'android'>('control');
/**
 * 会话来源：desktop = 走配对/WebRTC 的电脑会话；android = 本机直连手机的镜像会话。
 * 两者共用同一套会话壳（顶栏/侧栏/操作抽屉/只读条），只是数据面不同。
 */
const linkKind = ref<'desktop' | 'android'>('desktop');
const androidSerial = ref('');
const androidName = ref('');
const androidPick = ref('');
const androidDevices = ref<Array<{ serial: string; model?: string; state: string }>>([]);
const androidLoading = ref(false);
const androidStageRef = ref<{ key: (code: number) => void; text: (value: string) => void }>();

/**
 * 触屏专属 UI（扫码 / 仿真鼠标 / 悬浮球）的判定口径：**只认粗粒度指针**。
 * 不能看 navigator.maxTouchPoints —— 带触摸屏的 Windows 笔记本也有触摸点，
 * 会被误判成手机，控制端就冒出仿真鼠标和悬浮球（实报：「电脑端不用显示这些」）。
 */
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
// 触屏默认显示仿真鼠标（UU 同款）：手指不挡目标、点按不飘；画面直接触控始终可用
if (isTouch) mouseVisible.value = true;
const stageRef = ref<HTMLElement>();
const videoRef = ref<HTMLVideoElement>();
const canvasRef = ref<HTMLCanvasElement>();
const fileInputRef = ref<HTMLInputElement>();

let ws: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let remoteStream: MediaStream | null = null;
/** 接收侧统计回传定时器（teardown 必须清，否则断开后仍在空转发消息） */
let recvStatsTimer: number | null = null;
/** video 是否真的在播：paused 时 WebView 会画系统播放图标盖住画面 */
const isPlaying = ref(false);
/** 自动播放重试定时器（teardown 必须清） */
const retryTimers: number[] = [];
/** 手势兜底：点按钮 → play()（带手势的 play 必然放行） */
function manualPlay(): void {
  isPlaying.value = true;
  videoRef.value?.play().then(() => {
    isPlaying.value = true;
  }).catch(() => {
    isPlaying.value = false;
  });
}
let sessionToken = '';
let sessionId = '';
let base = window.location.origin;
let webrtcWatchdog: number | null = null;
let pingTimer: number | null = null;
/** 本次 WS 的连接超时定时器（连不上就主动关掉，让心跳下一拍重连） */
let wsConnectTimer: number | null = null;
let jpegBitmap: ImageBitmap | null = null;
/** 待确认倒计时（秒）：pending 面板展示，0 = 未在等待 */
const confirmLeft = ref(0);
let confirmTimer = 0;
let confirmDeadline = 0;
/** 本轮待确认的 confirmId：通道没建起来时凭它重连，服务端据此补发 pending/granted */
let pendingConfirmId = '';
/** 正在为 pending 重建通道：这段时间的 onclose 不当成「连接失败」报错 */
let pendingRecovering = false;
/** 本次 WebSocket 是否真的连上过：区分「连不上」与「连上后断了」 */
let wsOpened = false;

// ---- 设备身份（每个被控端一套 deviceId/deviceToken，存 localStorage）----
const identityKey = (b: string) => `rc:identity:${b}`;
/**
 * 生成设备号：**不能**直接用 crypto.randomUUID —— 它只在安全上下文（HTTPS / localhost）
 * 存在，而邀请链接给的就是 `http://192.168.x.x:3001/remote`，浏览器里 randomUUID 是
 * undefined，调用即抛异常 → 配对第一步就挂，表现就是「打开链接根本连不上」。
 */
function newDeviceId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); // getRandomValues 在不安全上下文里也能用
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function loadIdentity(b: string): { deviceId: string; deviceToken?: string } {
  try {
    const raw = localStorage.getItem(identityKey(b));
    if (raw) return JSON.parse(raw);
  } catch { /* 损坏则重建 */ }
  const id = newDeviceId();
  localStorage.setItem(identityKey(b), JSON.stringify({ deviceId: id }));
  return { deviceId: id };
}
function saveIdentity(b: string, token?: string): void {
  const id = loadIdentity(b);
  if (token) {
    localStorage.setItem(identityKey(b), JSON.stringify({ ...id, deviceToken: token }));
  }
}
function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : '浏览器';
  return (/Mobi|Android|iPhone/.test(ua) ? '移动端 ' : '桌面 ') + os;
}

const normBase = (b: string) => b.trim().replace(/\/+$/, '') || window.location.origin;
const apiOf = (b: string, p: string) => `${normBase(b)}/api/plugin/remote-control${p}`;
const wsOf = (b: string, p: string) => {
  const u = new URL(normBase(b));
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${u.origin}/api/plugin/remote-control${p}`;
};

// ================= 几何：显示矩形自算 =================
function syncViewport(): void {
  const el = stageRef.value;
  if (el) {
    viewport.w = el.clientWidth;
    viewport.h = el.clientHeight;
  }
  autoFitZoom();
}
/**
 * 舞台在 setup 阶段是 v-show 隐藏的（display:none），挂载那一刻 clientWidth 恒为 0。
 * 不在进入会话时重新量一次，displayedRect 会一直是 0×0 —— 画面元素宽高 0，
 * 表现就是「竖屏进来全黑，横屏/旋转触发 resize 才出画面」。
 */
let stageRO: ResizeObserver | null = null;
function observeStage(): void {
  const el = stageRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  stageRO?.disconnect();
  stageRO = new ResizeObserver(() => syncViewport());
  stageRO.observe(el);
}
watch(phase, (p) => {
  if (p !== 'live') return;
  void nextTick(() => {
    syncViewport();
    observeStage();
  });
});
function syncNativeFromVideo(): void {
  const v = videoRef.value;
  if (v && v.videoWidth > 0) {
    native.w = v.videoWidth;
    native.h = v.videoHeight;
  }
  autoFitZoom();
}
function syncNativeFromScreen(): void {
  // 元数据未到前的宽高兜底：直接用屏幕几何（宽高比正确即可）
  if (screen.value.w > 0 && screen.value.h > 0) {
    native.w = screen.value.w;
    native.h = screen.value.h;
  }
  autoFitZoom();
}
/**
 * 指针推到画面边缘时保留的安全边距（px）。
 * 用于 edge-pan：指针进到这个范围内就带动画面平移。
 *
 * 底部/右侧要留得比普通边距大：底部还要躲开系统手势区（手机底部上滑条），
 * 指针贴底时也得让箭头和远处的任务栏都看得清 —— 实报「指不到最下面的任务栏按钮」。
 */
const STAGE_EDGE_PAD = 28;
/** 底部留白：箭头 + 系统手势区余量 */
const STAGE_EDGE_PAD_BOTTOM = 96;
/** 右侧留白：箭头宽度 + 余量 */
const STAGE_EDGE_PAD_RIGHT = 68;

/**
 * 铺满（fill）时的额外放大比例。
 *
 * 目的：画面视觉上铺满屏幕（不留固定黑边），但四周各留出约 4% 的溢出量，
 * 让指针推到边界后还能继续平移，从而点到远端桌面的最底/最右元素（任务栏、右侧按钮）。
 * 不加这一项时，cover 恰好吃满，纵向没有任何可平移余量。
 */
const FILL_OVERSCAN = 1.08;

/**
 * 触屏额外平移余量（占短边比例）。
 *
 * 铺满模式下画面的上下本来就被裁掉一截：只允许平移到「远端边缘刚好贴住视口边缘」，
 * 指针推到远端最底部时热点就卡在屏幕边缘、仿真鼠标体整块跑到屏外 —— 实报
 * 「鼠标指不到最下面的任务栏按钮」。这里再放开一段行程，让远端边缘能被推到视口内侧，
 * 指针和鼠标体都留在可见区里（对标 UU 的「整屏可以往外拖」）。
 */
const PAN_OVERSCROLL_RATIO = 0.25;
/** 当前宿主允许的额外平移量（px）：仅触屏放开，桌面靠滚轮平移不需要这一档 */
function panPad(): number {
  if (!isTouch) return 0;
  return Math.round(Math.min(viewport.w, viewport.h) * PAN_OVERSCROLL_RATIO);
}

/** contain 适配盒（未缩放） */
function fitBox(): { w: number; h: number; x: number; y: number } {
  if (!native.w || !native.h || !viewport.w || !viewport.h) return { w: 0, h: 0, x: 0, y: 0 };
  let w = viewport.w;
  let h = viewport.w * (native.h / native.w);
  if (h > viewport.h) {
    h = viewport.h;
    w = viewport.h * (native.w / native.h);
  }
  return { w, h, x: (viewport.w - w) / 2, y: (viewport.h - h) / 2 };
}
/** cover 铺满盒：短边贴满视口后再放大 FILL_OVERSCAN，四周留出可平移的溢出量 */
function coverBox(): { w: number; h: number; x: number; y: number } {
  if (!native.w || !native.h || !viewport.w || !viewport.h) return { w: 0, h: 0, x: 0, y: 0 };
  const s = Math.max(viewport.w / native.w, viewport.h / native.h) * FILL_OVERSCAN;
  const w = native.w * s;
  const h = native.h * s;
  return { w, h, x: (viewport.w - w) / 2, y: (viewport.h - h) / 2 };
}
/** 当前显示矩形（含缩放/平移，已夹取在视口内） */
const displayedRect = computed(() => {
  const b = fitBox();
  if (!b.w) return { x: 0, y: 0, w: 0, h: 0 };
  if (zoomMode.value === 'fit') return b;
  const w = zoomMode.value === 'fill' ? coverBox().w : b.w * zoom.value;
  const h = zoomMode.value === 'fill' ? coverBox().h : b.h * zoom.value;
  const cx = (viewport.w - w) / 2;
  const cy = (viewport.h - h) / 2;
  // 触屏放开一段额外行程（panPad）：远端边缘能被推进视口内侧，指针才点得到最底部的任务栏
  const pad = panPad();
  const xMin = Math.min(0, viewport.w - w) - pad;
  const xMax = Math.max(0, viewport.w - w) + pad;
  const yMin = Math.min(0, viewport.h - h) - pad;
  const yMax = Math.max(0, viewport.h - h) + pad;
  return {
    w,
    h,
    x: Math.min(xMax, Math.max(xMin, cx + pan.x)),
    y: Math.min(yMax, Math.max(yMin, cy + pan.y)),
  };
});
const mediaStyle = computed<CSSProperties>(() => {
  const r = displayedRect.value;
  return {
    position: 'absolute',
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    objectFit: 'fill',
  };
});
function panBy(dx: number, dy: number): void {
  const full = zoomMode.value === 'fill';
  const b = full ? coverBox() : fitBox();
  const w = full ? b.w : b.w * zoom.value;
  const h = full ? b.h : b.h * zoom.value;
  const pad = panPad();
  const xMinOff = Math.min(0, viewport.w - w) - (viewport.w - w) / 2 - pad;
  const xMaxOff = Math.max(0, viewport.w - w) - (viewport.w - w) / 2 + pad;
  const yMinOff = Math.min(0, viewport.h - h) - (viewport.h - h) / 2 - pad;
  const yMaxOff = Math.max(0, viewport.h - h) - (viewport.h - h) / 2 + pad;
  pan.x = Math.min(xMaxOff, Math.max(xMinOff, pan.x + dx));
  pan.y = Math.min(yMaxOff, Math.max(yMinOff, pan.y + dy));
}
function setZoom(z: number, anchorX?: number, anchorY?: number): void {
  zoomTouchedByUser = true;
  const before = displayedRect.value;
  zoomMode.value = 'free';
  zoom.value = Math.min(8, Math.max(1, z));
  if (zoom.value <= 1.01) {
    zoomMode.value = 'fill';
    zoom.value = 1;
    pan.x = 0;
    pan.y = 0;
    return;
  }
  // 以锚点（捏合中点/光标）为不动点：让锚点下的内容点缩放后仍停在锚点下
  if (anchorX != null && anchorY != null && before.w > 0 && before.h > 0) {
    const after = displayedRect.value;
    const ux = (anchorX - before.x) / before.w;
    const uy = (anchorY - before.y) / before.h;
    pan.x += (anchorX - ux * after.w) - after.x;
    pan.y += (anchorY - uy * after.h) - after.y;
    panBy(0, 0); // 夹取越界
  }
}
function toggleZoom(): void {
  zoomTouchedByUser = true;
  pan.x = 0;
  pan.y = 0;
  // 两档循环：铺满 ↔ 适应。
  // ★ 不再提供「1:1」档：它在手机上等于把画面放大 2~3 倍，误触一次就只剩桌面中间
  //   一小块，看起来像远控坏了、且很难自己退出来。需要精细放大时用双指捏合。
  zoomMode.value = zoomMode.value === 'fill' ? 'fit' : 'fill';
  zoom.value = 1;
}

// ---- 指针箭头（显示坐标 = 显示矩形换算，与旧自绘光标同一套几何）----
/** 指针箭头位置：左上角 = 箭头尖 = 注入坐标 */
const vmousePos = reactive({ x: 0, y: 0 });
const vmouseStyle = computed<CSSProperties>(() => ({ left: `${vmousePos.x}px`, top: `${vmousePos.y}px` }));
const fxStyle = computed<CSSProperties>(() => ({ left: `${fx.x}px`, top: `${fx.y}px` }));

// ---- 配对 ----
/** 地址框里粘的是整条邀请链接（http://ip:port/remote?code=xxx）时，拆成 origin + 授权码；
 *  裸 ip[:port] 补 http://。认不出来就原样保留（纯授权码别乱改）。 */
function adoptHostInput(): void {
  const t = form.host.trim();
  if (!t) return;
  const parsed = normalizeHostInput(t);
  if (!parsed.host) return;
  form.host = parsed.host;
  // 链接里的码是显式意图，覆盖「上次记住的码」与手输残留
  if (parsed.code) form.code = parsed.code;
}
/** 粘贴时 v-model 还没落值，等一拍再解析 */
function onHostPaste(): void {
  setTimeout(adoptHostInput, 0);
}

async function pair(): Promise<void> {
  adoptHostInput();
  const code = form.code.trim();
  // 开放模式（被控端 openMode=true）下允许空码发起；被控端没开时会回「授权码不正确」照常提示
  pairing.value = true;
  base = normBase(form.host);
  const id = loadIdentity(base);
  const ac = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, PAIR_TIMEOUT_MS);
  const fail = (err: unknown): void => {
    const e = timedOut ? Object.assign(new Error('timeout'), { name: 'TimeoutError' }) : err;
    ElMessage.error({ message: describeConnectError(e, { host: base, timeoutMs: PAIR_TIMEOUT_MS }).message, duration: 6000 });
  };
  try {
    let res: Response;
    try {
      res = await fetch(apiOf(base, '/pair'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          deviceId: id.deviceId,
          deviceToken: id.deviceToken,
          deviceName: deviceName(),
        }),
        signal: ac.signal,
      });
    } catch (e) {
      fail(e);
      return;
    }
    let body: { error?: string; data?: { deviceToken?: string; status?: string; token?: string; confirmId?: string } };
    try {
      body = await res.json();
    } catch (e) {
      fail(e); // 不是 JSON：多半地址指向了别的网站
      return;
    }
    if (body.error) {
      ElMessage.error({ message: `配对失败：${body.error}`, duration: 6000 });
      return;
    }
    if (!res.ok) {
      ElMessage.error({ message: `配对失败：被控端返回 HTTP ${res.status}`, duration: 6000 });
      return;
    }
    try { localStorage.setItem(RC_LAST_HOST_KEY, base); } catch { /* 隐私模式忽略 */ }
    // 被控端认了这次配对（含待确认）才记：地址 + 这次用的授权码，下次下拉直接选
    rememberPeer(base);
    const d = body.data || {};
    if (d.deviceToken) saveIdentity(base, d.deviceToken);
    if (d.status === 'granted' && d.token) {
      stopConfirmWatch();
      sessionToken = d.token;
      openWs(`token=${encodeURIComponent(sessionToken)}`);
    } else if (d.status === 'pending' && d.confirmId) {
      phase.value = 'pending';
      pendingConfirmId = d.confirmId;
      startConfirmWatch();
      // 首连也走心跳那条路：连不上就每个心跳重试，而不是直接判配对失败
      pendingHeartbeat();
    } else {
      ElMessage.error({ message: '配对失败：被控端返回的数据不完整（没有授权令牌也没有待确认凭据）', duration: 6000 });
    }
  } finally {
    window.clearTimeout(timer);
    pairing.value = false;
  }
}
function abortPair(): void {
  stopConfirmWatch();
  cancelPendingPair();
  // 先退到 setup 再关通道：否则 onclose 会再弹一次「连接已断开」
  phase.value = 'setup';
  cleanup();
}

/** 控制端放弃等待（取消/超时）：通知服务端作废这条 pending，被控端随之收掉确认弹窗 */
function cancelPendingPair(): void {
  if (!pendingConfirmId) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    send({ type: 'pair.cancel', confirmId: pendingConfirmId });
  }
}

/** 等待被控端确认的倒计时：超时按「未确认」收尾，不让用户对着转圈等下去 */
function startConfirmWatch(): void {
  stopConfirmWatch();
  const secs = Math.round(CONFIRM_TIMEOUT_MS / 1000);
  confirmDeadline = Date.now() + CONFIRM_TIMEOUT_MS;
  confirmLeft.value = secs;
  confirmTimer = window.setInterval(() => {
    const left = Math.max(0, Math.ceil((confirmDeadline - Date.now()) / 1000));
    confirmLeft.value = left;
    if (left > 0) {
      // 每 3 秒敲一次服务端：通道活着就 pair.wait（丢了 granted 也能补发），
      // 通道没建起来就重连 —— 否则被控端点「允许」时本端没通道，只能干等 30 秒
      if (left % 3 === 0) void pendingHeartbeat();
      return;
    }
    stopConfirmWatch();
    // 主动作废服务端的 pending：否则被控端的确认弹窗会一直挂着，用户晚点再点允许也没人收
    cancelPendingPair();
    phase.value = 'setup';
    cleanup();
    ElMessage.error({
      message: `等待确认超时：被控端 ${secs} 秒内没有确认（可能没人在那台电脑前，或确认弹窗被忽略了），请重试`,
      duration: 8000,
    });
  }, 1000);
}
/** pending 心跳：通道通就 pair.wait，通道不通就凭 confirmId 重连（服务端会补发状态） */
function pendingHeartbeat(): void {
  if (phase.value !== 'pending' || !pendingConfirmId) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    send({ type: 'pair.wait' });
    return;
  }
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  pendingRecovering = true;
  openWs(`confirmId=${encodeURIComponent(pendingConfirmId)}`);
  window.setTimeout(() => { pendingRecovering = false; }, 3000);
}
function stopConfirmWatch(): void {
  if (confirmTimer) {
    clearInterval(confirmTimer);
    confirmTimer = 0;
  }
  confirmLeft.value = 0;
}

// ---- 扫码连接（jsQR 摄像头解码；载荷解析见 utils/rcScan.ts）----
// 被控端二维码 = http://ip:port/remote?code=授权码：系统相机扫 → 打开本页自动连接；
// 本页「扫码连接」按钮 → 摄像头取景反扫，双向都不用手敲地址和授权码。
const scanning = ref(false);
const scanError = ref('');
const scanVideoRef = ref<HTMLVideoElement>();
let scanStream: MediaStream | null = null;
let scanTimer = 0;

async function startScan(): Promise<void> {
  scanError.value = '';
  scanning.value = true;
  await nextTick();
  try {
    // advanced.focusMode: 显式请求连续自动对焦 —— 部分设备取景默认不对焦到二维码距离，
    // 不支持该约束的设备会整条忽略 advanced 项（不会导致取流失败），无副作用
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
      },
    });
  } catch (e) {
    scanError.value = `相机不可用：${(e as Error)?.message || e}。也可以用系统相机扫二维码（会直接打开本页并自动连接）。`;
    return;
  }
  await nextTick();
  const video = scanVideoRef.value;
  if (!video) {
    stopScan();
    return;
  }
  video.srcObject = scanStream;
  try { await video.play(); } catch { /* 个别浏览器需要手势，浮层里有取景画面即可 */ }
  // 解码循环：降采样到 480 宽提帧率，250ms 一帧足够（二维码是静态的）
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  scanTimer = window.setInterval(() => {
    if (!scanning.value || !video.videoWidth || !ctx) return;
    const w = 480;
    const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (found?.data) onScanPayload(found.data);
  }, 250);
}

function onScanPayload(text: string): void {
  const t = parseRcScanPayload(text);
  stopScan();
  if (t.host) form.host = t.host;
  if (t.code) {
    form.code = t.code;
    void pair();
  } else {
    ElMessage.info('二维码里没有授权码：已填入地址，请再输入授权码');
  }
}

function stopScan(): void {
  scanning.value = false;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = 0;
  }
  if (scanStream) {
    for (const track of scanStream.getTracks()) track.stop();
    scanStream = null;
  }
}

// ---- 被连 · 本机（桌面子窗口一页两用：本机二维码/授权码，省得回设置页找）----
// 数据源与设置页局域网卡同口径：/network/ip（IP/端口）+ hostkey → /status（码/通道）。
// 两个接口都走 license 门禁，所以本页签只在桌面端本机有意义（手机上看到的是未启用提示）。
const hostTabLoading = ref(false);
const hostLoaded = ref(false);
const hostPluginEnabled = ref(false);
const hostCode = ref('');
const hostMode = ref('');
/** 防火墙入站放行状态：null=未检测（纯 Web 宿主 / 非 Windows），false=未开放 */
const hostPortRule = ref<boolean | null>(null);
const hostPortBusy = ref(false);
const hostIps = ref<LanIp[]>([]);
const hostPort = ref(3001);
const hostQrUrl = ref('');
const settingsStore = useSettingsStore();
/**
 * 对外 IP 下拉：绑的是**解析后的地址**，不是"未选"语义。
 *
 * ★ 2026-10-26 用户报障「这里优化下默认选中」：此前初值 `''`，而所有 option 都是真实地址，
 *   没有一项匹配 → 浏览器把 select 渲染成空白，看起来"一个都没选中"，可下面的控制端地址
 *   已经在用物理网卡了，两个控件自相矛盾。
 * 读写仍走设置页同一份 `settings.defaultLanIp`（三处同源）：设置页选过的网卡这里直接生效，
 *   这里换一块也写回去；地址失效（换网/关虚拟网卡）时 pickDefaultLanIp 自动回落物理网卡。
 */
const hostSelectedIp = computed({
  get: () => pickDefaultLanIp(hostIps.value, settingsStore.settings.defaultLanIp),
  set: (v: string) => { void settingsStore.update({ defaultLanIp: String(v || '') }); },
});
const hostPreferredIp = computed(() => hostSelectedIp.value);
watch(hostPreferredIp, () => void renderHostQr());
let hostHostKey = '';

function openHostTab(): void {
  setupTab.value = 'host';
  if (!hostLoaded.value) void loadHostInfo();
}

// ---- 安卓镜像（真内嵌）：设备列表来自 android-mirror 插件，画面上屏见 AndroidMirrorStage ----
function openAndroidTab(): void {
  setupTab.value = 'android';
  void loadAndroidDevices();
}

async function loadAndroidDevices(): Promise<void> {
  androidLoading.value = true;
  try {
    const r = await api.get<any>('/plugin/android-mirror/status');
    const list = (r as { data?: { devices?: Array<{ serial: string; model?: string; state: string }> } })?.data?.devices;
    androidDevices.value = Array.isArray(list) ? list.filter((d) => d && d.serial) : [];
    if (!androidPick.value && androidDevices.value.length) androidPick.value = androidDevices.value[0].serial;
  } catch {
    androidDevices.value = [];
  } finally {
    androidLoading.value = false;
  }
}

function connectAndroid(): void {
  const serial = androidPick.value;
  if (!serial) return;
  const dev = androidDevices.value.find((d) => d.serial === serial);
  linkKind.value = 'android';
  androidSerial.value = serial;
  androidName.value = dev?.model || serial;
  hasFrame.value = false;
  phase.value = 'live';
}

function androidKey(code: number): void {
  androidStageRef.value?.key(code);
}

function onAndroidMeta(meta: { deviceName: string; width: number; height: number }): void {
  if (meta.deviceName) androidName.value = meta.deviceName;
  hasFrame.value = true;
}

async function loadHostInfo(): Promise<void> {
  hostTabLoading.value = true;
  try {
    // 设置可能还没从本地读回来（远控页常在新窗口里先于设置加载）：先补一次，
    // 否则下面排序/默认 IP 读到的都是默认值，用户选过的网卡会被当成没选。
    if (!settingsStore.loaded) await settingsStore.load();
    const [net, key] = await Promise.allSettled([
      api.get<any>('/network/ip'),
      api.get<any>('/plugin/remote-control/hostkey'),
    ]);
    if (net.status === 'fulfilled') {
      const { ips, port } = parseNetworkIpResponse(net.value);
      if (port) hostPort.value = port;
      // 排序 = 默认 IP 贯通：用户选过的置顶，其后物理网卡，最后虚拟网卡（与设置页同口径）
      hostIps.value = sortLanIps(ips, settingsStore.settings.defaultLanIp);
    }
    if (key.status === 'fulfilled' && (key.value as any)?.data?.key) {
      hostHostKey = String((key.value as any).data.key);
      const r = await fetch(`${API_BASE}/plugin/remote-control/status`, {
        headers: { ...buildRequestHeaders(), 'x-rc-host-key': hostHostKey },
      });
      const body = await r.json();
      if (!body?.error) {
        hostPluginEnabled.value = true;
        hostCode.value = String(body?.data?.code?.current || '');
        hostMode.value = String(body?.data?.mode || '');
      }
    }
  } catch { /* 任一失败按未启用渲染 */ } finally {
    hostTabLoading.value = false;
    hostLoaded.value = true;
  }
  await renderHostQr();
  void refreshPortState();
}

/**
 * 局域网入站端口：Windows 防火墙默认拦入站，其它设备连不进来时表现为
 * 「地址能拼出来但控制端一直等待/连不上」。桌面端可检测 + 一键授权开放。
 */
type RcPortBridge = {
  rcPortStatus?: () => Promise<{ ok?: boolean; port?: number; listening?: boolean; ruleExists?: boolean }>;
  rcPortOpen?: () => Promise<{ ok?: boolean; already?: boolean; error?: string }>;
};
const rcPortBridge = (): RcPortBridge | null => (window as unknown as { electronAPI?: RcPortBridge }).electronAPI || null;

async function refreshPortState(): Promise<void> {
  const bridge = rcPortBridge();
  if (!bridge?.rcPortStatus) {
    hostPortRule.value = null; // 纯 Web 宿主：没有本机防火墙可管
    return;
  }
  try {
    const r = await bridge.rcPortStatus();
    hostPortRule.value = r?.ok ? !!r.ruleExists : null;
  } catch {
    hostPortRule.value = null;
  }
}

async function openLanPort(): Promise<void> {
  const bridge = rcPortBridge();
  if (!bridge?.rcPortOpen) {
    ElMessage.info(`请在系统防火墙里手动放行本机 TCP ${hostPort.value}`);
    return;
  }
  hostPortBusy.value = true;
  try {
    const r = await bridge.rcPortOpen();
    if (r?.ok) {
      ElMessage.success(r.already ? '防火墙已放行该端口' : '已开放端口（若弹出系统授权窗口请在弹窗里点「是」）');
    } else {
      ElMessage.error(r?.error || '开放端口失败');
    }
  } catch (e) {
    ElMessage.error((e as Error)?.message || '开放端口失败');
  } finally {
    hostPortBusy.value = false;
    await refreshPortState();
  }
}

async function renderHostQr(): Promise<void> {  const ip = hostPreferredIp.value;
  if (!ip || !hostCode.value) { hostQrUrl.value = ''; return; }
  try {
    hostQrUrl.value = await QRCode.toDataURL(`http://${ip}:${hostPort.value}/remote?code=${encodeURIComponent(hostCode.value)}`, { width: 220, margin: 1 });
  } catch { hostQrUrl.value = ''; }
}

async function rotateHostCode(): Promise<void> {
  try {
    const r = await api.post<any>('/plugin/remote-control/code/rotate');
    if ('error' in r) { ElMessage.error(r.error || '换码失败'); return; }
    hostCode.value = String(r?.data?.current || '');
    ElMessage.success('已生成新授权码（旧码立即失效）');
    await renderHostQr();
  } catch (e) {
    ElMessage.error((e as Error)?.message || '换码失败');
  }
}

function copyHostInvite(): void {
  const ip = hostPreferredIp.value;
  if (!ip || !hostCode.value) return;
  const text = `言智远程控制：浏览器打开 http://${ip}:${hostPort.value}/remote?code=${hostCode.value} 即可连接（首次需在本机点允许）`;
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制邀请信息'));
}

// 关闭按钮：桌面子窗口 window.close() 直接生效；浏览器里脚本打开的标签可关，
// 直接导航进来的关不掉就退回上一页（主窗口内嵌打开时即回到应用）。
function closeRemotePage(): void {
  window.close();
  window.setTimeout(() => {
    if (history.length > 1) history.back();
  }, 80);
}

function resetToSetup(): void {
  cleanup();
  endedReason.value = '';
  phase.value = 'setup';
  setupTab.value = 'control';
}

// ---- WS ----
function openWs(qs: string): void {
  cleanupSocket();
  wsOpened = false;
  let sock: WebSocket;
  try {
    sock = new WebSocket(wsOf(base, `/session/ws?${qs}`));
  } catch {
    phase.value = 'setup';
    ElMessage.error({ message: `连接失败：远控地址格式不对（${base}），检查被控端地址`, duration: 6000 });
    return;
  }
  sock.binaryType = 'arraybuffer';
  ws = sock;
  // 连不上不能永远挂在 CONNECTING：超时主动关掉，onclose 会走重连/报错分支
  if (wsConnectTimer) window.clearTimeout(wsConnectTimer);
  wsConnectTimer = window.setTimeout(() => {
    wsConnectTimer = null;
    if (wsOpened) return;
    try { sock.close(); } catch { /* ignore */ }
  }, WS_CONNECT_TIMEOUT_MS);
  sock.onopen = () => {
    if (wsConnectTimer) {
      window.clearTimeout(wsConnectTimer);
      wsConnectTimer = null;
    }
    wsOpened = true;
    if (phase.value === 'setup' && sessionToken) phase.value = 'live';
    pingTimer = window.setInterval(() => send({ type: 'ping', t: Date.now() }), 10_000);
  };
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      onJpegFrame(ev.data as ArrayBuffer);
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    void onWsMessage(msg);
  };
  sock.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (wsConnectTimer) {
      window.clearTimeout(wsConnectTimer);
      wsConnectTimer = null;
    }
    const wasOpen = wsOpened;
    wsOpened = false;
    // 等待确认期间的重连尝试：失败不报错、不退出 pending（下一拍还会再试，
    // 首连就失败时也不该直接打断用户已经排队的配对请求）
    if (pendingRecovering && phase.value === 'pending') {
      ws = null;
      return;
    }
    if (phase.value === 'ended' || phase.value === 'setup') return;
    stopConfirmWatch();
    phase.value = 'setup';
    cleanup();
    ElMessage.error({
      message: wasOpen
        ? '连接已断开：与被控端的实时通道中断（网络波动，或被控端关闭了远控）'
        : `连接不上被控端（${base}）：配对已受理，但实时通道没建起来（端口/防火墙，或被控端刚关掉远控）`,
      duration: 8000,
    });
  };
  sock.onerror = () => { /* onclose 统一收尾 */ };
}

async function onWsMessage(msg: Record<string, unknown>): Promise<void> {
  const type = String(msg.type || '');
  switch (type) {
    case 'pair.pending':
      // 心跳会反复收到同一状态：已在等待就不要重置倒计时（否则永远等不到超时）
      if (msg.confirmId) pendingConfirmId = String(msg.confirmId);
      if (phase.value !== 'pending') {
        phase.value = 'pending';
        startConfirmWatch();
      }
      break;
    case 'session.granted': {
      stopConfirmWatch();
      phase.value = 'live';
      sessionId = String(msg.sessionId || '');
      if (!sessionToken) sessionToken = String(msg.token || '');
      if (msg.deviceToken) saveIdentity(base, String(msg.deviceToken));
      if (Array.isArray(msg.iceServers)) iceServers.value = msg.iceServers as RcIceServer[];
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) setScreen(msg.screen as ScreenRect, String(msg.screenSource || ''));
      applyInputState(msg.input);
      if (m === 'webrtc') startWebRtc();
      // 几何没到手：自己退避要，别让用户面对「画面正常但点哪都没反应」
      if (screen.value.w <= 0) requestScreenSoon();
      askDisplaysIfEmpty();
      break;
    }
    case 'session.resume':
      phase.value = 'live';
      if (Array.isArray(msg.iceServers)) iceServers.value = msg.iceServers as RcIceServer[];
      {
        const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
        setMode(m);
        // 断线重连后权限跟着服务端恢复，不由客户端自己假设
        applyInputState(msg.input);
        // 服务端会带上次已知几何；没有就自己退避要
        if (msg.screen) setScreen(msg.screen as ScreenRect, String(msg.screenSource || ''));
        // 白名单直连/断线重连走 resume：WebRTC 也要补发 offer，否则画面永远起不来
        if (m === 'webrtc' && !videoRef.value?.srcObject) startWebRtc();
        if (screen.value.w <= 0) requestScreenSoon();
        askDisplaysIfEmpty();
      }
      break;
    case 'session.mode': {
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      // 兼容模式会话被升级成 WebRTC（白名单直连场景）：需要重新发起 offer
      if (m === 'webrtc' && !videoRef.value?.srcObject) startWebRtc();
      if (msg.screen) setScreen(msg.screen as ScreenRect, String(msg.screenSource || ''));
      askDisplaysIfEmpty();
      break;
    }
    case 'webrtc.retry':
      // 服务端明确回报「升不上去」的原因，别让用户对着「兼容模式」猜
      if (msg.ok) ElMessage.success('已切回 WebRTC，正在重新协商画面');
      else ElMessage.warning(String(msg.reason || '重试 WebRTC 失败'));
      break;
    case 'screen.info':
      setScreen(msg.screen as ScreenRect, String(msg.screenSource || ''));
      break;
    case 'displays.info': {
      // 被控端显示器清单（WebRTC=Electron 枚举；JPEG=代理枚举+整个桌面项）
      const list = Array.isArray(msg.list) ? (msg.list as RcDisplayInfo[]) : [];
      displays.value = list.filter((d) => d && d.id);
      // 同一类缺陷（同「连接 IP 下拉」）：current 缺省时 select 的值是 ''，匹配不到任何 option
      // → 渲染成空白，看着像"没有显示器可用"。回落到主显示器 / 第一项。
      const cur = String(msg.current || displays.value.find((d) => d.primary)?.id || displays.value[0]?.id || '');
      if (cur) currentDisplay.value = cur;
      // 一条都没拿到：多半是这次推送丢了或被控端渲染层还没好，再主动要一次（有上限，不刷屏）
      if (!displays.value.length && displaysRequested < 2) window.setTimeout(requestDisplays, 1500);
      break;
    }
    case 'rtc.answer':
      if (pc) {
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: String(msg.sdp || '') });
        } catch (e) {
          console.warn('[rc] setRemoteDescription 失败', e);
        }
      }
      break;
    case 'rtc.failed':
      // 被控端采集/协商失败：立即转兼容模式，别让用户对着黑屏等
      ElMessage.warning(`WebRTC 不可用，已切到兼容模式：${String(msg.reason || '采集失败')}`);
      send({ type: 'use.jpeg' });
      break;
    case 'rtc.restart': {
      // 切屏重协商：被控端已按新显示器重新采集，本端重建 PC 走全新 offer/answer
      if (mode.value === 'webrtc') {
        startWebRtc();
        // 12s 内没画面自动落兼容模式（与 setMode 同口径）
        if (webrtcWatchdog) clearTimeout(webrtcWatchdog);
        webrtcWatchdog = window.setTimeout(() => {
          if (mode.value === 'webrtc' && !videoRef.value?.srcObject) {
            ElMessage.warning('切屏重协商未出画面，已切到兼容模式');
            send({ type: 'use.jpeg' });
          }
        }, 12_000);
      }
      break;
    }
    case 'rtc.ice':
      if (pc && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
        } catch { /* LAN 直连下个别 candidate 失败可忽略 */ }
      }
      break;
    case 'clipboard.done':
      clipBusy.value = false;
      if (msg.ok) {
        ElMessage.success('已发送到被控端剪贴板');
        clipPanelOpen.value = false;
      } else {
        ElMessage.warning(String(msg.error || '剪贴板操作失败'));
      }
      break;
    case 'clipboard.text':
      clipBusy.value = false;
      clipText.value = String(msg.text ?? '');
      try {
        await navigator.clipboard.writeText(clipText.value);
        ElMessage.success('已取到被控端剪贴板并写入本机');
      } catch {
        ElMessage.info('已取到被控端剪贴板（非安全上下文无法自动写入，请在文本框复制）');
      }
      break;
    case 'session.input': {
      applyInputState(msg);
      if (inputAllowed.value) ElMessage.success('已切换为可操控');
      else ElMessage.info(inputGranted.value ? '已切换为仅观看' : '被控端未授予操作权限');
      break;
    }
    case 'input.requested':
      ElMessage.info('已通知被控端，等待本人在场确认');
      break;
    case 'input.rejected':
      lastInputError.value = String(msg.reason || '输入被拒绝');
      ElMessage.warning(lastInputError.value);
      break;
    case 'session.ended':
      stopConfirmWatch();
      endedReason.value = String(msg.reason || '会话已结束');
      cleanup();
      phase.value = 'ended';
      break;
    default:
      break;
  }
}

/** 几何来源：capture=实际采集端（权威），agent=代理兜底，''=未知 */
const screenSource = ref<'capture' | 'agent' | ''>('');
let screenReqTimer: number | null = null;
let screenReqAttempts = 0;

/**
 * 应用远端屏幕几何。
 *
 * agent 来源只做兜底：已经有 capture（实际采集端）时不能被服务端的兜底值覆盖，
 * 否则切了副屏也会被「主屏几何」拉回去，点击坐标全偏。
 */
function setScreen(s: ScreenRect, source?: string): void {
  const src = source === 'capture' || source === 'agent' ? source : '';
  if (!s || !(Number(s.w) > 0) || !(Number(s.h) > 0)) return;
  if (src === 'agent' && screenSource.value === 'capture') return;
  if (src) screenSource.value = src;
  screen.value = s;
  syncNativeFromScreen();
  syncViewport();
  if (mouseVisible.value) {
    initMousePos();
    syncVmouseToPointer();
  }
  // 拿到权威几何才停自愈轮询；代理兜底值不算数（可能是主屏，切副屏后就错了）
  if (screenSource.value === 'capture') {
    screenReqAttempts = 0;
    if (screenReqTimer) {
      clearTimeout(screenReqTimer);
      screenReqTimer = null;
    }
  }
}

/**
 * 几何自愈：进会话后仍未拿到 screen 就退避重问（1s/2s/4s…，最多 5 次）。
 *
 * 画面几何原本靠被控端在 answer 之后单发一次 rtc.screen，丢一次就是整场
 * 「画面正常但点哪都没反应」；控制端必须能自己把这条信息要回来。
 */
function requestScreenSoon(): void {
  if (screenReqTimer) {
    clearTimeout(screenReqTimer);
    screenReqTimer = null;
  }
  if (phase.value !== 'live' || linkKind.value !== 'desktop') return;
  if ((screen.value.w > 0 && screenSource.value === 'capture') || screenReqAttempts >= 5) return;
  const delay = Math.min(4000, 1000 * 2 ** screenReqAttempts);
  screenReqAttempts += 1;
  screenReqTimer = window.setTimeout(() => {
    screenReqTimer = null;
    if (phase.value !== 'live') return;
    if (screen.value.w > 0 && screenSource.value === 'capture') return;
    send({ type: 'screen.request' });
    requestScreenSoon();
  }, delay);
}

function setMode(m: 'webrtc' | 'jpeg'): void {
  mode.value = m;
  if (m === 'jpeg') {
    teardownWebRtc();
    hasFrame.value = false; // 兼容模式首帧还没到，先显示等待层
  } else {
    // WebRTC 起不来（无 host 渲染层 / 全被拦）时 12s 无画面自动降级 JPEG
    if (webrtcWatchdog) clearTimeout(webrtcWatchdog);
    webrtcWatchdog = window.setTimeout(() => {
      if (mode.value === 'webrtc' && !videoRef.value?.srcObject) {
        ElMessage.warning('WebRTC 未能出画面（局域网直连未打通），已切到兼容模式');
        send({ type: 'use.jpeg' });
      }
    }, 12_000);
  }
}

// ---- WebRTC（主通道）----
function startWebRtc(): void {
  teardownWebRtc();
  // LAN：host candidate 直连无需任何服务器；跨公网：经 STUN 打洞 / TURN 中继（服务端下发）
  const conn = new RTCPeerConnection(iceServers.value.length ? { iceServers: iceServers.value } : {});
  pc = conn;
  conn.ontrack = (e) => {
    // ★ 音频事件会带 e.streams[0]（纯音频流）后到，直接赋值会把视频流覆盖成
    //   「只有音频的流」→ video 播着一条没有画面的流，永远黑屏（2026-10-28 实锤：
    //   手机 CDP 探测 trackStates = "audio:live:unmuted"、videoTrackCount=0）。
    //   音频当前默认不发送（被控端 enabled=false），这里只接管视频轨。
    if (e.track.kind !== 'video') return;
    const incoming = e.streams[0];
    remoteStream = incoming && incoming.getVideoTracks().length ? incoming : new MediaStream([e.track]);
    hasFrame.value = true;
    if (videoRef.value) {
      videoRef.value.srcObject = remoteStream;
      // ★ 自动播放被 WebView 策略拒绝时（无手势的远程加载页最常见），这里必须留痕
      //   —— 吞掉的话表现就是「流在收、画面纯黑」，与网络故障无法区分。
      videoRef.value.play().then(() => {
        isPlaying.value = true;
      }).catch((err) => {
        isPlaying.value = false;
        console.warn('[rc] video.play() 被拒绝:', err?.name || err);
        // 周期重试（部分 WebView 首帧渲染后才放行自动播放）+ 首次手势再试
        const retry = window.setInterval(() => {
          videoRef.value?.play().then(() => {
            isPlaying.value = true;
            window.clearInterval(retry);
          }).catch(() => undefined);
        }, 1500);
        retryTimers.push(retry);
        const retry2 = () => {
          videoRef.value?.play().then(() => {
            isPlaying.value = true;
          }).catch(() => undefined);
        };
        document.addEventListener('pointerdown', retry2, { once: true });
      });
    }
    // 接收侧统计周期回传：发送端日志证明「在编码在发送」时，这里证明「对端在收」
    if (recvStatsTimer) clearInterval(recvStatsTimer);
    recvStatsTimer = window.setInterval(async () => {
      try {
        const stats = await conn.getStats();
        let recv: Record<string, unknown> | null = null;
        stats.forEach((r: Record<string, unknown>) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            recv = {
              framesDecoded: r.framesDecoded,
              framesDropped: r.framesDropped,
              bytesReceived: r.bytesReceived,
              packetsLost: r.packetsLost,
              jitter: r.jitter,
              frameW: r.frameWidth,
              frameH: r.frameHeight,
            };
          }
        });
        console.log('[rc-recv]', JSON.stringify(recv || { none: true }));
        send({ type: 'rtc.recv-stats', stats: recv || { none: true } });
      } catch { /* ignore */ }
    }, 5000);
    // ★ 连接初期主动要 keyframe：桌面静止时 libvpx 只在内容变化时编码，第一帧
    //   keyframe 迟迟不来 → 手机黑屏干等几分钟（2026-10-28 20:20 实测 90s 只出 2 帧）。
    //   连上后 12s 内每 2s 要一次，出画面速度从「分钟级」压到「2 秒级」。
    const kfRecv = e.receiver as RTCRtpReceiver & { generateKeyFrame?: () => Promise<void> };
    if (typeof kfRecv?.generateKeyFrame === 'function') {
      let kfCount = 0;
      const kfTimer = window.setInterval(() => {
        kfCount += 1;
        if (kfCount > 6 || !pc) {
          window.clearInterval(kfTimer);
          return;
        }
        try { void kfRecv.generateKeyFrame?.().catch(() => undefined); } catch { /* ignore */ }
      }, 2000);
      retryTimers.push(kfTimer);
    }
    // 局域网直连：把抖动缓冲/播放延迟压到最低（默认缓冲是给公网丢包留余量，LAN 上纯增延迟）
    try {
      const recv = e.receiver as RTCRtpReceiver & { playoutDelayHint?: number; jitterBufferTarget?: number };
      recv.playoutDelayHint = 0;
      recv.jitterBufferTarget = 0;
    } catch { /* 老内核不支持则用默认 */ }
    if (webrtcWatchdog) {
      clearTimeout(webrtcWatchdog);
      webrtcWatchdog = null;
    }
  };
  conn.onicecandidate = (e) => {
    if (e.candidate) send({ type: 'rtc.ice', candidate: e.candidate.toJSON() });
  };
  conn.addTransceiver('video', { direction: 'recvonly' });
  conn.addTransceiver('audio', { direction: 'recvonly' });
  void conn.createOffer().then(async (offer) => {
    await conn.setLocalDescription(offer);
    send({ type: 'rtc.offer', sdp: conn.localDescription?.sdp || offer.sdp || '' });
  });
}

function teardownWebRtc(): void {
  if (webrtcWatchdog) {
    clearTimeout(webrtcWatchdog);
    webrtcWatchdog = null;
  }
  if (recvStatsTimer) {
    clearInterval(recvStatsTimer);
    recvStatsTimer = null;
  }
  for (const t of retryTimers.splice(0)) {
    clearInterval(t);
  }
  try {
    pc?.close();
  } catch { /* ignore */ }
  pc = null;
  remoteStream = null;
  isPlaying.value = false;
}

// ---- JPEG 回退通道 ----
function onJpegFrame(data: ArrayBuffer): void {
  if (mode.value !== 'jpeg' || !canvasRef.value) return;
  void createImageBitmap(new Blob([data], { type: 'image/jpeg' })).then((bmp) => {
    if (jpegBitmap) jpegBitmap.close();
    jpegBitmap = bmp;
    const c = canvasRef.value;
    if (!c) return;
    if (c.width !== bmp.width || c.height !== bmp.height) {
      c.width = bmp.width;
      c.height = bmp.height;
    }
    const ctx = c.getContext('2d');
    ctx?.drawImage(bmp, 0, 0);
    hasFrame.value = true;
    if (native.w !== bmp.width || native.h !== bmp.height) {
      native.w = bmp.width;
      native.h = bmp.height;
    }
  }).catch(() => undefined);
}

const QUALITY_PRESETS: Record<string, { fps: number; scale: number; quality: number }> = {
  // 局域网带宽足够：档位整体抬高帧率（原 8/10/12fps 是「省带宽」思路，体感就是卡+不同步）
  smooth: { fps: 12, scale: 0.6, quality: 55 },
  balance: { fps: 15, scale: 0.8, quality: 62 },
  sharp: { fps: 20, scale: 1, quality: 72 },
};
function applyQuality(): void {
  const p = QUALITY_PRESETS[qualityPreset.value];
  if (p) send({ type: 'set.quality', ...p });
}
watch(qualityPreset, applyQuality);

// ================= 输入：手势（单指直接触控 + 仿真鼠标并行）=================
// 状态机在 utils/remote-gesture.ts（纯逻辑可单测）。直接触控走 direct 模式；
// 仿真鼠标拖动 = pointer 模式（movePointerBy 换算注入坐标），两套互不干扰。
const gesture = new RemoteGestureRecognizer({ mode: 'direct', longPressMs: 450 });
const padGesture = new RemoteGestureRecognizer({ mode: 'pointer', longPressMs: 450 });
/** 画面能否平移（放大或铺满）：决定双指拖动与指针边缘推挤是否触发平移 */
const canPanViewport = computed(
  () => zoomMode.value === 'fill' || (zoomMode.value === 'free' && zoom.value > 1.01),
);
let longPressTimer: number | null = null;
let padLongPressTimer: number | null = null;
let lastMoveSent = 0;
let lastDragSent = 0;
let fxTimer: number | null = null;

// 每次进入会话：触屏默认显示仿真鼠标，桌面端不显示；画面直接触控始终可用
watch(phase, (p) => {
  if (p !== 'live') return;
  mouseVisible.value = isTouch;
  gesture.reset();
  padGesture.reset();
  // ★ 每次进入会话重置视图：上一轮的放大/平移状态若残留，新会话会一直停在「只剩中间一小块」，
  //   用户体感就是「远控坏了」，而重连（session.resume）不会走 cleanup。
  zoomTouchedByUser = false;
  zoomMode.value = 'fill';
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
  if (mouseVisible.value) {
    initMousePos();
    syncVmouseToPointer();
  }
  // ★ 移动端进会话即沉浸（UU 口径）：App 壳里直接藏系统状态栏/导航栏，
  //   不再要求用户先点「全屏」——此前的表现就是「顶部状态栏一直挂着」。
  //   桌面/浏览器宿主 setNativeImmersive 静默跳过，无副作用。
  if (isTouch) {
    setNativeImmersive(true);
  }
});

const toScreen = (clientX: number, clientY: number): { x: number; y: number } | null => {
  if (screen.value.w <= 0 || screen.value.h <= 0) return null; // 屏幕几何未知时禁输入
  const r = displayedRect.value;
  if (!r.w || !r.h) return null;
  const nx = Math.max(0, Math.min(1, (clientX - r.x) / r.w));
  const ny = Math.max(0, Math.min(1, (clientY - r.y) / r.h));
  return {
    x: Math.round(screen.value.x + nx * screen.value.w),
    y: Math.round(screen.value.y + ny * screen.value.h),
  };
};
/** 直接触控时的临时光标反馈：仿真鼠标隐藏时才显示自绘光标 */
let cursorHideTimer: number | null = null;
function showCursorAt(x: number, y: number): void {
  // 仿真鼠标可见时由箭头尖代表指针，直接触控不再需要独立自绘光标
  if (mouseVisible.value) return;
  vmousePos.x = x - 1;
  vmousePos.y = y - 1;
}

/** 虚拟指针位置初始化到画面中心（屏幕坐标） */
function initMousePos(): void {
  if (!screen.value.w || (mousePos.x && mousePos.y)) return;
  mousePos.x = Math.round(screen.value.x + screen.value.w / 2);
  mousePos.y = Math.round(screen.value.y + screen.value.h / 2);
}
function toggleMouseMode(): void {
  // 仿真鼠标显隐（悬浮球菜单「仿真鼠标」项）；画面直接触控始终可用
  handleGesture(gesture.cancel(), false);
  handleGesture(padGesture.cancel(), true);
  mouseVisible.value = !mouseVisible.value;
  if (mouseVisible.value) {
    initMousePos();
    syncVmouseToPointer();
  }
}
/** 在虚拟指针当前位置右键（操作抽屉与仿真鼠标右半键共用） */
function rightClickHere(): void {
  if (!mouseVisible.value || !screen.value.w) return;
  input({ action: 'click', x: Math.round(mousePos.x), y: Math.round(mousePos.y), button: 'right' });
}
/** 诊断用：把一条输入描述成人能看的一行（动作/按键/坐标/增量） */
function describeInput(msg: Record<string, unknown>): string {
  const action = String(msg.action || '?');
  const button = msg.button ? ` ${String(msg.button)}` : '';
  const pos = typeof msg.x === 'number' && typeof msg.y === 'number'
    ? ` @${Math.round(msg.x)},${Math.round(msg.y)}`
    : '';
  const delta = msg.delta !== undefined ? ` Δ${String(msg.delta)}` : '';
  return `${action}${button}${pos}${delta} · ${new Date().toLocaleTimeString()}`;
}

const input = (msg: Record<string, unknown>): void => {
  // 先记下来：即使后面被拦，诊断面板也能看到「最后一条输入」停在谁身上。
  // move 是 40Hz 高频事件，记录它会让整个面板每帧重渲染，反而拖慢手感 —— 只记离散动作。
  if (msg.action !== 'move') {
    lastInput.value = describeInput(msg);
    lastInputError.value = '';
  }
  if (phase.value !== 'live') {
    lastInputError.value = '会话未就绪';
    return;
  }
  // 安卓镜像的输入走 AndroidMirrorStage 自己的通道，别混进桌面会话的 WS
  if (linkKind.value !== 'desktop') return;
  // 只读会话：本地直接不发，省得每条输入都换来一次拒绝（状态由底部常驻条说明）
  if (!inputAllowed.value) {
    lastInputError.value = inputGranted.value ? '本地已切到仅观看' : '被控端未授予操作权限';
    return;
  }
  // 坐标类输入在几何未就绪时必然换算失败：明确记下来，而不是静默丢弃
  const needsCoords = typeof msg.x === 'number' && typeof msg.y === 'number';
  if (needsCoords && screen.value.w <= 0) {
    lastInputError.value = '屏幕坐标未同步（screen 为 0）';
    return;
  }
  // 指针模式才维护自绘光标；屏幕触控模式直接用点按光圈反馈，避免两种模式视觉上同时生效
  if (mouseVisible.value && needsCoords) showCursorAt(msg.x as number, msg.y as number);
  send({ type: 'input', ...msg });
};

function clearLongPress(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function buzz(ms: number): void {
  try { navigator.vibrate?.(ms); } catch { /* 桌面端无振动 */ }
}

/** 点按反馈光圈（client 坐标）：让「这一下点到了」可见 */
function flashTap(clientX: number, clientY: number, button: 'left' | 'right'): void {
  fx.x = clientX;
  fx.y = clientY;
  fx.button = button;
  fx.visible = true;
  if (fxTimer) clearTimeout(fxTimer);
  fxTimer = window.setTimeout(() => { fx.visible = false; }, 360);
}

/** 指针模式下指针的显示位置（client 坐标） */
function cursorClientPoint(): { x: number; y: number } {
  const r = displayedRect.value;
  const s = screen.value;
  if (!r.w || !s.w) return { x: 0, y: 0 };
  return {
    x: r.x + ((mousePos.x - s.x) / s.w) * r.w,
    y: r.y + ((mousePos.y - s.y) / s.h) * r.h,
  };
}

function clickAt(clientX: number, clientY: number, button: 'left' | 'right', useCursor: boolean): void {
  if (useCursor) {
    initMousePos();
    const at = cursorClientPoint();
    flashTap(at.x, at.y, button);
    input({ action: 'click', x: Math.round(mousePos.x), y: Math.round(mousePos.y), button });
    return;
  }
  const p = toScreen(clientX, clientY);
  if (!p) return;
  lastTapAt = p;
  flashTap(clientX, clientY, button);
  input({ action: 'click', ...p, button });
}

/** 最近一次点按的远端坐标：右键按钮在「你刚点过的地方」右键，最符合直觉 */
let lastTapAt: { x: number; y: number } | null = null;

/** 远端坐标 → 画布内 client 坐标（让点按光圈画在正确位置） */
function screenToClient(p: { x: number; y: number }): { x: number; y: number } | null {
  const r = displayedRect.value;
  const s = screen.value;
  if (!r.w || !s.w) return null;
  return { x: r.x + ((p.x - s.x) / s.w) * r.w, y: r.y + ((p.y - s.y) / s.h) * r.h };
}

/**
 * 显式「右键」入口（2026-10-26 P0）。
 *
 * 手机上没有右键键，只有长按与双指轻点这两种「猜得到」的方式；对不熟悉的用户等于没有。
 * 侧栏给一个常驻按钮：优先在最近一次点过的位置右键，没点过就落屏心；指针模式下
 * 直接在当前虚拟指针处右键。
 */
function rightClickAtLast(): void {
  if (!inputAllowed.value) {
    ElMessage.info('当前为只读观看');
    return;
  }
  if (mouseVisible.value) {
    rightClickHere();
    return;
  }
  const at = lastTapAt || {
    x: screen.value.x + Math.floor(screen.value.w / 2),
    y: screen.value.y + Math.floor(screen.value.h / 2),
  };
  const c = screenToClient(at);
  if (c) flashTap(c.x, c.y, 'right');
  input({ action: 'click', x: Math.round(at.x), y: Math.round(at.y), button: 'right' });
}

function wheelAt(clientX: number, clientY: number, delta: number, useCursor: boolean): void {
  if (useCursor) {
    initMousePos();
    input({ action: 'wheel', x: Math.round(mousePos.x), y: Math.round(mousePos.y), delta });
    return;
  }
  const p = toScreen(clientX, clientY);
  if (p) input({ action: 'wheel', ...p, delta });
}

/** 指针模式：按手指位移移动虚拟指针（屏幕比例换算，跟手且与缩放无关） */
function movePointerBy(dx: number, dy: number): void {
  const r = displayedRect.value;
  const s = screen.value;
  if (!r.w || !r.h || !s.w) return;
  initMousePos();
  const k = s.w / r.w;
  mousePos.x = Math.min(s.x + s.w - 1, Math.max(s.x, mousePos.x + dx * k));
  mousePos.y = Math.min(s.y + s.h - 1, Math.max(s.y, mousePos.y + dy * k));

  // ★ 边缘平移（对标 UU）：指针被推到视口边缘后继续拖，画面跟着走。
  //   没有这一步，放大/铺满时指针会跑出可视区，用户只能看到「拖到头就不动了」。
  if (canPanViewport.value) {
    const c = cursorClientPoint();
    let px = 0;
    let py = 0;
    if (c.x < STAGE_EDGE_PAD) px = STAGE_EDGE_PAD - c.x;
    else if (c.x > viewport.w - STAGE_EDGE_PAD_RIGHT) px = viewport.w - STAGE_EDGE_PAD_RIGHT - c.x;
    if (c.y < STAGE_EDGE_PAD) py = STAGE_EDGE_PAD - c.y;
    else if (c.y > viewport.h - STAGE_EDGE_PAD_BOTTOM) py = viewport.h - STAGE_EDGE_PAD_BOTTOM - c.y;
    if (px !== 0 || py !== 0) panBy(px, py);
  }

  syncVmouseToPointer();
  const now = Date.now();
  if (now - lastMoveSent < 24) return;
  lastMoveSent = now;
  input({ action: 'move', x: Math.round(mousePos.x), y: Math.round(mousePos.y) });
}

/** 手势事件 → 注入消息（点击是原子 click，不再靠 down+up 赌目标应用的行为） */
function handleGesture(events: RemoteGestureEvent[], useCursor: boolean): void {
  for (const ev of events) {
    switch (ev.kind) {
      case 'tap':
        clickAt(ev.x, ev.y, 'left', useCursor);
        break;
      case 'rightTap':
        if (ev.fromTwoFinger) buzz(18);
        clickAt(ev.x, ev.y, 'right', useCursor);
        break;
      case 'dragStart': {
        const p = toScreen(ev.x, ev.y);
        if (p) input({ action: 'down', ...p, button: 'left' });
        break;
      }
      case 'dragMove': {
        const now = Date.now();
        if (now - lastDragSent < 24) break;
        lastDragSent = now;
        const p = toScreen(ev.x, ev.y);
        if (p) input({ action: 'move', ...p });
        break;
      }
      case 'dragEnd': {
        const p = toScreen(ev.x, ev.y);
        if (p) input({ action: 'up', ...p, button: 'left' });
        break;
      }
      case 'pointerMove':
        movePointerBy(ev.dx, ev.dy);
        break;
      case 'wheel':
        wheelAt(ev.x, ev.y, ev.delta, useCursor);
        break;
      case 'pan':
        // 放大/铺满时双指拖动 = 平移本地画面（不再注入滚动）
        panBy(ev.dx, ev.dy);
        break;
      case 'zoom':
        setZoom(zoom.value * ev.ratio, ev.anchorX, ev.anchorY);
        break;
    }
  }
}

function scheduleLongPress(): void {
  clearLongPress();
  longPressTimer = window.setTimeout(() => {
    const events = gesture.maybeLongPress(performance.now());
    if (events.length) buzz(30);
    handleGesture(events, false);
  }, 460);
}

function onStagePointerDown(e: PointerEvent): void {
  // 点画面 = 关掉所有浮层（操作面板/剪贴板）。
  actionsOpen.value = false;
  clipPanelOpen.value = false;
  bumpCtrlActive();
  // ★ 指针捕获：只在第一根手指上设。一个元素同一时刻只能捕获一个指针——每指都设
  //   会让第三指把前两指的捕获抢走，前两指的 move/up 从此不派发给舞台，三指手势
  //   永远建不起来（2026-10-28 实报「三指平移没用」）。touch-action:none + 舞台
  //   铺满全屏已保证后续手指的 pointerdown 落在舞台内，不需要逐指捕获。
  if (gesture.isIdle) {
    try { stageRef.value?.setPointerCapture(e.pointerId); } catch { /* 已释放 */ }
  }
  // 鼠标右键直接注入（移动端长按才走手势机）；左键/触摸继续交给状态机
  if (e.pointerType === 'mouse' && e.button === 2) {
    const p = toScreen(e.clientX, e.clientY);
    if (p) input({ action: 'click', ...p, button: 'right' });
    return;
  }
  handleGesture(gesture.down(e.pointerId, e.clientX, e.clientY, performance.now()), false);
  if (e.pointerType !== 'mouse') scheduleLongPress();
}

function onStagePointerMove(e: PointerEvent): void {
  handleGesture(gesture.move(e.pointerId, e.clientX, e.clientY), false);
}

function onStagePointerUp(e: PointerEvent): void {
  clearLongPress();
  handleGesture(gesture.up(e.pointerId, e.clientX, e.clientY, performance.now()), false);
}

/** pointercancel / 页面隐藏 / 断开：必须补抬左键，否则远端会一直处于按下状态 */
function onStagePointerCancel(): void {
  clearLongPress();
  handleGesture(gesture.cancel(), false);
}

// ---- 仿真鼠标控制器（独立悬浮）：拖 = 移动指针，单击 = 左键，长按 = 右键，中滚轮 = 滚动 ----
/** 指针箭头摆放：left/top = 热点 - 1px（箭头尖 = 注入坐标） */
function syncVmouseToPointer(): void {
  const at = cursorClientPoint();
  vmousePos.x = at.x - 1;
  vmousePos.y = at.y - 1;
}
/** 控制器按压状态：pointerId + 起点 + 是否已开始拖动 */
let ctrlPtr: { id: number; x: number; y: number; moved: boolean } | null = null;
let ctrlLongTimer: number | null = null;
/** 长按已触发右键：抬手时不能再补一次左键 */
let ctrlLongFired = false;
function onCtrlPointerDown(e: PointerEvent): void {
  // 指针捕获：手指拖出控制器边缘后 move/up 仍归它收（幽灵指针同坑）
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 已释放 */ }
  ctrlPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  ctrlLongFired = false;
  bumpCtrlActive();
  if (ctrlLongTimer) clearTimeout(ctrlLongTimer);
  ctrlLongTimer = window.setTimeout(() => {
    ctrlLongFired = true;
    vmClick('right');
  }, 460);
}
function onCtrlPointerMove(e: PointerEvent): void {
  if (!ctrlPtr || ctrlPtr.id !== e.pointerId) return;
  const dx = e.clientX - ctrlPtr.x;
  const dy = e.clientY - ctrlPtr.y;
  // 超过阈值才算拖动：手指按下的轻微抖动不能被当成移动，否则「点一下」会先飘走几像素
  if (!ctrlPtr.moved) {
    if (Math.hypot(dx, dy) <= 6) return;
    ctrlPtr.moved = true;
    if (ctrlLongTimer) {
      clearTimeout(ctrlLongTimer);
      ctrlLongTimer = null;
    }
  }
  ctrlPtr.x = e.clientX;
  ctrlPtr.y = e.clientY;
  movePointerBy(dx, dy);
}
function onCtrlPointerUp(e: PointerEvent): void {
  if (ctrlLongTimer) {
    clearTimeout(ctrlLongTimer);
    ctrlLongTimer = null;
  }
  const p = ctrlPtr;
  ctrlPtr = null;
  if (!p || p.id !== e.pointerId) return;
  // 没拖动、也没长按 → 单击左键（落点 = 指针当前位置，不是控制器位置）
  if (!p.moved && !ctrlLongFired) vmClick('left');
  ctrlLongFired = false;
}
/** 按压反馈 + 在指针当前位置单击 */
function vmClick(button: 'left' | 'right'): void {
  vmPress.value = button;
  window.setTimeout(() => { vmPress.value = ''; }, 160);
  clickAt(0, 0, button, true);
  buzz(button === 'right' ? 18 : 8);
}
/** 中滚轮：上下拖动 = 在指针位置注入滚轮 */
function onVmWheelDown(e: PointerEvent): void {
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 已释放 */ }
  vmWheelActive.value = true;
  vmWheelLastY = e.clientY;
}
function onVmWheelMove(e: PointerEvent): void {
  if (!vmWheelActive.value) return;
  const dy = e.clientY - vmWheelLastY;
  vmWheelLastY = e.clientY;
  if (Math.abs(dy) < 2) return;
  wheelAt(0, 0, Math.max(-400, Math.min(400, -Math.round(dy * 1.6))), true);
}
function onVmWheelUp(): void {
  vmWheelActive.value = false;
}

function toggleActions(): void {
  actionsOpen.value = !actionsOpen.value;
}
function doAction(fn: () => void): void {
  actionsOpen.value = false;
  fn();
}

// ---- 仿真鼠标控制器：4s 无操作变暗 ----
/** 交互发生时：立即点亮控制器并重置变暗计时（拖动/点按/侧栏操作都会调） */
function bumpCtrlActive(): void {
  ctrlDimmed.value = false;
  if (ctrlDimTimer) clearTimeout(ctrlDimTimer);
  ctrlDimTimer = window.setTimeout(() => { ctrlDimmed.value = true; }, BALL_DIM_MS);
}

function onStageWheel(e: WheelEvent): void {
  // Ctrl+滚轮 = 缩放（桌面端）
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    return;
  }
  // 缩放/铺满态下滚轮 = 平移（纵向），Shift 平移横向
  if (zoomMode.value === 'fill' || (zoomMode.value === 'free' && zoom.value > 1)) {
    if (e.shiftKey) panBy(-e.deltaY, 0);
    else panBy(0, -e.deltaY);
    return;
  }
  const p = toScreen(e.clientX, e.clientY);
  if (!p) return;
  const delta = Math.max(-400, Math.min(400, -Math.round(e.deltaY)));
  input({ action: 'wheel', ...p, delta });
}

// ================= 输入：键盘（直通 + 整串）=================
const KEY_MAP: Record<string, string> = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'esc', Delete: 'delete',
  Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
/** 修饰键 → 注入键名（Windows 上 Meta 就是 Win 键） */
const MOD_KEY_MAP: Record<string, string> = {
  Shift: 'shift', Control: 'ctrl', Alt: 'alt', Meta: 'win',
};
/** 组合键注入顺序：修饰键在前，Shift 次之 —— 远端按下顺序也按这个来 */
const MOD_ORDER = ['ctrl', 'alt', 'shift', 'win'];
/** 当前按住的修饰键 */
const heldMods = new Set<string>();
/** 本次「按住修饰键」期间出现过的修饰键（抬手时整组补发，Ctrl+Shift 靠它） */
let modChord: string[] = [];
/** 期间是否按过别的键（按过就不能再补发修饰键，否则会在远端多出一次切换） */
let modComboUsed = false;

/** 修饰键抬手：整组修饰键都松开、且期间没配别的键 → 补发一次组合（= 输入法切换那一下） */
function onKeyUp(e: KeyboardEvent): void {
  if (phase.value !== 'live') return;
  const mod = MOD_KEY_MAP[e.key];
  if (!mod) return;
  heldMods.delete(mod);
  if (heldMods.size > 0) return;
  if (!modComboUsed && modChord.length > 0) {
    const keys = MOD_ORDER.filter((k) => modChord.includes(k));
    if (keys.length) input({ action: 'key', keys });
  }
  modChord = [];
  modComboUsed = false;
}
function onKeyDown(e: KeyboardEvent): void {
  if (phase.value !== 'live') return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
  // 伪全屏（宿主不支持 Fullscreen API）下 Esc = 退出全屏，不能注入到被控端
  if (e.key === 'Escape' && immersive.value && !document.fullscreenElement) {
    e.preventDefault();
    immersive.value = false;
    setNativeImmersive(false);
    restartHudIdle();
    syncViewport();
    return;
  }
  // 注入时机：触屏只在全屏（沉浸）下抓键；桌面端本来就有物理键盘，窗口态也直通
  const capture = immersive.value || !isTouch;
  // 修饰键单按/组合：Shift 切中英、Ctrl+Shift 切输入法、Alt 唤菜单。
  // 组合是「按下即发」的原子键，修饰键本身不产生字符 —— 只能等抬手时补发一次。
  const mod = MOD_KEY_MAP[e.key];
  if (mod) {
    if (!capture) return;
    if (heldMods.size === 0) {
      modChord = [];
      modComboUsed = false;
    }
    heldMods.add(mod);
    if (!modChord.includes(mod)) modChord.push(mod);
    return;
  }
  if (heldMods.size > 0) modComboUsed = true; // 期间按过别的键 → 抬手时不能再补发修饰键
  // 修饰组合键：ctrl/alt/win + 任意键 → 组合键注入
  if (e.ctrlKey || e.altKey || e.metaKey) {
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    if (e.metaKey) keys.push('win');
    const k = e.key.length === 1 ? e.key.toLowerCase() : KEY_MAP[e.key];
    if (!k) return;
    keys.push(k);
    e.preventDefault();
    e.stopPropagation();
    input({ action: 'key', keys });
    return;
  }
  // 功能键/导航键直通
  if (KEY_MAP[e.key] || /^F\d{1,2}$/.test(e.key)) {
    if (!capture) return;
    e.preventDefault();
    input({ action: 'key', keys: [KEY_MAP[e.key] || e.key.toLowerCase()] });
    return;
  }
  // 普通字符（含中文输入法组字完成后的单发）：整串注入
  if (e.key.length === 1 && capture) {
    e.preventDefault();
    input({ action: 'type', text: e.key });
  }
}
function onKbCompositionEnd(e: CompositionEvent): void {
  if (phase.value !== 'live' || !e.data) return;
  input({ action: 'type', text: e.data });
}
/** 隐藏 input 边打边发：每敲一段就注入并清空，input 只当「唤出系统键盘的入口」用 */
function flushKb(el: HTMLInputElement | null | undefined): void {
  if (!el) return;
  const text = el.value;
  if (!text) return;
  el.value = '';
  input({ action: 'type', text });
}
function onKbInput(e: Event): void {
  if (kbComposing.value) return;
  flushKb(e.target as HTMLInputElement);
}
/** 编辑键直通（退格/回车/方向键必须逐次注入，攒成文本发过去语义就错了） */
const KB_KEY_MAP: Record<string, string> = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'esc', Delete: 'delete',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
function onKbKeydown(e: KeyboardEvent): void {
  if (kbComposing.value) return; // 输入法组字过程中的回车/退格属于候选词操作，不发
  const k = KB_KEY_MAP[e.key];
  if (!k) return;
  e.preventDefault();
  input({ action: 'key', keys: [k] });
}

// ================= 直通键盘 =================
/** 唤出系统键盘：聚焦隐藏 input（blur 自动收） */
async function openKeyboardPanel(): Promise<void> {
  kbDirect.value = true;
  await nextTick();
  kbInputRef.value?.focus(); // 手机上聚焦隐藏 input = 系统键盘弹出
}
function openClipboardPanel(): void {
  clipPanelOpen.value = true;
  filePanelOpen.value = false;
}
function openFilePanel(): void {
  filePanelOpen.value = true;
  clipPanelOpen.value = false;
  void refreshFiles();
}
/** 诊断：互斥打开其它面板，避免叠在一起 */
function openDiag(): void {
  diagOpen.value = true;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
}
function toggleAudio(): void {
  audioOn.value = !audioOn.value;
  send({ type: 'audio.state', on: audioOn.value });
}
/**
 * 手动重试低延迟通道：兼容模式是「WebRTC 12 秒没出画面」的降级结果，掉下来就不会自己回去。
 * 服务端收到后把会话原地升回 webrtc（采集层没就绪会回 webrtc.retry{ok:false} 说明原因），
 * 成功则回 session.mode:webrtc → 这里重建 PeerConnection 重新走 offer/answer。
 */
function retryWebRtc(): void {
  if (mode.value !== 'jpeg' || phase.value !== 'live') return;
  send({ type: 'use.webrtc' });
}

// ================= 多显示器切换 =================
function displayLabel(d: RcDisplayInfo): string {
  return `${(d.primary ? '主屏 · ' : '') + d.label} ${d.w}×${d.h}`;
}
/** 工具栏下拉用短标签：手机上长文案会把整条工具栏挤爆 */
function displayShortLabel(d: RcDisplayInfo, i: number): string {
  if (d.id === 'virtual') return '整个桌面';
  return `${d.primary ? '主屏' : `屏 ${i + 1}`} ${d.w}×${d.h}`;
}
function selectDisplay(id: string): void {
  if (!id || id === currentDisplay.value) return;
  // 换屏后宽高比变了：把缩放交还给自动选档（否则上一块屏的放大/裁剪会留在新画面上）
  zoomTouchedByUser = false;
  pan.x = 0;
  pan.y = 0;
  // 乐观更新（host 切换成功后会回发 displays.info 校准），JPEG 模式服务端直接切
  currentDisplay.value = id;
  send({ type: 'display.select', displayId: id });
}

/**
 * 主动要一次显示器清单（2026-10-26 报障「显示器下拉改着改着就没了」）。
 *
 * 清单原来只由被控端在协商完成后单向推一次：推丢了 / 被控端渲染层没就绪 /
 * 会话升级成 WebRTC 后重新采集 —— 控制端就永远看不到「显示器」入口。
 * 改成控制端可以主动要，服务端再转给被控端重新枚举。
 */
let displaysRequested = 0;
function requestDisplays(): void {
  if (linkKind.value !== 'desktop') return;
  if (phase.value !== 'live' || !sessionId) return;
  displaysRequested += 1;
  send({ type: 'displays.refresh', sessionId });
}
/** 进会话后等一会儿：清单还没到就主动要一次（给被控端推送留时间） */
function askDisplaysIfEmpty(delay = 1200): void {
  window.setTimeout(() => {
    if (phase.value === 'live' && !displays.value.length) requestDisplays();
  }, delay);
}

/**
 * 只读会话里请求操作权限：转给被控端本人确认（不自动放行、不重连）。
 * 被控端同意后服务端会回 session.input {allowed:true}，底部只读条随之消失。
 */
function requestInput(): void {
  if (inputRequesting.value || inputAllowed.value) return;
  inputRequesting.value = true;
  send({ type: 'input.request' });
  ElMessage.info('已请求操作权限，等待被控端确认');
  window.setTimeout(() => { inputRequesting.value = false; }, 8000);
}
/** 控制端自己切「仅观看」（被控端授予情况不变，只影响本端是否发输入） */
function toggleViewOnly(): void {
  const next = !viewOnlySelf.value;
  send({ type: 'input.set', viewOnly: next });
  ElMessage.info(next ? '已切换为仅观看（不再发送操作）' : '已恢复操控');
}
/** 应用服务端下发的权限状态（granted / resume / session.input 共用一套字段） */
function applyInputState(raw: unknown): void {
  const st = (raw || {}) as { granted?: boolean; viewOnly?: boolean };
  inputGranted.value = st.granted !== false;
  viewOnlySelf.value = st.viewOnly === true;
  inputRequesting.value = false;
}

async function sendClipboard(): Promise<void> {
  const t = clipText.value;
  if (!t) return;
  clipBusy.value = true;
  send({ type: 'clipboard.set', text: t.slice(0, 100_000) });
  // 成功/失败提示由 clipboard.done 回执驱动；这里仅兜底防卡死
  window.setTimeout(() => {
    clipBusy.value = false;
  }, 6000);
}
async function pullClipboard(): Promise<void> {
  clipBusy.value = true;
  send({ type: 'clipboard.get' });
  window.setTimeout(() => {
    if (clipBusy.value) {
      clipBusy.value = false;
      ElMessage.warning('被控端剪贴板读取超时');
    }
  }, 8000);
}

// ================= 文件收发 =================
function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
async function refreshFiles(): Promise<void> {
  if (!sessionToken) return;
  try {
    const res = await fetch(apiOf(base, `/file/list?token=${encodeURIComponent(sessionToken)}`));
    const body = await res.json();
    if (body.error) {
      ElMessage.warning(body.error);
      return;
    }
    files.value = (body.data || []) as FileEntry[];
  } catch {
    ElMessage.warning('文件列表获取失败');
  }
}
async function uploadFiles(list: FileList | File[]): Promise<void> {
  if (!sessionToken || fileBusy.value) return;
  const arr = [...list].filter((f) => f.size <= RC_FILE_MAX);
  if (!arr.length) {
    ElMessage.warning('没有可发送的文件（单个 ≤500MB）');
    return;
  }
  fileBusy.value = true;
  try {
    for (const f of arr) {
      const res = await fetch(
        apiOf(base, `/file/upload?token=${encodeURIComponent(sessionToken)}&name=${encodeURIComponent(f.name)}`),
        { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f },
      );
      const body = await res.json();
      if (body.error) ElMessage.warning(`${f.name}: ${body.error}`);
    }
    ElMessage.success('发送完成');
    await refreshFiles();
  } catch {
    ElMessage.error('发送失败');
  } finally {
    fileBusy.value = false;
  }
}
function onFilePick(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void uploadFiles(input.files);
  input.value = '';
}
function onFileDrop(e: DragEvent): void {
  dragOver.value = false;
  fileDrag.value = false;
  if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
}
function onPanelFileDrop(e: DragEvent): void {
  fileDrag.value = false;
  if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
}
async function downloadFile(name: string): Promise<void> {
  if (!sessionToken) return;
  try {
    const res = await fetch(apiOf(base, `/file/download?token=${encodeURIComponent(sessionToken)}&name=${encodeURIComponent(name)}`));
    const body = await res.json().catch(() => null);
    if (body?.error) {
      ElMessage.warning(body.error);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    ElMessage.error('下载失败');
  }
}

// ================= 全屏沉浸 + 悬浮球 =================
/** 进全屏默认「适应窗口」：整块桌面（含任务栏）完整可见 —— 铺满是可选的，不是默认 */
function applyImmersiveZoom(): void {
  pan.x = 0;
  pan.y = 0;
}
/** App 壳（Capacitor）里连系统状态栏一起隐藏；桌面/浏览器没有这个插件，静默跳过 */
function setNativeImmersive(on: boolean): void {
  try {
    const cap = (window as unknown as {
      Capacitor?: { Plugins?: Record<string, { set?: (o: { on: boolean }) => Promise<void> }> };
    }).Capacitor;
    void cap?.Plugins?.RcImmersive?.set?.({ on });
  } catch { /* 非 App 宿主忽略 */ }
}
/** 触屏全屏时锁横屏（与 UU 远控一致）；不支持 orientation.lock 的环境静默跳过 */
async function lockLandscape(on: boolean): Promise<void> {
  if (!isTouch) return;
  try {
    const o = (window.screen as unknown as { orientation?: { lock?: (v: string) => Promise<void>; unlock?: () => void } }).orientation;
    if (on) await o?.lock?.('landscape');
    else o?.unlock?.();
  } catch { /* 桌面/不支持：保持当前方向 */ }
}
async function toggleFullscreen(): Promise<void> {
  const el = stageRef.value;
  if (!el) return;
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
      applyImmersiveZoom();
      void lockLandscape(true);
    } else {
      await document.exitFullscreen();
      void lockLandscape(false);
    }
  } catch {
    // iOS Safari 不支持 Fullscreen API：降级为「伪全屏」（本页是 bare 路由，藏 UI 即可）
    immersive.value = !immersive.value;
    setNativeImmersive(immersive.value);
    if (immersive.value) {
      applyImmersiveZoom();
      void lockLandscape(true);
    } else {
      void lockLandscape(false);
    }
    restartHudIdle();
  }
  syncViewport();
}
function onFullscreenChange(): void {
  immersive.value = !!document.fullscreenElement;
  setNativeImmersive(immersive.value);
  if (immersive.value) applyImmersiveZoom();
  else void lockLandscape(false);
  restartHudIdle();
  if (!immersive.value) {
    kbDirect.value = false;
    clipPanelOpen.value = false;
    filePanelOpen.value = false;
  }
  window.setTimeout(syncViewport, 60);
}
// ---- 生命周期 ----
function send(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* ignore */ }
  }
}
function cleanupSocket(): void {
  if (ws) {
    try {
      ws.close();
    } catch { /* ignore */ }
    ws = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}
function disconnect(): void {
  // 先补抬可能按下的左键，再关通道：否则被控端会一直认为鼠标按着
  handleGesture(gesture.cancel(), false);
  handleGesture(padGesture.cancel(), true);
  endedReason.value = '已断开连接';
  cleanup();
  phase.value = 'ended';
}
function cleanup(): void {
  stopConfirmWatch();
  pendingConfirmId = '';
  pendingRecovering = false;
  cleanupSocket();
  teardownWebRtc();
  if (videoRef.value) videoRef.value.srcObject = null;
  if (jpegBitmap) {
    jpegBitmap.close();
    jpegBitmap = null;
  }
  sessionToken = '';
  sessionId = '';
  hasFrame.value = false;
  // 几何自愈状态随会话清零，避免下一次连接带着上次的来源/次数
  screenSource.value = '';
  screenReqAttempts = 0;
  if (screenReqTimer) {
    clearTimeout(screenReqTimer);
    screenReqTimer = null;
  }
  audioOn.value = false;
  vmousePos.x = 0;
  vmousePos.y = 0;
  displays.value = [];
  currentDisplay.value = '';
  inputGranted.value = true;
  viewOnlySelf.value = false;
  inputRequesting.value = false;
  linkKind.value = 'desktop';
  androidSerial.value = '';
  androidName.value = '';
  iceServers.value = [];
  zoomMode.value = 'fill';
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
  kbDirect.value = false;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  immersive.value = false;
  setNativeImmersive(false);
  mouseVisible.value = false;
  gesture.reset();
  padGesture.reset();
  actionsOpen.value = false;
}
function onResize(): void {
  syncViewport();
}
/** 切后台/失焦：手指不会再有 up 事件，主动收尾避免远端按键卡住 */
function onPageLeave(): void {
  clearLongPress();
  // 失焦时 keyup 可能永远不来：清掉修饰键记账，避免下次按下被当成「还在按住」
  heldMods.clear();
  modChord = [];
  modComboUsed = false;
  kbDirect.value = false;
  handleGesture(gesture.cancel(), false);
  handleGesture(padGesture.cancel(), true);
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointermove', onHudPointerMove, true);
  window.addEventListener('compositionend', onKbCompositionEnd, true);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onPageLeave);
  window.addEventListener('blur', onPageLeave);
  syncViewport();
  syncNativeFromScreen();
  // 已保存的被控端优先于 location.origin（App 壳里 origin 是 localhost，填了也连不上）：
  // 默认取最近用过的那台，地址和授权码一起填好，打开就能直接点「连接」。
  // 旧版只存了地址的 rc:lastHost 由 parseRcPeers 迁移进来，不会丢。
  readPeers();
  const lastPeer = peers.value[0];
  if (lastPeer) {
    form.host = lastPeer.host;
    if (lastPeer.code) form.code = lastPeer.code;
  }
  // 扫码/邀请链接直达：?code= 授权码 → 预填并直接发起配对（被控端确认弹窗照常把关）。
  // 裸路径引导（router/barePathHash.ts）会把 ?code= 原样带进 hash query。
  // ★ 必须**先于**记住的授权码生效：扫到的新码是用户此刻的意图，不能被上次的旧码顶掉
  //   （此前条件里带 `!form.code`，配上"记住授权码"后会让扫码/邀请链接静默不配对）。
  const qc = route?.query?.code;
  if (typeof qc === 'string' && qc && phase.value === 'setup') {
    form.code = qc;
    void pair();
  }
});
onBeforeUnmount(() => {
  stageRO?.disconnect();
  stageRO = null;
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('pointermove', onHudPointerMove, true);
  if (hudIdleTimer) {
    window.clearTimeout(hudIdleTimer);
    hudIdleTimer = null;
  }
  window.removeEventListener('compositionend', onKbCompositionEnd, true);
  window.removeEventListener('resize', onResize);
  document.removeEventListener('visibilitychange', onPageLeave);
  window.removeEventListener('blur', onPageLeave);
  stopScan();
  cleanup();
});
</script>

<style scoped>
.rc-page { position: fixed; inset: 0; background: #101418; color: #e6eaf0; font-family: inherit; z-index: 100; }
.rc-setup { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
.rc-card { width: min(420px, 100%); background: #171c23; border: 1px solid #262d38; border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
.rc-brand-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.rc-close { background: transparent; border: 1px solid #2a323e; color: #8a94a3; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 14px; line-height: 1; flex-shrink: 0; }
.rc-close:hover { color: #e6eaf0; border-color: #4c8dff; }
.rc-tabs { display: flex; gap: 6px; background: #10151b; border: 1px solid #262d38; border-radius: 10px; padding: 4px; margin-bottom: 6px; }
.rc-tab { flex: 1; background: transparent; border: none; color: #8a94a3; border-radius: 7px; padding: 8px 0; font-size: 13.5px; cursor: pointer; }
.rc-tab.active { background: #2f6bff; color: #fff; }
.rc-host-qr { display: flex; justify-content: center; padding: 6px 0; }
.rc-host-qr img { width: 190px; height: 190px; border-radius: 10px; background: #fff; padding: 8px; box-sizing: border-box; }
.rc-host-line { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
.rc-k2 { width: 88px; flex-shrink: 0; color: #8a94a3; font-size: 12.5px; }
.rc-host-code { font-size: 19px; font-weight: 700; letter-spacing: 3px; color: #fff; }
.rc-host-addr { word-break: break-all; color: #c7d2e0; }
.rc-host-mode { color: #c7d2e0; }
.rc-host-ipsel { flex: 1; min-width: 0; background: #10151b; color: inherit; border: 1px solid #2a323e; border-radius: 8px; padding: 6px 8px; font-size: 13px; }
.rc-host-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rc-host-actions .rc-btn { flex: 1; min-width: 96px; }
.rc-brand { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.rc-logo { font-size: 20px; font-weight: 700; }
.rc-sub { font-size: 13px; color: #8a94a3; }
.rc-label { font-size: 12px; color: #8a94a3; }
.rc-input { background: #10151b; border: 1px solid #2a323e; border-radius: 8px; padding: 10px 12px; color: inherit; font-size: 14px; outline: none; }
.rc-input:focus { border-color: #4c8dff; }
/* 已保存的被控端下拉：比输入框矮一档，视觉上从属于下面的地址输入 */
.rc-peer-sel { padding: 8px 10px; font-size: 13px; color: #cfd7e3; }
.rc-code { letter-spacing: 2px; font-size: 18px; text-align: center; }
.rc-btn { border: 1px solid #2a323e; background: #1d242e; color: inherit; border-radius: 8px; padding: 10px 14px; font-size: 14px; cursor: pointer; }
.rc-btn:disabled { opacity: 0.5; cursor: default; }
.rc-btn-primary { background: #2f6bff; border-color: #2f6bff; }
.rc-btn-primary:disabled { background: #2f6bff55; }
.rc-hint { font-size: 12px; color: #6d7684; line-height: 1.6; }
.rc-end-reason { background: #2a1f22; border: 1px solid #4a3038; color: #f0b6c2; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.rc-waiting { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 0 6px; }
.rc-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #2a323e; border-top-color: #4c8dff; animation: rc-spin 0.9s linear infinite; }
@keyframes rc-spin { to { transform: rotate(360deg); } }
.rc-wait-title { font-size: 15px; font-weight: 600; }
.rc-wait-sub { font-size: 12px; color: #8a94a3; }

/* touch-action:none 必须挂在舞台本身：手指落在画面外的黑边上时，手势归舞台接管，
   否则浏览器会当成滚动/缩放而把 pointermove 变成 pointercancel —— 表现就是「滑动没反应」 */
.rc-stage { position: absolute; inset: 0; overflow: hidden; background: #000; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
/* ★ 显示矩形由 JS 自算（mediaStyle 内联定位），这里只留外观——不再用 inset:100% + contain，
   否则 letterbox 黑边会算进坐标映射（点边缘会偏）。 */
.rc-video { position: absolute; object-fit: fill; touch-action: none; background: #000; }
/* ===== 指针箭头（真实注入坐标）+ 独立悬浮的仿真鼠标控制器（2026-10-31 对标 UU） =====
   箭头 = 热点 = 注入坐标；控制器固定在右侧中部，只负责「拖/点/长按/滚」，
   两者分离 —— 控制器不跟着指针跑，指针就摸得到包括最底部任务栏在内的任何位置。 */
.rc-pointer { position: absolute; z-index: 21; pointer-events: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
.rc-vmctrl { position: absolute; right: 84px; top: 50%; transform: translateY(-50%); z-index: 24; width: 64px; padding: 8px 0 6px; border-radius: 18px; background: rgba(14,18,26,0.42); border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,0.42); display: flex; flex-direction: column; align-items: center; gap: 5px; touch-action: none; cursor: grab; transition: opacity 0.4s, background 0.2s, border-color 0.2s; user-select: none; -webkit-user-select: none; }
.rc-vmctrl.dim { opacity: 0.42; }
.rc-vmctrl.press { background: rgba(47,107,255,0.26); border-color: rgba(124,178,255,0.62); }
.rc-vm-icon { width: 26px; height: 36px; pointer-events: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45)); }
.rc-vm-wheel { position: relative; width: 24px; height: 28px; border-radius: 8px; background: rgba(10,14,20,0.86); border: 1px solid rgba(255,255,255,0.18); cursor: ns-resize; overflow: hidden; touch-action: none; }
.rc-vm-wheel i { position: absolute; left: 2px; right: 2px; top: 32%; height: 36%; border-radius: 4px; background: rgba(150,185,240,0.75); transition: top 0.12s; }
.rc-vm-wheel.active i { background: rgba(190,215,255,0.95); }
.rc-vm-hint { font-size: 9px; line-height: 1; color: rgba(220,230,245,0.62); letter-spacing: 0.4px; pointer-events: none; white-space: nowrap; }

/* ===== 侧栏工具栏（仅触屏控制端，2026-10-31 对标 UU）=====
   悬浮球删掉后入口固定贴右侧：图标 + 中文小字，纵向一排。
   按钮本身不浮在画面中间，挡不住要点的内容；桌面端没有这条栏。 */
.rc-sidebar { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 26; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: 16px; background: rgba(12,16,22,0.42); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(10px); box-shadow: 0 8px 26px rgba(0,0,0,0.42); }
.rc-sbtn { width: 52px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 0 6px; border: 0; border-radius: 11px; background: transparent; color: #cfd8e6; cursor: pointer; }
.rc-sbtn:active { background: rgba(255,255,255,0.14); }
.rc-sbtn.on { background: rgba(47,107,255,0.34); color: #fff; }
.rc-sbtn.danger { color: #ff9aa8; }
.rc-sbtn-ic { font-size: 17px; line-height: 1; }
.rc-sbtn-lb { font-size: 10.5px; line-height: 1.1; white-space: nowrap; }
/* 直通键盘隐藏 input（视觉上不可见，只为唤系统键盘收字符） */
.rc-kb-input { position: absolute; left: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; z-index: -1; }
.rc-tap-fx { position: absolute; z-index: 5; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; pointer-events: none; border: 2px solid rgba(124,178,255,0.95); box-shadow: 0 0 0 8px rgba(47,107,255,0.18); animation: rc-fx 0.36s ease-out forwards; }
.rc-tap-fx.right { border-color: rgba(255,196,120,0.95); box-shadow: 0 0 0 8px rgba(255,170,60,0.16); }
@keyframes rc-fx { from { opacity: 1; transform: scale(0.55); } to { opacity: 0; transform: scale(1.35); } }

/* 顶部状态胶囊：只留状态 + 显示器/画质，按钮统一收进右侧操作栏 */
.rc-topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px; padding: 10px 14px; padding-right: 60px; background: linear-gradient(to bottom, rgba(5,8,12,0.72), rgba(5,8,12,0)); transition: opacity 0.25s; z-index: 5; pointer-events: none; }
.rc-topbar > * { pointer-events: auto; }
/* 只读观看底栏：常驻、可恢复（不重连），与「点不动」区分开 */
.rc-readonly { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 26; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(28,21,9,0.94); border: 1px solid rgba(240,163,58,0.45); backdrop-filter: blur(12px); }
.rc-ro-dot { width: 8px; height: 8px; border-radius: 50%; background: #f0a33a; box-shadow: 0 0 0 4px rgba(240,163,58,0.18); flex-shrink: 0; }
.rc-ro-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 11.5px; color: #f4d9b0; line-height: 1.4; }
.rc-ro-text b { color: #ffce85; font-weight: 600; font-size: 12.5px; }
.rc-readonly button { border: 0; border-radius: 9px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; background: #f0a33a; color: #1a1200; flex-shrink: 0; }
.rc-readonly button:disabled { opacity: .6; cursor: default; }
.rc-topbar.hidden { opacity: 0; pointer-events: none; }
.rc-topback { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(20,26,34,0.78); border: 1px solid rgba(255,255,255,0.1); color: #e6eaf0; backdrop-filter: blur(10px); cursor: pointer; flex-shrink: 0; }
.rc-topback:hover { border-color: #4c8dff; color: #bcd2ff; }
.rc-dot { width: 7px; height: 7px; border-radius: 50%; background: #8a94a3; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(138,148,163,0.16); }
.rc-dot.webrtc { background: #3ddc84; box-shadow: 0 0 0 3px rgba(61,220,132,0.18); }
.rc-dot.jpeg { background: #f5b74e; box-shadow: 0 0 0 3px rgba(245,183,78,0.18); }
.rc-status { font-size: 12px; color: #c7d2e0; flex: 1 1 auto; min-width: 42px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.rc-tbtn { background: rgba(23,28,35,0.8); border: 1px solid #2a323e; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
.rc-tbtn:hover { border-color: #4c8dff; }
.rc-select { background: rgba(23,28,35,0.86); color: inherit; border: 1px solid #2a323e; border-radius: 8px; padding: 5px 8px; font-size: 13px; flex-shrink: 0; max-width: 30vw; }
.rc-select-disp { max-width: 44vw; min-width: 84px; }

/* 操作抽屉 */
/* 操作面板贴着触发按钮展开（2026-10-31 实报「点完按钮面板跑到屏幕中间，太远」）：
   桌面端从顶栏 ☰ 下方弹出，触屏端从侧栏「操作」左侧弹出。 */
.rc-sheet { position: absolute; right: 14px; top: 58px; width: min(340px, 80vw); max-height: calc(100vh - 120px); overflow-y: auto; background: rgba(16,21,28,0.94); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 12px; z-index: 11; backdrop-filter: blur(18px); box-shadow: 0 18px 48px rgba(0,0,0,0.5); }
.rc-sheet.touch { right: 78px; top: 50%; transform: translateY(-50%); max-height: 76vh; }
.rc-sheet-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; margin-bottom: 10px; padding: 0 2px; }
.rc-sheet-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.rc-act { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; border-radius: 12px; border: none; background: rgba(255,255,255,0.05); color: #dbe3ee; font-size: 11px; cursor: pointer; transition: background 0.16s; }
.rc-act b { font-size: 18px; font-weight: 400; line-height: 1; }
.rc-act:hover { background: rgba(255,255,255,0.11); }
.rc-act.danger { color: #ff9aa8; }
.rc-sheet-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.07); }
.rc-sheet-label { font-size: 11px; color: #7f8b9b; }
.rc-chip { border: 1px solid rgba(255,255,255,0.12); background: transparent; color: #b9c2cf; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; }
.rc-chip.active { background: rgba(47,107,255,0.85); border-color: transparent; color: #fff; }

/* 首帧等待层：黑屏时给出明确状态，并吃掉误触（此时画面还没有，点了也点不准） */
.rc-wait-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 3; pointer-events: none; background: #000; text-align: center; padding: 24px; }
/* 播放兜底层：video 被自动播放策略暂停时显示（底层首帧作封面可见），点按手势 play */
.rc-play-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 6; background: rgba(0,0,0,0.35); }
.rc-play-btn { width: 96px; height: 96px; border-radius: 50%; background: rgba(23,28,35,0.9); border: 2px solid #4c8dff; color: #e6eaf0; font-size: 40px; display: flex; align-items: center; justify-content: center; line-height: 1; padding-left: 8px; }
.rc-geo-overlay { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px 10px; max-width: 92%; padding: 10px 16px; border-radius: 10px; background: rgba(16,20,24,0.94); border: 1px solid #2a323e; color: #e6eaf0; font-size: 13px; z-index: 6; pointer-events: none; text-align: center; }
.rc-geo-sub { color: #8a94a3; font-size: 12px; }
.rc-diag { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
.rc-diag-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.rc-diag-row span { color: #8a94a3; white-space: nowrap; }
.rc-diag-row b { color: #e6eaf0; font-weight: 500; text-align: right; word-break: break-all; }


.rc-panel { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(480px, 92%); background: #171c23; border: 1px solid #2a323e; border-radius: 12px; padding: 12px; z-index: 10; }
.rc-panel-wide { width: min(560px, 94%); }
.rc-panel-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.rc-panel-x { background: transparent; border: none; color: #8a94a3; cursor: pointer; font-size: 14px; }
.rc-panel-text { width: 100%; background: #10151b; border: 1px solid #2a323e; border-radius: 8px; color: inherit; padding: 8px 10px; font-size: 14px; resize: none; outline: none; box-sizing: border-box; }
.rc-panel-actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
.rc-panel-actions .rc-btn { padding: 7px 12px; }
.rc-busy { color: #8a94a3; font-size: 13px; }

.rc-file-drop { border: 1.5px dashed #2a323e; border-radius: 8px; padding: 14px; text-align: center; font-size: 13px; color: #8a94a3; cursor: pointer; margin-bottom: 10px; }
.rc-file-drop.over { border-color: #4c8dff; color: #9dc0ff; background: #16233a; }
.rc-file-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.rc-file-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 2px; }
.rc-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-file-size { color: #6d7684; font-size: 12px; flex-shrink: 0; }
.rc-file-empty { color: #6d7684; font-size: 13px; text-align: center; padding: 10px; }
.rc-file-item .rc-tbtn { padding: 3px 10px; font-size: 12px; }

.rc-drop-hint { position: absolute; inset: 12px; border: 2px dashed #4c8dff; border-radius: 14px; background: rgba(22, 35, 58, 0.72); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #bcd2ff; z-index: 12; pointer-events: none; }

/* 扫码浮层（setup 阶段）：摄像头取景 + jsQR 解码 */
.rc-scan { position: fixed; inset: 0; background: rgba(8, 11, 15, 0.86); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
.rc-scan-box { width: min(440px, 100%); background: #171c23; border: 1px solid #2a323e; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.rc-scan-video { width: 100%; max-width: 400px; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; background: #000; }
.rc-scan-tip { font-size: 13px; color: #8a94a3; text-align: center; }
.rc-scan-err { font-size: 12.5px; color: #f0b6c2; line-height: 1.6; text-align: center; }
</style>
