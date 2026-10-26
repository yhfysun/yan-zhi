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
            <input v-model="form.host" class="rc-input" placeholder="http://192.168.1.100:3001（同源时无需修改）" spellcheck="false" />
            <label class="rc-label">授权码</label>
            <input
              v-model="form.code" class="rc-input rc-code" placeholder="被控端「设置 → 局域网」或插件页查看"
              spellcheck="false" autocomplete="off" @keyup.enter="pair" />
            <button class="rc-btn rc-btn-primary" :disabled="pairing || !form.code.trim()" @click="pair">
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
      @touchstart.passive="markTouch" @touchmove.passive="markTouch" @touchend.passive="markTouch"
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

      <!-- 自绘光标 + 点按反馈：比跟随帧更跟手，单击时给一个明确的光圈 -->
      <div v-if="linkKind !== 'android'" class="rc-cursor" :class="{ pressed: cursorPressed }" :style="cursorStyle">
        <svg width="26" height="34" viewBox="0 0 18 24"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.5 L10 13 L16 13 Z" fill="#fff" stroke="#111" stroke-width="1.2"/></svg>
      </div>
      <div v-if="fx.visible" class="rc-tap-fx" :class="fx.button" :style="fxStyle"></div>

      <!-- 顶部状态胶囊：只留状态与显示器/画质，操作入口统一收到右侧栏 -->
      <div class="rc-topbar" :class="{ hidden: immersive && !toolbarPeek }" @pointerdown.stop>
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
      </div>

      <!-- 右侧操作栏（UU 式）：高频功能常驻，其余收进「操作」面板 -->
      <div class="rc-rail" :class="{ hidden: immersive && !toolbarPeek }" @pointerdown.stop>
        <button class="rc-rail-btn" :class="{ active: actionsOpen }" @click.stop="actionsOpen = !actionsOpen">
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.6"/><rect x="14" y="4" width="6" height="6" rx="1.6"/><rect x="4" y="14" width="6" height="6" rx="1.6"/><rect x="14" y="14" width="6" height="6" rx="1.6"/></svg>
          <span>操作</span>
        </button>
        <button v-if="linkKind !== 'android'" class="rc-rail-btn" :class="{ active: mouseMode }" @click.stop="toggleMouseMode">
          <svg viewBox="0 0 24 24"><path d="M6 3l11 8.5-5 .8 2.8 5.6-2.3 1.1-2.8-5.6L6 17z"/></svg>
          <span>触控板</span>
        </button>
        <button v-if="linkKind !== 'android'" class="rc-rail-btn" @click.stop="openKeyboardPanel">
          <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2.4"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 13.5h10" stroke-width="1.8" stroke-linecap="round"/></svg>
          <span>键盘</span>
        </button>
        <button v-if="linkKind !== 'android'" class="rc-rail-btn" @click.stop="rightClickAtLast">
          <svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4.5V9h5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span>右键</span>
        </button>
        <button class="rc-rail-btn" @click.stop="toggleZoom">
          <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span>{{ zoomLabel }}</span>
        </button>
        <button class="rc-rail-btn" @click.stop="toggleFullscreen">
          <svg viewBox="0 0 24 24"><path d="M5 10V5h5M19 14v5h-5M5 14v5h5M19 10V5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span>{{ immersive ? '退出' : '全屏' }}</span>
        </button>
      </div>

      <!-- 操作面板（底部抽屉）：低频功能都在这里 -->
      <div v-if="actionsOpen" class="rc-sheet" @pointerdown.stop @click.stop>
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
          <button class="rc-act" @click="doAction(toggleMouseMode)">
            <b>◉</b><span>{{ mouseMode ? '切到触控' : '切到指针' }}</span>
          </button>
          <button class="rc-act" @click="doAction(toggleZoom)">
            <b>⛶</b><span>{{ zoomLabel }}</span>
          </button>
          <button class="rc-act" @click="doAction(toggleFullscreen)">
            <b>🖥</b><span>{{ immersive ? '退出全屏' : '全屏' }}</span>
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

      <!-- 大触控板（指针模式）：拖动移动指针，点按左键，长按右键，双指上下滑滚动 -->
      <div v-if="mouseMode && !immersive && !kbPanelOpen && !clipPanelOpen && !filePanelOpen" class="rc-pad" :class="{ collapsed: padCollapsed }">
        <div class="rc-pad-head">
          <span>触控板</span>
          <button class="rc-pad-mini" @pointerdown.stop @click.stop="padCollapsed = !padCollapsed">
            {{ padCollapsed ? '展开' : '收起' }}
          </button>
        </div>
        <template v-if="!padCollapsed">
          <div
            class="rc-pad-body" :class="{ active: padActive }"
            @pointerdown.stop="onPadPointerDown" @pointermove.stop="onPadPointerMove"
            @pointerup.stop="onPadPointerUp" @pointercancel.stop="onPadPointerCancel"
          >
            <svg class="rc-pad-glyph" viewBox="0 0 120 120" aria-hidden="true">
              <rect x="34" y="14" width="52" height="76" rx="26" fill="none" stroke="currentColor" stroke-width="3.2"/>
              <path d="M60 22v26" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
              <path d="M56 20l4-5 4 5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
              <path d="M56 52l4 5 4-5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>
              <rect x="46" y="58" width="12" height="18" rx="6" fill="currentColor" opacity=".22"/>
              <path d="M22 96l8-6M90 96l-8-6M60 82v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".45"/>
            </svg>
            <div v-if="padActive" class="rc-pad-dot" :style="{ left: `${padTouch.x}px`, top: `${padTouch.y}px` }"></div>
            <div class="rc-pad-hint">拖动移动指针 · 点按左键 · 双指滚动 · 长按右键</div>
          </div>
          <div class="rc-pad-btns">
            <button class="rc-pad-btn" @pointerdown.stop @click.stop="padClick('left')">左键</button>
            <div
              class="rc-pad-scroll" title="上下拖动滚动"
              @pointerdown.stop.prevent="onScrollStripDown" @pointermove.stop.prevent="onScrollStripMove"
              @pointerup.stop.prevent="onScrollStripUp" @pointercancel.stop.prevent="onScrollStripUp"
            >
              <span class="rc-pad-scroll-up">▲</span>
              <span class="rc-pad-scroll-bar"></span>
              <span class="rc-pad-scroll-down">▼</span>
            </div>
            <button class="rc-pad-btn" @pointerdown.stop @click.stop="padClick('right')">右键</button>
          </div>
        </template>
      </div>

      <!-- 键盘输入面板（软键盘实时注入：打字即发送，退格/回车/方向键直通） -->
      <div v-if="kbPanelOpen" class="rc-panel rc-panel-kb" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">键盘输入<button class="rc-panel-x" @click="kbPanelOpen = false">✕</button></div>
        <textarea
          ref="kbInputRef" v-model="kbText" class="rc-panel-text" rows="2"
          placeholder="点这里调出键盘，边打边发到被控端"
          @input="onKbInput" @keydown="onKbKeydown"
          @compositionstart="kbComposing = true" @compositionend="kbComposing = false"
        ></textarea>
        <div class="rc-panel-actions">
          <button class="rc-btn rc-btn-primary" @click="sendKbText">发送剩余文字</button>
        </div>
      </div>

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
import { parseRcScanPayload } from '../utils/rcScan';
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

const phase = ref<Phase>('setup');
const pairing = ref(false);
const endedReason = ref('');
const mode = ref<'' | 'webrtc' | 'jpeg'>('');
/** 是否已收到第一帧（两种通道都算）：用来把「还在连接」和「黑屏故障」区分开 */
const hasFrame = ref(false);
const screen = ref<ScreenRect>({ x: 0, y: 0, w: 0, h: 0 });
const immersive = ref(false);
const toolbarPeek = ref(false);
const kbPanelOpen = ref(false);
const kbText = ref('');
const kbInputRef = ref<HTMLTextAreaElement>();
/** 中文输入法组字中：拼音阶段不发，组字完成后由随后的 input 事件整串发 */
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
const zoomMode = ref<'fit' | 'fill' | 'free'>('fit');
/** UU 式虚拟鼠标：拖动移动指针、点按左键、长按右键，滚轮用双指滑动 */
const mouseMode = ref(false);
const mousePos = reactive({ x: 0, y: 0 });
const actionsOpen = ref(false);
const padCollapsed = ref(false);
const padActive = ref(false);
const padTouch = reactive({ x: 0, y: 0 });
const cursorPressed = ref(false);
/** 点按反馈（显示坐标）：单击 / 右键时给一个短暂光圈 */
const fx = reactive({ visible: false, x: 0, y: 0, button: 'left' as 'left' | 'right' });
const QUALITY_OPTIONS = [
  { value: 'smooth' as const, label: '流畅' },
  { value: 'balance' as const, label: '均衡' },
  { value: 'sharp' as const, label: '清晰' },
];
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });

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
const zoomLabel = computed(() => (zoomMode.value === 'fit' ? '铺满' : zoomMode.value === 'fill' ? '1:1' : '适应'));

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

/** 扫码按钮只给触屏设备：桌面 /remote 页上「电脑摄像头扫另一块屏」是伪需求，防误解 */
const isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
// 触屏默认指针模式（UU 同款）：手指不挡目标、点按不飘；需要直接点画面时右侧栏一键切回触控
if (isTouch) mouseMode.value = true;
const stageRef = ref<HTMLElement>();
const videoRef = ref<HTMLVideoElement>();
const canvasRef = ref<HTMLCanvasElement>();
const fileInputRef = ref<HTMLInputElement>();

let ws: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let remoteStream: MediaStream | null = null;
let sessionToken = '';
let sessionId = '';
let base = window.location.origin;
let webrtcWatchdog: number | null = null;
let pingTimer: number | null = null;
let jpegBitmap: ImageBitmap | null = null;
const cursor = reactive({ x: 0, y: 0, visible: false });

// ---- 设备身份（每个被控端一套 deviceId/deviceToken，存 localStorage）----
const identityKey = (b: string) => `rc:identity:${b}`;
function loadIdentity(b: string): { deviceId: string; deviceToken?: string } {
  try {
    const raw = localStorage.getItem(identityKey(b));
    if (raw) return JSON.parse(raw);
  } catch { /* 损坏则重建 */ }
  const id = crypto.randomUUID();
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
}
function syncNativeFromScreen(): void {
  // 元数据未到前的宽高兜底：直接用屏幕几何（宽高比正确即可）
  if (screen.value.w > 0 && screen.value.h > 0) {
    native.w = screen.value.w;
    native.h = screen.value.h;
  }
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
/** cover 铺满盒：短边贴满视口，长边溢出（多余部分靠平移看）—— 手机竖屏全屏不再有黑边 */
function coverBox(): { w: number; h: number; x: number; y: number } {
  if (!native.w || !native.h || !viewport.w || !viewport.h) return { w: 0, h: 0, x: 0, y: 0 };
  const s = Math.max(viewport.w / native.w, viewport.h / native.h);
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
  const xMin = Math.min(0, viewport.w - w);
  const xMax = Math.max(0, viewport.w - w);
  const yMin = Math.min(0, viewport.h - h);
  const yMax = Math.max(0, viewport.h - h);
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
  const xMinOff = Math.min(0, viewport.w - w) - (viewport.w - w) / 2;
  const xMaxOff = Math.max(0, viewport.w - w) - (viewport.w - w) / 2;
  const yMinOff = Math.min(0, viewport.h - h) - (viewport.h - h) / 2;
  const yMaxOff = Math.max(0, viewport.h - h) - (viewport.h - h) / 2;
  pan.x = Math.min(xMaxOff, Math.max(xMinOff, pan.x + dx));
  pan.y = Math.min(yMaxOff, Math.max(yMinOff, pan.y + dy));
}
function setZoom(z: number, anchorX?: number, anchorY?: number): void {
  const before = displayedRect.value;
  zoomMode.value = 'free';
  zoom.value = Math.min(8, Math.max(1, z));
  if (zoom.value <= 1.01) {
    zoomMode.value = 'fit';
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
  pan.x = 0;
  pan.y = 0;
  // 三档循环：适应窗口 → 铺满（无黑边） → 1:1 → 适应窗口
  if (zoomMode.value === 'fit') {
    zoomMode.value = 'fill';
    zoom.value = 1;
    return;
  }
  if (zoomMode.value === 'fill') {
    zoomMode.value = 'fit';
    zoom.value = 1;
    const b = fitBox();
    if (b.w > 0 && native.w > 0) setZoom(Math.min(8, native.w / b.w));
    return;
  }
  zoomMode.value = 'fit';
  zoom.value = 1;
}

// ---- JPEG 远端光标（显示坐标 = 显示矩形反算）----
const cursorStyle = computed<CSSProperties>(() => {
  const r = displayedRect.value;
  const s = screen.value;
  if (!cursor.visible || !r.w || !s.w) return { display: 'none' };
  const px = r.x + ((cursor.x - s.x) / s.w) * r.w;
  const py = r.y + ((cursor.y - s.y) / s.h) * r.h;
  return { display: 'block', left: `${px}px`, top: `${py}px` };
});
const fxStyle = computed<CSSProperties>(() => ({ left: `${fx.x}px`, top: `${fx.y}px` }));

// ---- 配对 ----
async function pair(): Promise<void> {
  const code = form.code.trim();
  if (!code) return;
  pairing.value = true;
  base = normBase(form.host);
  const id = loadIdentity(base);
  try {
    const res = await fetch(apiOf(base, '/pair'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        deviceId: id.deviceId,
        deviceToken: id.deviceToken,
        deviceName: deviceName(),
      }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    try { localStorage.setItem(RC_LAST_HOST_KEY, base); } catch { /* 隐私模式忽略 */ }
    // 被控端认了这次配对（含待确认）才记：地址 + 这次用的授权码，下次下拉直接选
    rememberPeer(base);
    const d = body.data || {};
    if (d.deviceToken) saveIdentity(base, d.deviceToken);
    if (d.status === 'granted' && d.token) {
      sessionToken = d.token;
      openWs(`token=${encodeURIComponent(sessionToken)}`);
    } else if (d.status === 'pending' && d.confirmId) {
      phase.value = 'pending';
      openWs(`confirmId=${encodeURIComponent(d.confirmId)}`);
    } else {
      throw new Error('配对响应异常');
    }
  } catch (e) {
    ElMessage.error((e as Error)?.message || '配对失败');
  } finally {
    pairing.value = false;
  }
}
function abortPair(): void {
  cleanup();
  phase.value = 'setup';
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
}

async function renderHostQr(): Promise<void> {
  const ip = hostPreferredIp.value;
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
  let sock: WebSocket;
  try {
    sock = new WebSocket(wsOf(base, `/session/ws?${qs}`));
  } catch (e) {
    ElMessage.error((e as Error)?.message || '连接失败');
    phase.value = 'setup';
    return;
  }
  sock.binaryType = 'arraybuffer';
  ws = sock;
  sock.onopen = () => {
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
    if (phase.value !== 'ended' && phase.value !== 'setup') {
      phase.value = 'setup';
      ElMessage.error('连接已断开');
    }
  };
  sock.onerror = () => { /* onclose 统一收尾 */ };
}

async function onWsMessage(msg: Record<string, unknown>): Promise<void> {
  const type = String(msg.type || '');
  switch (type) {
    case 'pair.pending':
      phase.value = 'pending';
      break;
    case 'session.granted': {
      phase.value = 'live';
      sessionId = String(msg.sessionId || '');
      if (!sessionToken) sessionToken = String(msg.token || '');
      if (msg.deviceToken) saveIdentity(base, String(msg.deviceToken));
      if (Array.isArray(msg.iceServers)) iceServers.value = msg.iceServers as RcIceServer[];
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) setScreen(msg.screen as ScreenRect);
      applyInputState(msg.input);
      if (m === 'webrtc') startWebRtc();
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
        // 白名单直连/断线重连走 resume：WebRTC 也要补发 offer，否则画面永远起不来
        if (m === 'webrtc' && !videoRef.value?.srcObject) startWebRtc();
        askDisplaysIfEmpty();
      }
      break;
    case 'session.mode': {
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      // 兼容模式会话被升级成 WebRTC（白名单直连场景）：需要重新发起 offer
      if (m === 'webrtc' && !videoRef.value?.srcObject) startWebRtc();
      if (msg.screen) setScreen(msg.screen as ScreenRect);
      askDisplaysIfEmpty();
      break;
    }
    case 'screen.info':
      setScreen(msg.screen as ScreenRect);
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
    case 'cursor':
      cursor.x = Number(msg.x) || 0;
      cursor.y = Number(msg.y) || 0;
      cursor.visible = !!msg.visible;
      break;
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
      ElMessage.warning(String(msg.reason || '输入被拒绝'));
      break;
    case 'session.ended':
      endedReason.value = String(msg.reason || '会话已结束');
      cleanup();
      phase.value = 'ended';
      break;
    default:
      break;
  }
}

function setScreen(s: ScreenRect): void {
  screen.value = s;
  syncNativeFromScreen();
  syncViewport();
  if (mouseMode.value) {
    initMousePos();
    showCursorAt(mousePos.x, mousePos.y);
  }
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
    remoteStream = e.streams[0] || new MediaStream([e.track]);
    hasFrame.value = true;
    if (videoRef.value) {
      videoRef.value.srcObject = remoteStream;
      void videoRef.value.play().catch(() => undefined);
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
  try {
    pc?.close();
  } catch { /* ignore */ }
  pc = null;
  remoteStream = null;
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

// ================= 输入：手势（单指直接触控 + 触控板并行）=================
// 状态机在 utils/remote-gesture.ts（纯逻辑可单测）。UU 的做法是两套输入同时可用：
//   · 画面：点哪点哪（直接触控）
//   · 触控板：拖动移动指针、点按在指针处点击、双指滚动
// 所以这里用两个独立状态机，互不干扰。
const gesture = new RemoteGestureRecognizer({ mode: 'direct', longPressMs: 450 });
const padGesture = new RemoteGestureRecognizer({ mode: 'pointer', longPressMs: 450 });
let longPressTimer: number | null = null;
let padLongPressTimer: number | null = null;
let lastMoveSent = 0;
let lastDragSent = 0;
let fxTimer: number | null = null;
let scrollStripY = 0;
let scrollStripActive = false;

// 每次进入会话：触屏默认显示触控板，桌面端不显示；画面直接触控始终可用
watch(phase, (p) => {
  if (p !== 'live') return;
  mouseMode.value = isTouch;
  gesture.reset();
  padGesture.reset();
  if (mouseMode.value) initMousePos();
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
/**
 * 本地光标预测：WebRTC 帧里不带指针（Electron 桌面采集不含光标），JPEG 帧到得慢时
 * 也跟不上手 —— 统一由控制端按自己的触点/鼠标位置自绘，点哪指哪、零延迟。
 */
let cursorHideTimer: number | null = null;
function showCursorAt(x: number, y: number): void {
  cursor.x = x;
  cursor.y = y;
  cursor.visible = true;
  if (cursorHideTimer) clearTimeout(cursorHideTimer);
  if (mouseMode.value) return; // 鼠标模式：指针常显，不自动隐藏
  cursorHideTimer = window.setTimeout(() => { cursor.visible = false; }, 2500);
}

/** 虚拟指针位置初始化到画面中心（屏幕坐标） */
function initMousePos(): void {
  if (!screen.value.w || (mousePos.x && mousePos.y)) return;
  mousePos.x = Math.round(screen.value.x + screen.value.w / 2);
  mousePos.y = Math.round(screen.value.y + screen.value.h / 2);
}
function toggleMouseMode(): void {
  // 只控制触控板显隐；画面直接触控始终可用（UU 同款并行）
  handleGesture(gesture.cancel(), false);
  handleGesture(padGesture.cancel(), true);
  mouseMode.value = !mouseMode.value;
  actionsOpen.value = false;
  if (mouseMode.value) {
    initMousePos();
    showCursorAt(mousePos.x, mousePos.y);
  } else {
    cursor.visible = false;
    padCollapsed.value = false;
  }
}
/** 在虚拟指针当前位置右键（操作面板用） */
function rightClickHere(): void {
  if (!mouseMode.value || !screen.value.w) return;
  input({ action: 'click', x: Math.round(mousePos.x), y: Math.round(mousePos.y), button: 'right' });
}
const input = (msg: Record<string, unknown>): void => {
  if (phase.value !== 'live') return;
  // 安卓镜像的输入走 AndroidMirrorStage 自己的通道，别混进桌面会话的 WS
  if (linkKind.value !== 'desktop') return;
  // 只读会话：本地直接不发，省得每条输入都换来一次拒绝（状态由底部常驻条说明）
  if (!inputAllowed.value) return;
  // 指针模式才维护自绘光标；屏幕触控模式直接用点按光圈反馈，避免两种模式视觉上同时生效
  if (mouseMode.value && typeof msg.x === 'number' && typeof msg.y === 'number') showCursorAt(msg.x, msg.y);
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
    cursorPressed.value = true;
    window.setTimeout(() => { cursorPressed.value = false; }, 150);
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
  if (mouseMode.value) {
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
  cursor.x = mousePos.x;
  cursor.y = mousePos.y;
  cursor.visible = true;
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
  actionsOpen.value = false;
  peekToolbar();
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

// ---- 大触控板（与画面直接触控并行）----
const padPointers = new Set<number>();
/** 手指在触控板上的位置（板内坐标），用于拖动时的视觉反馈 */
function trackPadTouch(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  padTouch.x = e.clientX - r.left;
  padTouch.y = e.clientY - r.top;
}
function clearPadLongPress(): void {
  if (padLongPressTimer) {
    clearTimeout(padLongPressTimer);
    padLongPressTimer = null;
  }
}
function schedulePadLongPress(): void {
  clearPadLongPress();
  padLongPressTimer = window.setTimeout(() => {
    const events = padGesture.maybeLongPress(performance.now());
    if (events.length) buzz(30);
    handleGesture(events, true);
  }, 460);
}
function onPadPointerDown(e: PointerEvent): void {
  actionsOpen.value = false;
  padPointers.add(e.pointerId);
  padActive.value = true;
  trackPadTouch(e);
  handleGesture(padGesture.down(e.pointerId, e.clientX, e.clientY, performance.now()), true);
  schedulePadLongPress();
}
function onPadPointerMove(e: PointerEvent): void {
  trackPadTouch(e);
  handleGesture(padGesture.move(e.pointerId, e.clientX, e.clientY), true);
}
function onPadPointerUp(e: PointerEvent): void {
  clearPadLongPress();
  handleGesture(padGesture.up(e.pointerId, e.clientX, e.clientY, performance.now()), true);
  padPointers.delete(e.pointerId);
  padActive.value = padPointers.size > 0;
}
function onPadPointerCancel(): void {
  clearPadLongPress();
  handleGesture(padGesture.cancel(), true);
  padPointers.clear();
  padActive.value = false;
}

function padClick(button: 'left' | 'right'): void {
  if (!mouseMode.value) return;
  initMousePos();
  clickAt(0, 0, button, true);
}
function onScrollStripDown(e: PointerEvent): void {
  scrollStripActive = true;
  scrollStripY = e.clientY;
}
function onScrollStripMove(e: PointerEvent): void {
  if (!scrollStripActive) return;
  const dy = e.clientY - scrollStripY;
  scrollStripY = e.clientY;
  if (Math.abs(dy) < 2) return;
  wheelAt(0, 0, Math.max(-400, Math.min(400, -Math.round(dy * 1.6))), true);
}
function onScrollStripUp(): void {
  scrollStripActive = false;
}
function toggleActions(): void {
  actionsOpen.value = !actionsOpen.value;
}
function doAction(fn: () => void): void {
  actionsOpen.value = false;
  fn();
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

function markTouch(): void {
  peekToolbar();
}

// ================= 输入：键盘（直通 + 整串）=================
const KEY_MAP: Record<string, string> = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'esc', Delete: 'delete',
  Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
function onKeyDown(e: KeyboardEvent): void {
  if (phase.value !== 'live') return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
  const inImmersive = immersive.value;
  // 修饰组合键：ctrl/alt/meta + 任意键 → 组合键注入
  if (e.ctrlKey || e.altKey || e.metaKey) {
    const keys: string[] = [];
    if (e.ctrlKey || e.metaKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
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
    if (!inImmersive) return;
    e.preventDefault();
    input({ action: 'key', keys: [KEY_MAP[e.key] || e.key.toLowerCase()] });
    return;
  }
  // 普通字符（含中文输入法组字完成后的单发）：整串注入
  if (e.key.length === 1 && inImmersive) {
    e.preventDefault();
    input({ action: 'type', text: e.key });
  }
}
function onCompositionEnd(e: CompositionEvent): void {
  if (phase.value !== 'live' || !e.data) return;
  input({ action: 'type', text: e.data });
}
/** 软键盘边打边发：每敲一段就注入并清空输入框，输入框只当「键盘入口」用 */
function flushKb(el: HTMLTextAreaElement | null | undefined): void {
  if (!el) return;
  const text = el.value;
  if (!text) return;
  el.value = '';
  kbText.value = '';
  input({ action: 'type', text });
}
function onKbInput(e: Event): void {
  if (kbComposing.value) return;
  flushKb(e.target as HTMLTextAreaElement);
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
function sendKbText(): void {
  const t = kbText.value;
  if (!t) return;
  input({ action: 'type', text: t });
  kbText.value = '';
  kbPanelOpen.value = false;
}

// ================= 面板 =================
async function openKeyboardPanel(): Promise<void> {
  kbPanelOpen.value = true;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
  await nextTick();
  kbInputRef.value?.focus(); // 手机上聚焦输入框 = 系统键盘弹出
}
function openClipboardPanel(): void {
  clipPanelOpen.value = true;
  kbPanelOpen.value = false;
  filePanelOpen.value = false;
}
function openFilePanel(): void {
  filePanelOpen.value = true;
  kbPanelOpen.value = false;
  clipPanelOpen.value = false;
  void refreshFiles();
}
function toggleAudio(): void {
  audioOn.value = !audioOn.value;
  send({ type: 'audio.state', on: audioOn.value });
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
  }
  syncViewport();
}
function onFullscreenChange(): void {
  immersive.value = !!document.fullscreenElement;
  setNativeImmersive(immersive.value);
  if (immersive.value) applyImmersiveZoom();
  else void lockLandscape(false);
  if (!immersive.value) {
    kbPanelOpen.value = false;
    clipPanelOpen.value = false;
    filePanelOpen.value = false;
  }
  window.setTimeout(syncViewport, 60);
}
function peekToolbar(): void {
  if (!immersive.value) return;
  toolbarPeek.value = true;
  window.setTimeout(() => {
    toolbarPeek.value = false;
  }, 2500);
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
  audioOn.value = false;
  cursor.visible = false;
  displays.value = [];
  currentDisplay.value = '';
  inputGranted.value = true;
  viewOnlySelf.value = false;
  inputRequesting.value = false;
  linkKind.value = 'desktop';
  androidSerial.value = '';
  androidName.value = '';
  iceServers.value = [];
  zoomMode.value = 'fit';
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
  kbPanelOpen.value = false;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  immersive.value = false;
  setNativeImmersive(false);
  mouseMode.value = false;
  gesture.reset();
  padGesture.reset();
  actionsOpen.value = false;
  padCollapsed.value = false;
}
function onResize(): void {
  syncViewport();
}
/** 切后台/失焦：手指不会再有 up 事件，主动收尾避免远端按键卡住 */
function onPageLeave(): void {
  clearLongPress();
  clearPadLongPress();
  handleGesture(gesture.cancel(), false);
  handleGesture(padGesture.cancel(), true);
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('compositionend', onCompositionEnd, true);
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
  window.removeEventListener('compositionend', onCompositionEnd, true);
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
.rc-cursor { position: absolute; z-index: 6; pointer-events: none; transform: translate(-3px, -2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); transition: transform 0.12s ease; }
.rc-cursor.pressed { transform: translate(-3px, -2px) scale(0.84); }
.rc-tap-fx { position: absolute; z-index: 5; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; pointer-events: none; border: 2px solid rgba(124,178,255,0.95); box-shadow: 0 0 0 8px rgba(47,107,255,0.18); animation: rc-fx 0.36s ease-out forwards; }
.rc-tap-fx.right { border-color: rgba(255,196,120,0.95); box-shadow: 0 0 0 8px rgba(255,170,60,0.16); }
@keyframes rc-fx { from { opacity: 1; transform: scale(0.55); } to { opacity: 0; transform: scale(1.35); } }

/* 顶部状态胶囊：只留状态 + 显示器/画质，按钮统一收进右侧操作栏 */
.rc-topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px; padding: 10px 14px; padding-right: 86px; background: linear-gradient(to bottom, rgba(5,8,12,0.72), rgba(5,8,12,0)); transition: opacity 0.25s; z-index: 5; pointer-events: none; }
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

/* 右侧操作栏（UU 式玻璃拟态）：高频动作常驻，低频收进「操作」抽屉 */
.rc-rail { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 10px; z-index: 7; transition: opacity 0.25s; }
.rc-rail.hidden { opacity: 0; pointer-events: none; }
.rc-rail-btn { width: 54px; height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-radius: 16px; background: rgba(18,23,30,0.72); color: #cdd6e2; backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.08); font-size: 11px; cursor: pointer; transition: background 0.18s, border-color 0.18s, transform 0.12s; }
.rc-rail-btn svg { width: 20px; height: 20px; fill: currentColor; stroke: currentColor; stroke-width: 1.6; }
.rc-rail-btn svg [fill="none"] { fill: none; }
.rc-rail-btn:hover { background: rgba(30,38,49,0.9); }
.rc-rail-btn:active { transform: scale(0.94); }
.rc-rail-btn.active { background: rgba(47,107,255,0.9); border-color: rgba(120,170,255,0.6); color: #fff; }
.rc-rail-mouse { font-size: 20px; line-height: 1; }

/* 操作抽屉 */
.rc-sheet { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: min(340px, 80vw); max-height: 82vh; overflow-y: auto; background: rgba(16,21,28,0.94); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 12px; z-index: 11; backdrop-filter: blur(18px); box-shadow: 0 18px 48px rgba(0,0,0,0.5); }
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

/* 大触控板：拖动区就是舞台本身（事件冒泡上来），这里只负责视觉与左右键/滚动条 */
.rc-pad { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); width: min(500px, 88vw); background: rgba(14,19,25,0.78); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; z-index: 6; backdrop-filter: blur(16px); box-shadow: 0 14px 40px rgba(0,0,0,0.45); padding: 8px 10px 10px; touch-action: none; }
.rc-pad.collapsed { width: auto; }
.rc-pad-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #93a0b1; padding: 0 4px 4px; }
.rc-pad-mini { border: none; background: rgba(255,255,255,0.08); color: #cdd6e2; border-radius: 8px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.rc-pad-body { position: relative; display: flex; align-items: center; justify-content: center; height: 136px; border-radius: 14px; background: radial-gradient(ellipse at 50% 40%, rgba(64,118,255,0.16), rgba(255,255,255,0.02) 70%); border: 1px solid rgba(255,255,255,0.06); transition: border-color 0.16s, box-shadow 0.16s; }
.rc-pad-body.active { border-color: rgba(96,150,255,0.55); box-shadow: inset 0 0 0 1px rgba(96,150,255,0.22), 0 0 26px rgba(47,107,255,0.2); }
.rc-pad-dot { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: rgba(124,178,255,0.35); border: 1px solid rgba(168,206,255,0.9); box-shadow: 0 0 14px rgba(80,140,255,0.55); pointer-events: none; }
.rc-pad-glyph { width: 116px; height: 116px; color: #9db6de; opacity: 0.9; pointer-events: none; }
.rc-pad-hint { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font-size: 10.5px; color: #77849a; pointer-events: none; }
.rc-pad-btns { display: flex; align-items: stretch; gap: 8px; margin-top: 8px; height: 46px; }
.rc-pad-btn { flex: 1; border: none; border-radius: 12px; background: rgba(255,255,255,0.08); color: #dbe3ee; font-size: 13px; cursor: pointer; }
.rc-pad-btn:active { background: rgba(47,107,255,0.75); }
.rc-pad-scroll { width: 56px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; border-radius: 12px; background: rgba(255,255,255,0.05); color: #8b98ab; font-size: 9px; padding: 2px 0; cursor: ns-resize; touch-action: none; }
.rc-pad-scroll-bar { flex: 1; width: 3px; margin: 3px 0; border-radius: 2px; background: linear-gradient(to bottom, rgba(157,182,222,0.15), rgba(157,182,222,0.55), rgba(157,182,222,0.15)); }
/* 首帧等待层：黑屏时给出明确状态，并吃掉误触（此时画面还没有，点了也点不准） */
.rc-wait-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 3; pointer-events: none; background: #000; text-align: center; padding: 24px; }


.rc-panel { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(480px, 92%); background: #171c23; border: 1px solid #2a323e; border-radius: 12px; padding: 12px; z-index: 10; }
.rc-panel-wide { width: min(560px, 94%); }
/* 键盘面板固定顶部：系统键盘从底部升起，放底部的输入框会被键盘盖住 */
.rc-panel-kb { top: 12px; bottom: auto; }
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
