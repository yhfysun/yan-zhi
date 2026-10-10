<!--
  ClipWorkbench.vue —— 剪辑模式（第六模式 clip，路由 /clip）

  布局按主流剪辑软件（剪映专业版 / Premiere / DaVinci）的四区惯例：
  ┌ 顶栏：工程信息 + 规格 + 导出 ─────────────────────────────┐
  │ 素材库   │ 预览监视器（居中留黑）      │ 检视器/对话（切换） │
  │ (左)     ├────────────────────────────┤                    │
  │          │ 工具条 + 多轨时间轴（下）   │ (右)               │
  └──────────┴────────────────────────────┴────────────────────┘

  ★ 高度：根节点必须 `flex: 1` 而不是 `height: 100%` —— 上层 `.main-content` 是
    flex 列容器（见 App.vue），子元素写 height:100% 拿不到父高，整页会缩成内容高度
    挤在上半屏（上一版踩到）。
  ★ 与智能体共用同一份工程（clip-project.json）：时间轴改动即时落盘，
    对话里剪辑师改的也是这份文件，点刷新即可看到模型改的结果。
  ★ 预览/时间轴深色是**视频工作区惯例**（监视器留黑 + 轨道对比度），不是主题色。
-->
<template>
  <div class="clip-page" :class="[`is-lead-${lead}`]">
    <!-- ===== 顶栏（编辑视图专属；项目列表视图有自己的头部） ===== -->
    <header v-show="view === 'editor'" class="cp-top">
      <button class="cp-btn ghost" title="返回项目列表" @click="backToList">
        <el-icon :size="13"><Back /></el-icon>项目
      </button>
      <span class="cp-badge"><el-icon :size="13"><VideoCamera /></el-icon>剪辑模式</span>
      <input v-model="projectName" class="cp-name-input" :placeholder="'未命名剪辑'" @change="save" />
      <span class="cp-meta">{{ clipCount }} 段 · {{ textCount }} 字幕 · {{ totalDurationLabel }}</span>
      <span class="cp-tag" :title="'输出规格在建项目时确定，改规格请新建项目'">{{ outSize }}@{{ outFps }}</span>
      <span class="cp-dir-tag" :title="projectDirTitle" @click="spaceDirPicker = true">
        <el-icon :size="12"><FolderOpened /></el-icon>
        {{ currentSpaceDir ? shortPath(currentSpaceDir) : '默认目录' }}
      </span>
      <span class="cp-spacer"></span>
      <button class="cp-btn ghost" :title="dirty ? '有未保存改动' : '已自动保存'" @click="save">
        <el-icon :size="13"><Check /></el-icon>{{ dirty ? '保存' : '已保存' }}
      </button>
      <button class="cp-btn ghost" title="重新读取工程（读取对话里剪辑师改的结果）" @click="reloadAll">
        <el-icon :size="13"><Refresh /></el-icon>刷新
      </button>
      <button class="cp-btn" :disabled="rendering" @click="render(true)">{{ rendering ? '渲染中…' : '预览档' }}</button>
      <button class="cp-btn primary" :disabled="rendering" @click="render(false)">导出成片</button>
    </header>

    <div v-show="view === 'editor'" class="cp-body">
      <!-- ===== 左：素材库 ===== -->
      <aside class="cp-left">
        <div class="cp-panel-head">
          <span>素材库</span>
          <span class="cp-count">{{ filteredFiles.length }}</span>
          <span class="cp-spacer"></span>
          <button class="cp-mini" title="打开内置音效库（免版权，可一键加入工程）" @click="openSfxLibrary">
            <el-icon :size="12"><Headset /></el-icon>
          </button>
          <button class="cp-mini" title="从本机导入素材（视频/图片/音频，可多选）" @click="importMedia">
            <el-icon :size="12"><FolderOpened /></el-icon>
          </button>
        </div>
        <input v-model="keyword" class="cp-input" placeholder="搜索素材…" />
        <div
          class="cp-media"
          @dragover.prevent
          @drop="onDropMedia"
        >
          <div
            v-for="f in filteredFiles"
            :key="f.id || f.path"
            class="cp-media-item"
            :title="`${f.name}\n拖动或双击加入时间轴`"
            draggable="true"
            @dragstart="onDragStart($event, f)"
            @dblclick="appendClip(f.path)"
            @contextmenu.prevent.stop="onMediaMenu($event, f)"
          >
            <span class="cp-media-icon">
              <el-icon :size="16"><VideoCamera v-if="isVideo(f)" /><Picture v-else-if="isImage(f)" /><Headset v-else /></el-icon>
            </span>
            <span class="cp-media-name">{{ f.name }}</span>
          </div>
          <div v-if="!filteredFiles.length" class="cp-empty">
            还没有素材。<br />点右上角 <el-icon :size="11"><FolderOpened /></el-icon> 从本机导入，
            或把文件拖到这里；也可在对话里让剪辑师生成。
          </div>
        </div>

        <!-- 工程设置：**只读展示**。
             ★ 规格是建项目时定下的工程参数（画幅决定了时间轴比例、字幕字号基准、
               渲染规格），剪辑中途改会让已排版好的字幕与画面全部错位 ——
               剪映/Premiere 也一样：改规格 = 新建项目或新建序列，不是在编辑页随手改。
               要换规格请「项目 → 新建项目」。 -->
        <div class="cp-panel-head sub">
          <span>工程设置</span>
          <button class="cp-mini" title="换规格请新建项目" @click="newProjectDialog = true">新建</button>
        </div>
        <div class="cp-propset">
          <div class="cp-prop"><span>画幅</span><b>{{ specLabel }}</b></div>
          <div class="cp-prop"><span>帧率</span><b>{{ outFps }} fps</b></div>
          <div class="cp-prop"><span>片段</span><b>{{ clipCount }} 段</b></div>
          <div class="cp-prop"><span>字幕</span><b>{{ textCount }} 条</b></div>
          <div class="cp-prop"><span>时长</span><b>{{ totalDurationLabel }}</b></div>
        </div>

        <!-- 音效链（整片）：降噪/响度归一/变声/混响… 按顺序串联 -->
        <div class="cp-panel-head sub">
          <span>音效</span>
          <button v-if="audioFx.length" class="cp-mini" title="清除音效链" @click="clearAudioFx">
            <el-icon :size="11"><Delete /></el-icon>
          </button>
        </div>
        <div class="cp-sfx">
          <div v-if="audioFx.length" class="cp-sfx-chain">
            <span v-for="(id, i) in audioFx" :key="i" class="cp-sfx-tag" :title="audioFxLabel(id)">
              {{ audioFxLabel(id) }}
              <el-icon :size="10" class="cp-sfx-x" @click="removeAudioFx(i)"><Close /></el-icon>
            </span>
          </div>
          <select class="cp-select" :value="''" @change="onPickAudioFx">
            <option value="">{{ audioFx.length ? '继续添加…' : '选择音效…' }}</option>
            <optgroup v-for="g in AUDIO_GROUPS" :key="g.group" :label="g.group">
              <option
                v-for="e in g.items"
                :key="e.id"
                :value="e.id"
                :title="e.desc"
                :disabled="e.id === 'none' || audioFx.includes(e.id)"
              >{{ e.label }}{{ audioFx.includes(e.id) ? '（已添加）' : '' }}</option>
            </optgroup>
          </select>
          <div class="cp-ins-hint">按顺序串联；降噪、响度归一等建议放前面</div>
        </div>

        <div class="cp-panel-head sub">
          <span>背景音乐</span>
          <button v-if="bgm" class="cp-mini" title="移除 BGM" @click="clearBgm">移除</button>
        </div>
        <div class="cp-bgm">
          <template v-if="bgm">
            <div class="cp-bgm-name" :title="bgm.file">{{ baseName(bgm.file) }}</div>
            <label class="cp-row">
              <span>音量</span>
              <input v-model.number="bgmVolume" class="cp-range" type="range" min="0" max="1" step="0.05" @change="applyBgm" />
              <span class="cp-val">{{ bgmVolume.toFixed(2) }}</span>
            </label>
            <label class="cp-check">
              <input v-model="bgmDuck" type="checkbox" @change="applyBgm" />
              说话时自动压低
            </label>
          </template>
          <div v-else class="cp-empty small">拖入音频素材即设为 BGM</div>
        </div>
      </aside>

      <!-- ===== 中：监视器 + 时间轴 ===== -->
      <main class="cp-center">
        <!-- 监视器 -->
        <section class="cp-monitor">
          <div class="cp-monitor-stage">
            <!-- ★★ 实时预览：拖动播放头即时出帧（边剪辑边预览）。
                 这是剪辑工作台的核心体验 —— 改一下马上看到；此前只有"渲染完才能看"。 -->
            <img
              v-if="monitorMode === 'live' && liveFrameUrl"
              class="cp-video cp-live-frame"
              :style="stageStyle"
              :src="liveFrameUrl"
              :alt="`预览帧 ${playhead.toFixed(2)}s`"
              @error="onFrameError"
            />
            <div v-else-if="monitorMode === 'live' && frameLoading" class="cp-monitor-empty">
              <el-icon :size="24" class="cp-spin"><Loading /></el-icon>
              <span>正在取帧…</span>
            </div>
            <video
              v-else-if="monitorMode === 'clip' && previewUrl"
              ref="videoEl"
              class="cp-video"
              :style="stageStyle"
              :src="previewUrl"
              controls
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onLoadedMeta"
            ></video>
            <div v-else class="cp-monitor-empty">
              <el-icon :size="30"><VideoPlay /></el-icon>
              <span>{{ monitorHint }}</span>
            </div>
            <!-- 画面角标：告诉用户现在看的是实时帧还是成片 -->
            <span v-if="monitorMode === 'live' && liveFrameUrl && !frameLoading" class="cp-live-badge">
              <el-icon :size="10"><View /></el-icon>实时
            </span>
            <!-- 取帧失败如实展示（不静默空白）；后端已给出具体原因 -->
            <span v-if="monitorMode === 'live' && frameError" class="cp-live-err" :title="frameError">{{ frameError }}</span>
          </div>
          <div class="cp-transport">
            <button class="cp-btn ghost" title="回到开头" @click="seek(0)"><el-icon :size="13"><DArrowLeft /></el-icon></button>
            <button class="cp-mini" title="上一帧（,）" :disabled="!clipCount" @click="stepFrame(-1)">|◀</button>
            <button class="cp-mini" title="下一帧（.）" :disabled="!clipCount" @click="stepFrame(1)">▶|</button>
            <span class="cp-time" :title="monitorMode === 'clip' ? '成片长度（上一次渲染的结果）' : '当前工程时长'">{{ fmtTime(playhead) }} / {{ fmtTime(monitorMode === 'clip' ? (videoDur || estTotal) : estTotal) }}</span>
            <span v-if="monitorMode === 'clip' && videoDur && Math.abs(videoDur - estTotal) > 0.5" class="cp-stale" title="成片长度与当前工程不一致：改动后需重新渲染">
              <el-icon :size="11"><WarningFilled /></el-icon>待重新渲染
            </span>
            <span class="cp-spacer"></span>
            <!-- 监视模式切换：实时帧（编辑时用）/ 成片播放（核对时用） -->
            <span class="cp-seg-btns">
              <button class="cp-mini" :class="{ on: monitorMode === 'live' }" title="实时预览：拖动播放头即时出帧（编辑时用）" @click="setMonitorMode('live')">实时</button>
              <button class="cp-mini" :class="{ on: monitorMode === 'clip' }" title="播放已渲染的成片（核对时用）" @click="setMonitorMode('clip')">成片</button>
            </span>
            <span class="cp-zoom">
              <button class="cp-mini" title="时间轴缩小" @click="zoomBy(1/1.4)">−</button>
              <button class="cp-mini" title="时间轴放大" @click="zoomBy(1.4)">＋</button>
            </span>
          </div>
        </section>

        <!-- 时间轴 -->
        <section class="cp-timeline">
          <div class="cp-toolbar">
            <button class="cp-mini" title="撤销（Ctrl+Z）" :disabled="!undoStack.length" @click="undo"><el-icon :size="13"><RefreshLeft /></el-icon></button>
            <button class="cp-mini" title="重做（Ctrl+Shift+Z）" :disabled="!redoStack.length" @click="redo"><el-icon :size="13"><RefreshRight /></el-icon></button>
            <span class="cp-toolbar-sep"></span>
            <button class="cp-mini" title="选中片段左移" :disabled="!selectedClipId" @click="moveClip(-1)"><el-icon :size="13"><ArrowLeft /></el-icon></button>
            <button class="cp-mini" title="选中片段右移" :disabled="!selectedClipId" @click="moveClip(1)"><el-icon :size="13"><ArrowRight /></el-icon></button>
            <button class="cp-mini" title="在播放头分割选中片段" :disabled="!selectedClipId" @click="splitAtPlayhead"><el-icon :size="13"><Scissor /></el-icon></button>
            <button class="cp-mini" title="复制选中片段" :disabled="!selectedClipId" @click="duplicateClip"><el-icon :size="13"><CopyDocument /></el-icon></button>
            <button class="cp-mini danger" title="删除选中片段" :disabled="!selectedClipId" @click="removeClip"><el-icon :size="13"><Delete /></el-icon></button>
            <span class="cp-toolbar-sep"></span>
            <button class="cp-mini" title="在播放头处添加一条字幕（加完在右侧属性面板编辑文案与时间）" :disabled="!clipCount" @click="addTextAtPlayhead">
              <el-icon :size="13"><EditPen /></el-icon>
            </button>
            <button class="cp-mini danger" title="删除选中字幕" :disabled="!selectedTextId" @click="removeText"><el-icon :size="13"><ChatLineSquare /></el-icon></button>
            <!-- 语音转字幕（本地 whisper.cpp）：素材只有音频/视频时自动打轴。
                 ★ 加这条的起因（2026-10-08）：ASR 后端已通，但此前只能从**对话**触发 ——
                   工作台里"想自动打轴"却找不到入口 = 能力有了、用户用不上。 -->
            <button
              class="cp-mini"
              :title="asrRunning ? '正在识别…（本地 whisper.cpp，不上传）' : '语音转字幕：识别选中片段的语音，自动生成带时间轴的字幕（本地识别，不上传）'"
              :disabled="asrRunning || !selectedClipId"
              @click="runAsrOnSelected"
            >
              <el-icon :size="13" :class="{ 'cp-spin': asrRunning }"><Microphone /></el-icon>
            </button>
            <span class="cp-spacer"></span>
            <span class="cp-hint">拖动素材入轨 · 拖动播放头定位 · 选中片段/字幕改参数</span>
          </div>

          <div class="cp-tl">
            <!-- 轨道名（固定不滚动） -->
            <div class="cp-tl-labels">
              <div class="cp-tl-label head"></div>
              <div class="cp-tl-label"><el-icon :size="12"><VideoCamera /></el-icon>视频</div>
              <div class="cp-tl-label"><el-icon :size="12"><ChatLineSquare /></el-icon>字幕</div>
              <div class="cp-tl-label"><el-icon :size="12"><Headset /></el-icon>音频</div>
              <div class="cp-tl-label"><el-icon :size="12"><Picture /></el-icon>画中画</div>
            </div>

            <div ref="tlScroll" class="cp-tl-scroll" @dragover.prevent @drop="onDropTrack" @contextmenu.prevent="onEmptyMenu">
              <div class="cp-tl-canvas" :style="{ width: canvasWidth + 'px' }">
                <!-- 刻度尺 -->
                <div class="cp-ruler" @mousedown="startScrub">
                  <div v-for="t in ticks" :key="t.sec" class="cp-tick" :style="{ left: t.x + 'px' }">
                    <span>{{ t.label }}</span>
                  </div>
                </div>

                <!-- 视频轨 -->
                <div class="cp-track">
                  <div
                    v-for="(c, i) in clips"
                    :key="c.id"
                    class="cp-clip"
                    :class="{ active: c.id === selectedClipId }"
                    :style="{ left: segLeft(i) + 'px', width: segWidth(c) + 'px' }"
                    :title="`${i + 1}. ${c.label || baseName(c.file)}${c.trimStart != null || c.trimEnd != null ? `\n裁剪 ${(c.trimStart ?? 0).toFixed(1)}s ~ ${c.trimEnd != null ? c.trimEnd.toFixed(1) + 's' : '末尾'}` : ''}`"
                    @click="selectClip(c.id)"
                    @contextmenu.prevent.stop="onClipMenu($event, c)"
                    @mousedown="onClipMouseDown($event, c)"
                  >
                    <!-- 左/右边缘把手：拖动即修剪（商用软件的标配交互，比进属性面板改数字快得多） -->
                    <span class="cp-clip-handle left" title="拖动修剪开头" @mousedown.stop="startTrim($event, c, 'start')"></span>
                    <span class="cp-clip-handle right" title="拖动修剪结尾" @mousedown.stop="startTrim($event, c, 'end')"></span>
                    <!-- 波形底图（有音轨的素材；服务端生成，生成失败静默无图不报错） -->
                    <img v-if="waveUrl(c.file)" class="cp-clip-wave" :src="waveUrl(c.file)" alt="" />
                    <span class="cp-clip-idx">{{ i + 1 }}</span>
                    <span class="cp-clip-name">{{ c.label || baseName(c.file) }}</span>
                    <span class="cp-clip-tags">
                      <em v-if="c.speed">{{ c.speed }}x</em>
                      <em v-if="c.kenburns">运镜</em>
                      <em v-if="c.colorPreset">{{ c.colorPreset }}</em>
                      <em v-if="c.audioFile">配音</em>
                      <em v-if="c.fadeIn || c.fadeOut">淡入淡出</em>
                      <em v-if="c.mask">蒙版</em>
                      <em v-if="c.crop">裁剪</em>
                      <em v-if="c.keyframes?.length">关键帧</em>
                    </span>
                  </div>
                  <div v-if="!clips.length" class="cp-track-empty">把左侧素材拖到这里</div>
                </div>

                <!-- 字幕轨 -->
                <div class="cp-track">
                  <div
                    v-for="(t, i) in texts"
                    :key="t.id"
                    class="cp-text"
                    :class="{ active: t.id === selectedTextId }"
                    :style="{ left: (t.start * pxPerSec) + 'px', width: Math.max(24, (t.end - t.start) * pxPerSec) + 'px' }"
                    :title="`T${i + 1} ${t.text}\n${t.start.toFixed(1)}s ~ ${t.end.toFixed(1)}s${t.animation ? `\n动画：${animationLabel(t.animation)}` : ''}`"
                    @click="selectText(t.id)"
                    @contextmenu.prevent.stop="onTextMenu($event, t)"
                  >
                    <span class="cp-text-txt">{{ t.text }}</span>
                    <em v-if="t.animation" class="cp-text-anim">{{ animationLabel(t.animation) }}</em>
                  </div>
                  <button v-if="!texts.length" class="cp-track-empty cp-track-empty-btn" :disabled="!clipCount" title="在播放头处添加一条字幕（也可右键时间轴空白区）" @click="addTextAtPlayhead">＋ 点击添加字幕（说清文案与时间点也可让剪辑师加）</button>
                </div>

                <!-- 音频轨 -->
                <div class="cp-track">
                  <div v-if="bgm" class="cp-audio" :style="{ left: 0, width: Math.max(60, estTotal * pxPerSec) + 'px' }" title="背景音乐（整片）">
                    <img v-if="waveUrl(bgm.file)" class="cp-bgm-wave" :src="waveUrl(bgm.file)" alt="" />
                    <el-icon :size="11"><Headset /></el-icon>
                    <span>{{ baseName(bgm.file) }} · 音量 {{ bgm.volume }}</span>
                  </div>
                  <div v-if="!bgm" class="cp-track-empty">拖入音频素材设为 BGM</div>
                </div>

                <!-- 画中画轨（叠加轨）：右键素材 → 设为画中画 -->
                <div class="cp-track">
                  <div
                    v-for="(o, i) in overlays"
                    :key="o.id"
                    class="cp-pip"
                    :class="{ active: o.id === selectedOverlayId }"
                    :style="{ left: (o.start * pxPerSec) + 'px', width: Math.max(24, (o.end - o.start) * pxPerSec) + 'px' }"
                    :title="`PiP${i + 1} ${baseName(o.file)}\n${o.start.toFixed(1)}s ~ ${o.end.toFixed(1)}s\n${OVERLAY_POSITIONS.find((p) => p.id === o.pos)?.label || '右下'} · ${(o.scale ?? 0.35).toFixed(2)}×`"
                    @click="selectOverlay(o.id)"
                    @contextmenu.prevent.stop="onOverlayMenu($event, o)"
                  >
                    <span class="cp-clip-name">{{ baseName(o.file) }}</span>
                  </div>
                  <div v-if="!overlays.length" class="cp-track-empty">右键素材 → 设为画中画</div>
                </div>

                <!-- 播放头 -->
                <div class="cp-playhead" :style="{ left: (playhead * pxPerSec) + 'px' }">
                  <span class="cp-playhead-knob"></span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <!-- ===== 右：检视器 / 对话 ===== -->
      <aside class="cp-right">
        <div class="cp-tabs">
          <button class="cp-tab" :class="{ on: rightTab === 'inspector' }" @click="rightTab = 'inspector'">属性</button>
          <button class="cp-tab" :class="{ on: rightTab === 'chat' }" @click="rightTab = 'chat'">对话</button>
        </div>

        <div v-show="rightTab === 'inspector'" class="cp-ins">
          <!-- 片段属性 -->
          <template v-if="selectedClip">
            <div class="cp-ins-head">
              <span class="cp-ins-title">片段 {{ selectedClipIndex + 1 }}</span>
              <span class="cp-ins-sub">{{ baseName(selectedClip.file) }}</span>
            </div>
            <div class="cp-field">
              <label>起点 / 终点（秒）</label>
              <div class="cp-field-row">
                <input v-model.number="clipPatch.trimStart" class="cp-num wide" type="number" step="0.1" min="0" placeholder="0" />
                <span class="cp-tilde">~</span>
                <input v-model.number="clipPatch.trimEnd" class="cp-num wide" type="number" step="0.1" min="0" placeholder="末尾" />
              </div>
            </div>
            <div class="cp-field">
              <label>变速 <span class="cp-val">{{ (clipPatch.speed ?? 1).toFixed(1) }}×</span></label>
              <input v-model.number="clipPatch.speed" class="cp-range" type="range" min="0.25" max="4" step="0.05" />
            </div>
            <div class="cp-field">
              <label>音量 <span class="cp-val">{{ (clipPatch.volume ?? 1).toFixed(2) }}</span></label>
              <input v-model.number="clipPatch.volume" class="cp-range" type="range" min="0" max="2" step="0.05" />
            </div>
            <div class="cp-field">
              <label>调色</label>
              <select v-model="clipPatch.colorPreset" class="cp-select">
                <option value="">原片（不调色）</option>
                <optgroup v-for="g in COLOR_GROUPS" :key="g.group" :label="g.group">
                  <option v-for="e in g.items" :key="e.id" :value="e.id" :title="e.desc">{{ e.label }}</option>
                </optgroup>
              </select>
            </div>
            <div class="cp-field">
              <label>淡入 / 淡出（秒）</label>
              <div class="cp-field-row">
                <input v-model.number="clipPatch.fadeIn" class="cp-num wide" type="number" step="0.1" min="0" placeholder="0" />
                <span class="cp-tilde">/</span>
                <input v-model.number="clipPatch.fadeOut" class="cp-num wide" type="number" step="0.1" min="0" placeholder="0" />
              </div>
            </div>

            <!-- 蒙版：形状取景 / 色键抠像（此前完全没有此能力） -->
            <div class="cp-grp">
              <div class="cp-grp-head" @click="maskOpen = !maskOpen">
                <el-icon :size="11"><component :is="maskOpen ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
                <span>蒙版</span>
                <span v-if="clipPatch.maskShape || clipPatch.maskKey" class="cp-grp-badge">
                  {{ clipPatch.maskKey ? keyLabelOf(clipPatch.maskKey) : shapeLabelOf(clipPatch.maskShape) }}
                </span>
                <span class="cp-spacer"></span>
                <button v-if="clipPatch.maskShape || clipPatch.maskKey" class="cp-mini" title="清除蒙版" @click.stop="clearClipMask">
                  <el-icon :size="11"><Delete /></el-icon>
                </button>
              </div>
              <div v-show="maskOpen" class="cp-grp-body">
                <div class="cp-field">
                  <label>形状</label>
                  <div class="cp-preset-grid sm">
                    <button
                      v-for="m in MASK_SHAPES"
                      :key="m.id"
                      class="cp-preset"
                      :class="{ on: clipPatch.maskShape === m.id }"
                      :title="m.desc"
                      @click="pickMaskShape(m.id)"
                    >
                      <span class="cp-preset-label">{{ m.label }}</span>
                    </button>
                  </div>
                </div>
                <div class="cp-field">
                  <label>抠像（按颜色抠除背景）</label>
                  <div class="cp-preset-grid sm">
                    <button
                      v-for="k in MASK_KEYS.filter((x) => x.id !== 'none')"
                      :key="k.id"
                      class="cp-preset"
                      :class="{ on: clipPatch.maskKey === k.id }"
                      :title="k.desc"
                      @click="pickMaskKey(k.id)"
                    >
                      <span class="cp-preset-label">{{ k.label }}</span>
                    </button>
                  </div>
                </div>
                <div v-if="clipPatch.maskShape && clipPatch.maskShape !== 'none'" class="cp-field">
                  <label>蒙版大小 <span class="cp-val">{{ (clipPatch.maskScale ?? 0.9).toFixed(2) }}</span></label>
                  <input v-model.number="clipPatch.maskScale" class="cp-range" type="range" min="0.1" max="1" step="0.05" />
                </div>
                <div v-if="clipPatch.maskShape && clipPatch.maskShape !== 'none'" class="cp-field">
                  <label>中心位置（水平 / 垂直）</label>
                  <div class="cp-field-row">
                    <input v-model.number="clipPatch.maskOffsetX" class="cp-range" type="range" min="-0.4" max="0.4" step="0.02" />
                    <input v-model.number="clipPatch.maskOffsetY" class="cp-range" type="range" min="-0.4" max="0.4" step="0.02" />
                  </div>
                </div>
                <div v-if="clipPatch.maskShape && clipPatch.maskShape !== 'none'" class="cp-field">
                  <label>边缘羽化 <span class="cp-val">{{ clipPatch.maskFeather ?? 0 }}px</span></label>
                  <input v-model.number="clipPatch.maskFeather" class="cp-range" type="range" min="0" max="80" step="2" />
                </div>
              </div>
            </div>

            <!-- 转场：与前一段之间的过渡（挂在当前段上，语义="我进来时怎么出现"） -->
            <div class="cp-grp">
              <div class="cp-grp-head" @click="transOpen = !transOpen">
                <el-icon :size="11"><component :is="transOpen ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
                <span>入场转场</span>
                <span v-if="clipPatch.transitionType" class="cp-grp-badge">{{ transitionLabelOf(clipPatch.transitionType) }}</span>
                <span class="cp-spacer"></span>
                <button v-if="clipPatch.transitionType" class="cp-mini" title="取消转场" @click.stop="clearClipTransition">
                  <el-icon :size="11"><Delete /></el-icon>
                </button>
              </div>
              <div v-show="transOpen" class="cp-grp-body">
                <div v-if="selectedClipIndex === 0" class="cp-ins-hint">第一段没有"前一段"，无需转场（转场挂在后一段上）</div>
                <template v-else>
                  <div class="cp-field">
                    <label>转场类型</label>
                    <select v-model="clipPatch.transitionType" class="cp-select" @change="syncTransitionDuration">
                      <option value="">无（直接硬切）</option>
                      <optgroup v-for="g in TRANSITION_GROUPS" :key="g.group" :label="g.group">
                        <option v-for="t in g.items" :key="t.id" :value="t.id" :title="t.desc">{{ t.label }}</option>
                      </optgroup>
                    </select>
                  </div>
                  <div v-if="clipPatch.transitionType" class="cp-field">
                    <label>转场时长 <span class="cp-val">{{ (clipPatch.transitionDuration ?? 0.8).toFixed(2) }}s</span></label>
                    <input v-model.number="clipPatch.transitionDuration" class="cp-range" type="range" min="0.2" max="3" step="0.1" />
                  </div>
                </template>
              </div>
            </div>

            <!-- 画面裁剪：只保留子区域（裁掉黑边/杂物），裁完回填画幅不变形 -->
            <div class="cp-grp">
              <div class="cp-grp-head" @click="cropOpen = !cropOpen">
                <el-icon :size="11"><component :is="cropOpen ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
                <span>画面裁剪</span>
                <span v-if="clipPatch.cropW < 0.999 || clipPatch.cropH < 0.999 || clipPatch.cropX > 0.001 || clipPatch.cropY > 0.001" class="cp-grp-badge">已裁剪</span>
                <span class="cp-spacer"></span>
                <button v-if="clipPatch.cropW < 0.999 || clipPatch.cropH < 0.999 || clipPatch.cropX > 0.001 || clipPatch.cropY > 0.001" class="cp-mini" title="恢复全画幅" @click.stop="clearClipCrop">
                  <el-icon :size="11"><Delete /></el-icon>
                </button>
              </div>
              <div v-show="cropOpen" class="cp-grp-body">
                <div class="cp-field">
                  <label>宽度 <span class="cp-val">{{ clipPatch.cropW.toFixed(2) }}</span></label>
                  <input v-model.number="clipPatch.cropW" class="cp-range" type="range" min="0.1" max="1" step="0.01" />
                </div>
                <div class="cp-field">
                  <label>高度 <span class="cp-val">{{ clipPatch.cropH.toFixed(2) }}</span></label>
                  <input v-model.number="clipPatch.cropH" class="cp-range" type="range" min="0.1" max="1" step="0.01" />
                </div>
                <div class="cp-field">
                  <label>位置（水平 / 垂直）</label>
                  <div class="cp-field-row">
                    <input v-model.number="clipPatch.cropX" class="cp-range" type="range" min="0" max="0.9" step="0.01" />
                    <input v-model.number="clipPatch.cropY" class="cp-range" type="range" min="0" max="0.9" step="0.01" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 关键帧动画：播放头定位 → 打点 → 列表里改数值（缩放/位移/透明度，线性过渡） -->
            <div class="cp-grp">
              <div class="cp-grp-head" @click="kfOpen = !kfOpen">
                <el-icon :size="11"><component :is="kfOpen ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
                <span>关键帧</span>
                <span v-if="selectedClip?.keyframes?.length" class="cp-grp-badge">{{ selectedClip.keyframes.length }} 个</span>
                <span class="cp-spacer"></span>
                <button class="cp-mini" title="在播放头处打一个关键帧" @click.stop="addKeyframeAtPlayhead"><el-icon :size="11"><Plus /></el-icon></button>
                <button v-if="selectedClip?.keyframes?.length" class="cp-mini" title="清空关键帧" @click.stop="clearKeyframes">
                  <el-icon :size="11"><Delete /></el-icon>
                </button>
              </div>
              <div v-show="kfOpen" class="cp-grp-body">
                <div class="cp-ins-hint">t=段内位置（0 开头 1 结尾）；缩放>1 才有位移余量；透明度垫黑底过渡</div>
                <div v-for="(k, ki) in selectedClip?.keyframes || []" :key="ki" class="cp-kf-row">
                  <input v-model.number="k.t" class="cp-num" type="number" step="0.05" min="0" max="1" title="段内位置 0~1" />
                  <input v-model.number="k.scale" class="cp-num" type="number" step="0.05" min="1" max="3" title="缩放" />
                  <input v-model.number="k.offsetX" class="cp-num" type="number" step="0.05" min="-0.5" max="0.5" title="水平位移" />
                  <input v-model.number="k.offsetY" class="cp-num" type="number" step="0.05" min="-0.5" max="0.5" title="垂直位移" />
                  <input v-model.number="k.opacity" class="cp-num" type="number" step="0.05" min="0" max="1" title="透明度" />
                  <button class="cp-mini danger" title="删除此关键帧" @click="removeKeyframe(ki)"><el-icon :size="11"><Close /></el-icon></button>
                </div>
                <button class="cp-btn full" @click="applyKeyframes">应用关键帧改动</button>
              </div>
            </div>

            <button class="cp-btn primary full" @click="applyClipPatch">应用片段参数</button>
          </template>

          <!-- 画中画属性 -->
          <template v-else-if="selectedOverlay">
            <div class="cp-ins-head">
              <span class="cp-ins-title">画中画</span>
              <span class="cp-ins-sub">{{ baseName(selectedOverlay.file) }}</span>
            </div>
            <div class="cp-field">
              <label>时间（秒，相对成片）</label>
              <div class="cp-field-row">
                <input v-model.number="selectedOverlay.start" class="cp-num wide" type="number" step="0.1" min="0" />
                <span class="cp-tilde">~</span>
                <input v-model.number="selectedOverlay.end" class="cp-num wide" type="number" step="0.1" min="0" />
              </div>
            </div>
            <div class="cp-field">
              <label>位置锚点</label>
              <select v-model="selectedOverlay.pos" class="cp-select">
                <option v-for="p in OVERLAY_POSITIONS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div class="cp-field">
              <label>大小 <span class="cp-val">{{ (selectedOverlay.scale ?? 0.35).toFixed(2) }}×</span></label>
              <input v-model.number="selectedOverlay.scale" class="cp-range" type="range" min="0.05" max="1" step="0.05" />
            </div>
            <div class="cp-ins-hint">画中画不带音频（口播/配乐由主轨与 BGM 负责）</div>
            <button class="cp-btn primary full" @click="applyOverlayPatch">应用画中画</button>
            <button class="cp-btn danger full" @click="removeOverlay(selectedOverlay.id)">删除画中画</button>
          </template>

          <!-- 字幕属性 -->
          <template v-else-if="selectedText">
            <div class="cp-ins-head">
              <span class="cp-ins-title">字幕 {{ selectedTextIndex + 1 }}</span>
              <span class="cp-ins-sub">{{ (textPatch.end - textPatch.start).toFixed(1) }}s</span>
            </div>

            <!-- 样式模板：一键套用成套样式（对标剪映/必剪的字幕模板） -->
            <div class="cp-field">
              <label>样式模板</label>
              <div class="cp-preset-grid sm">
                <button
                  v-for="s in TEXT_STYLES"
                  :key="s.id"
                  class="cp-preset"
                  :title="s.desc"
                  @click="applyTextStyle(s)"
                >
                  <span class="cp-preset-label">{{ s.label }}</span>
                </button>
              </div>
            </div>

            <div class="cp-field">
              <label>文本</label>
              <textarea v-model="textPatch.text" class="cp-textarea" rows="2"></textarea>
            </div>
            <div class="cp-field">
              <label>时间（秒）</label>
              <div class="cp-field-row">
                <input v-model.number="textPatch.start" class="cp-num wide" type="number" step="0.1" min="0" />
                <span class="cp-tilde">~</span>
                <input v-model.number="textPatch.end" class="cp-num wide" type="number" step="0.1" min="0" />
              </div>
            </div>
            <div class="cp-field">
              <label>动画效果</label>
              <select v-model="textPatch.animation" class="cp-select">
                <option value="">无动画</option>
                <optgroup v-for="g in ANIMATION_GROUPS" :key="g.group" :label="g.group">
                  <option v-for="a in g.items" :key="a.id" :value="a.id" :title="a.desc">{{ a.label }} —— {{ a.desc }}</option>
                </optgroup>
              </select>
            </div>
            <div class="cp-field">
              <label>滑入方向（仅滑动入场）</label>
              <select v-model="textPatch.slideDirection" class="cp-select" :disabled="textPatch.animation !== 'slide'">
                <option value="right">从右滑入</option>
                <option value="left">从左滑入</option>
                <option value="up">从下滑入</option>
                <option value="down">从上滑入</option>
              </select>
            </div>
            <div class="cp-field">
              <label>字号 <span class="cp-val">{{ textPatch.fontSizePx }}px</span></label>
              <input v-model.number="textPatch.fontSizePx" class="cp-range" type="range" min="40" max="200" step="2" />
            </div>
            <div class="cp-field">
              <label>位置</label>
              <div class="cp-seg-btns">
                <button v-for="p in POSITIONS" :key="p.v" class="cp-mini" :class="{ on: textPatch.position === p.v }" @click="textPatch.position = p.v">{{ p.label }}</button>
              </div>
            </div>
            <div class="cp-field">
              <label>颜色</label>
              <div class="cp-field-row">
                <input v-model="textPatch.color" class="cp-color" type="color" title="字幕颜色" />
                <input v-model="textPatch.outlineColor" class="cp-color" type="color" title="描边颜色" />
                <span class="cp-val">字 / 描边</span>
              </div>
            </div>
            <label class="cp-check"><input v-model="textPatch.safeArea" type="checkbox" /> 竖屏安全区（避开底部 UI）</label>
            <button class="cp-btn primary full" @click="applyTextPatch">应用字幕参数</button>
          </template>

          <div v-else class="cp-empty">
            <template v-if="!clipCount">还没有片段。<br />把左侧素材拖入时间轴开始剪辑，或直接在对话里让剪辑师剪。</template>
            <template v-else>在时间轴上选中一个片段或字幕后<br />在这里调整参数。</template>
          </div>
        </div>

        <div v-show="rightTab === 'chat'" class="cp-chat">
          <ChatMessageList />
          <ChatInputArea />
        </div>
      </aside>
    </div>

    <!-- ===== 项目列表（剪映式草稿箱）：进模式先看到这个，而不是直接开空白时间轴 =====
         ★ 为什么要有：剪辑是**产出型**工作，用户真正要管的是"手上有几个片子、各剪到哪了"。
           没有列表就只能显示"当前会话"的工程，几个片子之间切来切去全靠记忆。
         一个项目 = 一条时间线 = 一个剪辑任务（决策记录，与剪映"草稿"粒度一致）。 -->
    <div v-if="view === 'projects'" class="cp-projects">
      <div class="cp-pj-head">
        <span class="cp-pj-title">剪辑项目</span>
        <span class="cp-pj-count">{{ projectList.length }} 个项目</span>
        <span class="cp-spacer"></span>
        <span class="cp-pj-dir" :title="currentSpaceDir || '未绑定项目目录：产物落在默认数据目录。绑定后素材与成片都归档到该目录（团队交接/多机迁移更省事）'">
          <el-icon :size="12"><FolderOpened /></el-icon>
          {{ currentSpaceDir ? shortPath(currentSpaceDir) : '默认目录' }}
        </span>
        <button class="cp-btn ghost" @click="spaceDirPicker = true" title="把项目目录绑定到工作目录（复用空间机制）">
          <el-icon :size="13"><FolderOpened /></el-icon>项目目录
        </button>
        <button class="cp-btn ghost" :disabled="loadingList" @click="loadProjects" title="重新读取项目列表">
          <el-icon :size="13"><Refresh /></el-icon>刷新
        </button>
        <button class="cp-btn primary" @click="newProjectDialog = true">
          <el-icon :size="13"><Plus /></el-icon>新建项目
        </button>
      </div>

      <div v-if="loadingList" class="cp-empty">正在读取项目…</div>
      <div v-else-if="!projectList.length" class="cp-empty">
        还没有剪辑项目。<br />点「新建项目」选好画幅即可开始；也可以在对话里让剪辑师直接开剪。
      </div>
      <div v-else class="cp-pj-grid">
        <div
          v-for="p in projectList"
          :key="p.conversationId"
          class="cp-pj-card"
          :class="{ active: p.conversationId === convId }"
          @click="openProject(p.conversationId)"
        >
          <div class="cp-pj-cover" :style="coverStyle(p.output)">
            <span class="cp-pj-dur">{{ fmtTime(p.totalDuration) }}</span>
            <span v-if="p.missingClips" class="cp-pj-warn" :title="`${p.missingClips} 个素材文件已不在原位置`">
              <el-icon :size="11"><WarningFilled /></el-icon>{{ p.missingClips }}
            </span>
          </div>
          <div class="cp-pj-info">
            <div class="cp-pj-name" :title="p.title">{{ p.title }}</div>
            <div class="cp-pj-meta">
              {{ p.clipCount }} 段 · {{ p.textCount }} 字幕<template v-if="p.hasBgm"> · BGM</template>
            </div>
            <div class="cp-pj-time">{{ p.output?.size || '—' }} · {{ timeAgo(p.projectUpdatedAt || p.updatedAt) }}</div>
          </div>
          <button class="cp-pj-del" title="删除项目（不删素材源文件）" @click.stop="askDeleteProject(p)">
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- 新建项目：**规格在这一步定**（画幅是工程参数，不是编辑期可随手改的东西） -->
    <el-dialog v-model="newProjectDialog" title="新建剪辑项目" width="440px" :append-to-body="true">
      <div class="cp-np">
        <label class="cp-np-row">
          <span>项目名称</span>
          <input v-model="newName" class="cp-input" placeholder="未命名剪辑" @keyup.enter="createProject" />
        </label>
        <div class="cp-np-row col">
          <span>画幅（决定成片比例与渲染规格）</span>
          <div class="cp-preset-grid">
            <button
              v-for="s in SPEC_PRESETS"
              :key="s.size"
              class="cp-preset"
              :class="{ on: newSize === s.size }"
              @click="newSize = s.size; newFps = s.fps"
            >
              <span class="cp-preset-ratio" :style="{ aspectRatio: String(s.w / s.h) }"></span>
              <span class="cp-preset-label">{{ s.label }}</span>
              <span class="cp-preset-size">{{ s.size }} · {{ s.fps }}fps</span>
            </button>
          </div>
        </div>
        <div class="cp-np-hint">
          画幅在建项目时确定：它决定时间轴比例、字幕字号基准与渲染规格。
          中途要换画幅请新建项目（与剪映 / Premiere 一致）。
        </div>
      </div>
      <template #footer>
        <button class="cp-btn" @click="newProjectDialog = false">取消</button>
        <button class="cp-btn primary" :disabled="creating" @click="createProject">{{ creating ? '创建中…' : '创建并开始剪辑' }}</button>
      </template>
    </el-dialog>

    <!-- 内置音效库：合成式免版权音效，一键生成并加入会话素材库 -->
    <el-dialog v-model="sfxLibOpen" title="内置音效库" width="540px" :append-to-body="true">
      <div class="cp-sfxl">
        <div class="cp-sfxl-note">
          音效由 ffmpeg 实时合成（<b>免版权</b>），点一下即生成并加到素材库。
          <br />旋律性配乐无法合成，请自备或从素材市场获取。
        </div>
        <div v-for="g in sfxGroups" :key="g.group" class="cp-sfxl-group">
          <div class="cp-sfxl-gtitle">{{ g.group }}</div>
          <div class="cp-sfxl-items">
            <button
              v-for="it in g.items"
              :key="it.id"
              class="cp-sfxl-item"
              :disabled="sfxBusy === it.id"
              :title="it.desc"
              @click="generateSfx(it.id)"
            >
              <span class="cp-sfxl-label">{{ it.label }}</span>
              <span class="cp-sfxl-desc">{{ it.desc }}</span>
              <span class="cp-sfxl-meta">{{ it.maxSec }}s</span>
              <span v-if="sfxBusy === it.id" class="cp-sfxl-busy">生成中…</span>
            </button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 删除项目确认（外部动作：删会话与工程文件，不删素材源文件） -->
    <el-dialog v-model="delDialog" title="删除项目" width="400px" :append-to-body="true">
      <div class="cp-np">
        <div>将删除项目「{{ delTarget?.title }}」及其工程文件、渲染产物。</div>
        <div class="cp-np-hint">素材源文件不会被删除。</div>
      </div>
      <template #footer>
        <button class="cp-btn" @click="delDialog = false">取消</button>
        <button class="cp-btn danger" @click="doDeleteProject">删除</button>
      </template>
    </el-dialog>

    <!-- 右键菜单（时间轴片段 / 字幕 / 素材 / 空白区 四种上下文，统一一套渲染） -->
    <div
      v-if="ctxMenu.show"
      class="cp-ctx"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <div class="cp-ctx-title">{{ ctxMenu.title }}</div>
      <button
        v-for="(item, i) in ctxMenu.items"
        :key="i"
        class="cp-ctx-item"
        :class="{ disabled: item.disabled, danger: item.danger }"
        :disabled="item.disabled"
        :title="item.hint || ''"
        @click="runCtxItem(item)"
      >
        <el-icon v-if="item.icon" :size="12"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
        <span v-if="item.shortcut" class="cp-ctx-key">{{ item.shortcut }}</span>
      </button>
    </div>
    <!-- 点任意处关闭菜单（透明遮罩，不挡视觉） -->
    <div v-if="ctxMenu.show" class="cp-ctx-mask" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu"></div>

    <!-- 项目目录选择（复用空间机制：绑定 dirPath 后该项目的素材/成片都归档到该目录） -->
    <WorkspaceDirDialog v-model="spaceDirPicker" :current-path="currentSpaceDir" @selected="onDirSelected" />

    <div v-if="lastNote" class="cp-toast" @click="lastNote = ''">{{ lastNote }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  ArrowLeft, ArrowRight, Back, Check, ChatLineSquare, CopyDocument, DArrowLeft, Delete,
  Close, EditPen, FolderOpened, Headset, Loading, Microphone, Picture, Plus, Refresh, RefreshLeft, RefreshRight, Scissor, VideoCamera, VideoPlay, View, WarningFilled,
} from '@element-plus/icons-vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import WorkspaceDirDialog from '../components/WorkspaceDirDialog.vue';
import { useSpaceStore } from '../stores/space';
import { leadOf, activeMode, type LeadMode } from '../stores/mode';
import { useChat } from '../composables/chat/useChat';
import { api, API_BASE, getLicenseCode } from '../api/client';
import { clampMenuPos } from '../utils/menuPosition';
import {
  COLOR_EFFECTS, TEXT_ANIMATIONS, AUDIO_EFFECTS, MASK_SHAPES, MASK_KEYS, TEXT_STYLES,
  TRANSITIONS, OVERLAY_POSITIONS, groupEffects, effectIds, type TextStylePreset,
} from '@yan-zhi/shared';

/**
 * 效果清单全部来自 @yan-zhi/shared 的效果库（**单一真相源**）。
 * ★★★ 此前这里手写了一份字幕动画清单、调色下拉又手写了一份 ——
 *   与后端实现三处并行，改一处必漏另外两处（症状：UI 有但后端不认 / 反之，都不报错）。
 *   UI 分组直接用效果库的 group 字段，与工具 schema 的 enum 同源。
 */
const ANIMATION_GROUPS = groupEffects(TEXT_ANIMATIONS);
const COLOR_GROUPS = groupEffects(COLOR_EFFECTS);
const AUDIO_GROUPS = groupEffects(AUDIO_EFFECTS);
const TRANSITION_GROUPS = groupEffects(TRANSITIONS);
const POSITIONS = [{ v: 'bottom', label: '底部' }, { v: 'center', label: '居中' }, { v: 'top', label: '顶部' }];

/** 新建项目时的画幅预设（建项目时定规格，见下方注释）。 */
const SPEC_PRESETS = [
  { size: '1080x1920', w: 1080, h: 1920, fps: 30, label: '竖屏 9:16 · 抖音/快手' },
  { size: '1920x1080', w: 1920, h: 1080, fps: 30, label: '横屏 16:9 · B站/YouTube' },
  { size: '1080x1080', w: 1080, h: 1080, fps: 30, label: '方形 1:1 · 朋友圈' },
  { size: '720x1280', w: 720, h: 1280, fps: 30, label: '竖屏 720P · 轻量' },
];

interface ClipSegment {
  id: string; file: string; label?: string;
  trimStart?: number; trimEnd?: number; speed?: number; colorPreset?: string;
  fadeIn?: number; fadeOut?: number; kenburns?: { direction: 'in' | 'out'; duration: number };
  /** 蒙版：形状取景（shape）或色键抠像（key）；字段与后端 clip-project 的 ClipSegment.mask 一致 */
  mask?: {
    shape?: string; key?: string;
    scale?: number; offsetX?: number; offsetY?: number; feather?: number;
  };
  /** 与前一段之间的转场（挂在后一段上，语义="我进来时怎么出现"） */
  transition?: { type: string; duration?: number };
  audioFile?: string; keepOriginalAudio?: boolean; volume?: number;
  /** 画面裁剪（比例 0~1，裁子区域后回填画幅；与后端 clip-project 同构） */
  crop?: { x?: number; y?: number; w?: number; h?: number };
  /** 关键帧动画：t 为段内时间比例 0~1（与后端 clip-project 同构） */
  keyframes?: Array<{ t: number; scale?: number; offsetX?: number; offsetY?: number; opacity?: number }>;
}
interface ClipText {
  id: string; text: string; start: number; end: number;
  animation?: string; slideDirection?: string; fontSizePx?: number;
  /** 描边宽度（像素，1920 高基准） */
  outlinePx?: number;
  /** 背景底板色 #RRGGBBAA（A=不透明度）；不填=无底板 */
  backColor?: string;
  color?: string; outlineColor?: string; position?: string; safeArea?: boolean;
}
interface ClipProject {
  version: 1; name: string; updatedAt: number;
  output: { size: string; fps: number };
  clips: ClipSegment[]; texts: ClipText[];
  /** 音效链（整片，按顺序串联；见效果库 AUDIO_EFFECTS） */
  audioFx?: string[];
  bgm?: { file: string; volume: number; duck: boolean };
  /** 画中画叠加轨（时间相对成片；与后端 clip-project 同构） */
  overlays?: Array<{ id: string; file: string; start: number; end: number; pos?: string; scale?: number }>;
}
interface ConvFile { id?: string; name: string; path: string; type?: string }
interface ProjectListItem {
  conversationId: string; title: string; createdAt: number; updatedAt: number;
  projectUpdatedAt: number; clipCount: number; textCount: number; totalDuration: number;
  hasBgm: boolean; output: { size: string; fps: number } | null; missingClips: number;
}

const chat = useChat();
const lead = ref<LeadMode>(leadOf(activeMode.value));
// 视图：projects = 项目列表（进模式先看这个）；editor = 时间轴编辑
const view = ref<'projects' | 'editor'>('projects');
const projectList = ref<ProjectListItem[]>([]);
const loadingList = ref(false);
const newProjectDialog = ref(false);
const newName = ref('');
const newSize = ref('1080x1920');
const newFps = ref(30);
const creating = ref(false);
const delDialog = ref(false);
const delTarget = ref<ProjectListItem | null>(null);
const spaceDirPicker = ref(false);
const rightTab = ref<'inspector' | 'chat'>('inspector');
const spaceStore = useSpaceStore();
/** 当前绑定的项目目录（空间 dirPath）；未绑定 = 产物落默认数据目录。 */
const currentSpaceDir = computed(() => spaceStore.currentSpace?.dirPath || '');
const project = ref<ClipProject | null>(null);
const projectName = ref('');
const dirty = ref(false);
const files = ref<ConvFile[]>([]);
const keyword = ref('');
const selectedClipId = ref('');
const selectedTextId = ref('');
const outSize = ref('1080x1920');
const outFps = ref(30);
const previewUrl = ref('');
/**
 * 监视模式：
 *  · live = 实时预览帧（拖动播放头即时取帧）——**默认**，编辑时用
 *  · clip = 播放已渲染的成片 —— 核对成片时用
 * ★ 默认 live：剪辑工作台的核心体验是"改一下马上看到"；
 *   此前只有成片模式，等于没有预览（用户："边剪辑边预览没有？"）。
 */
const monitorMode = ref<'live' | 'clip'>('live');
/** 实时帧的 object URL（服务端返回 PNG，这里转成 URL 给 <img>） */
const liveFrameUrl = ref('');
const frameLoading = ref(false);
const frameError = ref('');
/** 是否处于拖拽中（拖动修剪时抑制"点击选中"的副作用） */
const dragMoved = ref(false);
const lastNote = ref('');
const rendering = ref(false);
const playhead = ref(0);
const videoDur = ref(0);
const zoom = ref(1);
const bgmVolume = ref(0.25);
const bgmDuck = ref(false);
const tlScroll = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);

const clipPatch = reactive({
  trimStart: undefined as number | undefined, trimEnd: undefined as number | undefined,
  speed: 1, volume: 1, fadeIn: undefined as number | undefined,
  fadeOut: undefined as number | undefined, colorPreset: '',
  // 蒙版（形状与抠像互斥，色键优先）
  maskShape: '', maskKey: '', maskScale: 0.9, maskOffsetX: 0, maskOffsetY: 0, maskFeather: 0,
  // 转场（与前一段之间）
  transitionType: '', transitionDuration: 0.8,
  // 画面裁剪（比例 0~1；w/h=1 且 x/y=0 = 未裁剪）
  cropX: 0, cropY: 0, cropW: 1, cropH: 1,
});
const maskOpen = ref(false);
const transOpen = ref(false);
const cropOpen = ref(false);
const kfOpen = ref(false);
const pipOpen = ref(false);
const selectedOverlayId = ref('');
const textPatch = reactive({
  text: '', start: 0, end: 0, fontSizePx: 88, outlinePx: 12, backColor: '', animation: '',
  slideDirection: 'right', position: 'bottom', color: '#FFFFFF', outlineColor: '#000000', safeArea: false,
});

const convId = computed(() => chat.store.currentConvId || '');
const clips = computed(() => project.value?.clips || []);
/**
 * 素材真实元数据（路径 → 时长/分辨率），由服务端 ffprobe 探测（见 /api/clip/probe）。
 * ★ 时间轴排布必须基于**真实时长**：用假值会让"总时长/字幕时间点"全部错位，
 *   而用户看到的是一个"看起来正常"的数字，无从察觉。
 */
const mediaMeta = ref<Record<string, { path?: string; duration: number; width: number; height: number; hasVideo: boolean; ok: boolean }>>({});

/**
 * 批量探测素材真实时长。
 * ★ 只探**还没探过的**路径（编辑过程中反复调用是常态，重复探测会让时间轴持续卡顿）；
 *   ★ 探测失败的也记进缓存（值全 0），否则每次刷新都会重试一批注定失败的路径。
 *
 * ★★ 返回结构别多解一层（2026-10-07 实际踩到）：`apiFetch` 已经把响应解包成
 *   `{ data: <接口的 data 字段> }`（见 api/client.ts），所以这里应当是 `r.data.data`…
 *   **不对** —— 接口返回 `{data: [...]}`，解包后 `r.data` 就是那个数组本身。
 *   写 `r.data.data` 会拿到 undefined → 探测结果被静默丢弃 → 时长永远显示"未知"。
 */
async function loadMediaMeta() {
  const paths = clips.value.map((c) => c.file).filter((p) => p && !(p in mediaMeta.value));
  if (!paths.length) return;
  type ProbeItem = { path: string; duration: number; width: number; height: number; hasVideo: boolean; ok: boolean };
  const r = await api.post<ProbeItem[]>('/clip/probe', { items: paths.map((p) => ({ path: p })) });
  if ('error' in r) return;
  const list: ProbeItem[] = Array.isArray(r.data) ? r.data : [];
  const next = { ...mediaMeta.value };
  for (const it of list) next[it.path] = it;
  // 未返回的（如接口只处理了前 200 个）也要落缓存，避免反复重试
  for (const p of paths) if (!(p in next)) next[p] = { duration: 0, width: 0, height: 0, hasVideo: false, ok: false };
  mediaMeta.value = next;
}

// ===== 实时预览（边剪辑边预览）=====
let frameTimer: ReturnType<typeof setTimeout> | null = null;
/** 进行中的请求序号：只认最后一次的结果，防"拖动时旧响应覆盖新画面"（竞态）。 */
let frameSeq = 0;

/**
 * 取预览帧（带防抖）。
 * ★ 防抖 120ms：拖动播放头会连续触发，逐个请求会把 ffmpeg 打满、且画面反而卡。
 * ★ 序号防竞态：慢的旧响应回来时若已有更新的请求，直接丢弃 —— 否则画面会"跳回旧位置"。
 * ★ 用 object URL 而不是 data URL：data URL 在大图上会显著拖慢 DOM 更新。
 */
function scheduleFrameFetch(delay = 120) {
  if (monitorMode.value !== 'live') return;
  if (frameTimer) clearTimeout(frameTimer);
  frameTimer = setTimeout(() => { void fetchFrame(); }, delay);
}

async function fetchFrame() {
  if (!convId.value || !clipCount.value) { replaceFrameUrl(''); return; }
  const mySeq = ++frameSeq;
  frameLoading.value = true;
  frameError.value = '';
  try {
    const code = getLicenseCode();
    const qs = code ? `&license=${encodeURIComponent(code)}` : '';
    // ★ URL 带工程版本（project.updatedAt）：改了参数 URL 就变，
    //   即使中间有代理/浏览器缓存也不会拿到旧帧（与 no-store 双保险）。
    const ver = project.value?.updatedAt || 0;
    const url = `${API_BASE}/clip/frame?conversationId=${encodeURIComponent(convId.value)}&t=${playhead.value.toFixed(3)}&v=${ver}${qs}`;
    const res = await fetch(url);
    if (mySeq !== frameSeq) return;   // 有更新的请求在飞 → 本次结果作废
    if (!res.ok) {
      // 后端已把原因写在 error 字段里（如"素材时长未知"）——如实展示，不静默空白
      const j = await res.json().catch(() => ({}));
      frameError.value = j.error || `取帧失败(${res.status})`;
      replaceFrameUrl('');
      return;
    }
    const blob = await res.blob();
    if (mySeq !== frameSeq) return;
    replaceFrameUrl(URL.createObjectURL(blob));
  } catch (e) {
    if (mySeq !== frameSeq) return;
    frameError.value = `取帧失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (mySeq === frameSeq) frameLoading.value = false;
  }
}

/** 换帧前释放上一张 object URL（不释放会持续泄漏内存）。 */
function replaceFrameUrl(next: string) {
  const prev = liveFrameUrl.value;
  if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
  liveFrameUrl.value = next;
}

function onFrameError() {
  // <img> 加载失败（极少见，通常是 URL 被回收）→ 重取一次
  frameError.value = '画面加载失败，正在重试';
  scheduleFrameFetch(60);
}

function setMonitorMode(m: 'live' | 'clip') {
  monitorMode.value = m;
  if (m === 'live') scheduleFrameFetch(0);
}

/** 时长显示：探不到真实值时明确标"未知"，不假装算对了。 */
const unknownDuration = computed(() => clips.value.some((c) => !mediaMeta.value[c.file]?.ok && !c.kenburns));
const texts = computed(() => project.value?.texts || []);
const clipCount = computed(() => clips.value.length);
const textCount = computed(() => texts.value.length);
const bgm = computed(() => project.value?.bgm || null);
const overlays = computed(() => project.value?.overlays || []);
const selectedOverlay = computed(() => overlays.value.find((o) => o.id === selectedOverlayId.value) || null);
const monitorHint = computed(() => (clipCount.value ? '点「预览档」渲染后可在此播放成片' : '加入素材并让剪辑师渲染后，这里显示成片'));

const BASE_PX_PER_SEC = 34;
const pxPerSec = computed(() => BASE_PX_PER_SEC * zoom.value);

/** 段估算时长（真实时长以渲染时探测为准；未裁剪未知长度的按 5s 占位）。 */
/**
 * 段时长（秒）。
 *
 * ★★★ 修复（2026-10-07 用户报「10s 的素材只当 3s」）：此前 `trimEnd` 缺省时**硬编码 +5s**，
 *   于是没裁剪的段一律被当成 5 秒 —— 时间轴宽度、总时长、字幕换算全错，
 *   而素材真实时长其实**可以拿到**（服务端 ffprobe，见 mediaMeta / loadMediaMeta）。
 *   现在的口径：优先用真实时长；真的探不到（素材被移走）才用 0 并标记"未知"，
 *   不再用一个假的固定值让用户以为算对了。
 */
function segSeconds(c: ClipSegment): number {
  const raw = mediaMeta.value[c.file]?.duration ?? 0;
  const ts = c.trimStart ?? 0;
  // 没裁剪时用真实全长；探不到真实时长时退化为"已裁剪部分"（0 若也没裁）
  const te = c.trimEnd ?? (raw > 0 ? raw : ts);
  return c.kenburns?.duration ?? Math.max(0, te - ts) / (c.speed ?? 1);
}
const estTotal = computed(() => Math.max(1, clips.value.reduce((a, c) => a + segSeconds(c), 0)));
/**
 * 工程时长标签。
 *
 * ★★ 必须用 estTotal（时间轴各段真实时长之和），**不能用 videoDur**（2026-10-07 实际踩到）：
 *   videoDur 是 <video> 预览播放器的时长 —— 那播放的是**上一次渲染的成片**（可能是旧版本），
 *   而顶部标签表达的是「当前工程有多长」。两者是不同的东西：
 *   改了时间轴还没重新渲染时，用 videoDur 会显示旧成片的长度，让人以为改动没生效。
 */
const totalDurationLabel = computed(() => {
  // 有探不到时长的素材时明确标注，避免用户把估算值当成准确值
  return unknownDuration.value ? `${estTotal.value.toFixed(1)}s（含未知时长素材）` : `${estTotal.value.toFixed(1)}s`;
});
const canvasWidth = computed(() => Math.max(320, estTotal.value * pxPerSec.value + 80));

/** 刻度：按缩放选步长，保证标签不重叠。 */
const ticks = computed(() => {
  const target = 70 / pxPerSec.value; // 每 ~70px 一个刻度
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const stepSec = steps.find((s) => s >= target) || 300;
  const out: Array<{ sec: number; x: number; label: string }> = [];
  for (let s = 0; s <= estTotal.value + stepSec; s += stepSec) {
    out.push({ sec: s, x: s * pxPerSec.value, label: fmtTime(s) });
  }
  return out;
});

function segLeft(i: number): number {
  let x = 0;
  for (let k = 0; k < i; k++) x += segSeconds(clips.value[k]);
  return x * pxPerSec.value;
}
function segWidth(c: ClipSegment): number {
  return Math.max(30, segSeconds(c) * pxPerSec.value);
}
/**
 * 画面按输出规格的比例展示（竖屏 9:16 / 横屏 16:9），在深色舞台里居中。
 * ★ 只约束**画面**、不约束舞台：舞台铺满剩余宽度，画面在其中按比例居中留黑
 *   —— 把比例套在舞台上的话，竖屏工程会让舞台宽度塌成 146px（上一版踩到）。
 */
const stageStyle = computed(() => {
  const [w, h] = outSize.value.split('x').map(Number);
  return { aspectRatio: `${w && h ? w / h : 9 / 16}` };
});

const selectedClip = computed(() => clips.value.find((c) => c.id === selectedClipId.value) || null);
const selectedClipIndex = computed(() => clips.value.findIndex((c) => c.id === selectedClipId.value));
const selectedText = computed(() => texts.value.find((t) => t.id === selectedTextId.value) || null);
const selectedTextIndex = computed(() => texts.value.findIndex((t) => t.id === selectedTextId.value));

const filteredFiles = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  const list = files.value.filter((f) => /\.(mp4|webm|mov|m4v|mkv|avi|png|jpe?g|webp|gif|mp3|m4a|wav|aac|flac)$/i.test(f.path || f.name));
  return k ? list.filter((f) => (f.name || '').toLowerCase().includes(k)) : list;
});

function baseName(p: string): string { return String(p || '').split(/[\\/]/).pop() || ''; }
function isVideo(f: ConvFile): boolean { return /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(f.path || f.name); }
function isImage(f: ConvFile): boolean { return /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.path || f.name); }
function animationLabel(id: string): string {
  // 从效果库取中文名（与后端字幕预设同一份清单）
  return TEXT_ANIMATIONS.find((a) => a.id === id)?.label || id;
}
function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(1)}s`;
}
function zoomBy(f: number) { zoom.value = Math.min(6, Math.max(0.25, zoom.value * f)); }

/**
 * 预览播放地址。
 * ★ 参数名与 FilePreview 保持一致：授权码是 `license=`（不是 x-license），
 *   且**不加 token** —— file-stream 走 authMiddleware 的本地 guest 身份，
 *   多带一个 query token 只会在日志里留痕，没有实际作用。
 */
function streamUrl(name: string): string {
  if (!convId.value || !name) return '';
  const code = getLicenseCode();
  const qs = code ? `&license=${encodeURIComponent(code)}` : '';
  return `${API_BASE}/conversations/${encodeURIComponent(convId.value)}/file-stream?name=${encodeURIComponent(name)}${qs}`;
}

// ===== 工程读写 =====
async function reload() {
  if (!convId.value) { project.value = null; return; }
  const r = await api.get<{ exists: boolean; project: ClipProject | null }>(`/clip/project?conversationId=${encodeURIComponent(convId.value)}`);
  if ('error' in r) { note(`读取工程失败：${r.error}`); return; }
  project.value = r.data.project || null;
  projectName.value = r.data.project?.name || '';
  outSize.value = r.data.project?.output?.size || '1080x1920';
  outFps.value = r.data.project?.output?.fps || 30;
  bgmVolume.value = r.data.project?.bgm?.volume ?? 0.25;
  bgmDuck.value = !!r.data.project?.bgm?.duck;
  dirty.value = false;
  if (!r.data.exists) note('当前会话还没有工程：让剪辑师开始剪辑，或把素材拖入时间轴');
  // ★ 工程读进来后立刻探真实时长（时间轴排布依赖它；不探就会用假值，见 segSeconds 注释）
  await loadMediaMeta();
  // ★ 历史基线对齐到刚读入的工程（否则首次编辑会把"载入前"当基线，撤销会跳到空工程）
  resetHistory();
  // 时长探到了才能定位取帧（否则 locateTimeline 算不出偏移）
  if (monitorMode.value === 'live' && clipCount.value) scheduleFrameFetch(200);
}

// ===== 撤销 / 重做 =====
/**
 * 历史栈。
 *
 * ★★★ 为什么必须做（2026-10-07 用户："实现一个剪辑软件最基础的功能"）：
 *   撤销是任何编辑器的**门槛功能** —— 没有它，用户不敢试任何效果（试错了要手动改回来）。
 *   此前完全没有（grep undo/redo/撤销 = 0 处）。
 *
 * ★★ 实现取舍：**不在 11 个改动点逐个手动入栈** —— 那必然漏（本项目已有多次"改了 A 漏了 B"），
 *   而是在**唯一的落盘入口 save()** 统一快照。
 *   save() 是所有编辑操作的必经之路（11 处 `dirty=true; await save()`），
 *   在它入栈 = 自动覆盖全部操作，且新增操作无需记得加代码。
 *
 * ★ 快照内容：只存**工程数据**（不含 UI 状态如选中项/播放头）——
 *   撤销应该还原"工程是什么样"，而不是"界面停在哪"。
 */
interface HistoryEntry { json: string; label: string }
const undoStack = ref<HistoryEntry[]>([]);
const redoStack = ref<HistoryEntry[]>([]);
const HISTORY_MAX = 50;
/** 正在应用撤销/重做时不再入栈（否则撤销动作本身会变成一条新历史，陷入循环） */
let applyingHistory = false;

function snapshotProject(): string {
  return JSON.stringify(project.value ?? null);
}

/** 入栈（在 save 之前调用，存入**改动前**的状态）。 */
function pushHistory(label: string, beforeJson: string) {
  if (applyingHistory) return;
  const top = undoStack.value[undoStack.value.length - 1];
  // 内容没变就不入栈（避免"点一下没改动"也占一条历史）
  if (top && top.json === beforeJson) return;
  undoStack.value.push({ json: beforeJson, label });
  if (undoStack.value.length > HISTORY_MAX) undoStack.value.shift();
  redoStack.value = [];   // 新操作使重做链失效（标准行为）
}

async function undo() {
  const entry = undoStack.value.pop();
  if (!entry) { note('没有可撤销的操作'); return; }
  const current = snapshotProject();
  redoStack.value.push({ json: current, label: entry.label });
  applyingHistory = true;
  try {
    project.value = JSON.parse(entry.json) as ClipProject | null;
    await persistProject();       // 只落盘，不再入栈
    lastCommitted = snapshotProject();   // ★ 基线同步，否则撤销后再编辑会存错快照
    refreshSelectionAfterHistory();
  } finally { applyingHistory = false; }
  note(`已撤销：${entry.label}`);
}

async function redo() {
  const entry = redoStack.value.pop();
  if (!entry) { note('没有可重做的操作'); return; }
  const current = snapshotProject();
  undoStack.value.push({ json: current, label: entry.label });
  applyingHistory = true;
  try {
    project.value = JSON.parse(entry.json) as ClipProject | null;
    await persistProject();
    lastCommitted = snapshotProject();   // ★ 同上
    refreshSelectionAfterHistory();
  } finally { applyingHistory = false; }
  note(`已重做：${entry.label}`);
}

/** 撤销/重做后：清掉已不存在的选中项（否则属性面板会指向幽灵片段） */
function refreshSelectionAfterHistory() {
  if (selectedClipId.value && !clips.value.some((c) => c.id === selectedClipId.value)) selectedClipId.value = '';
  if (selectedTextId.value && !texts.value.some((t) => t.id === selectedTextId.value)) selectedTextId.value = '';
  if (selectedClipId.value) selectClip(selectedClipId.value);
  else if (selectedTextId.value) selectText(selectedTextId.value);
  scheduleFrameFetch(200);
}

/** 真正落盘（不含历史逻辑）—— save 与 undo/redo 共用。 */
async function persistProject(): Promise<boolean> {
  if (!project.value) return false;
  if (!convId.value) return false;  // 草稿态不落盘（首次加素材时由 ensureConversation 建会话）
  project.value.name = projectName.value || project.value.name;
  project.value.output = { size: outSize.value, fps: outFps.value };
  project.value.updatedAt = Date.now();
  const r = await api.put('/clip/project', { conversationId: convId.value, project: project.value });
  if ('error' in r) { note(`保存失败：${r.error}`); return false; }
  dirty.value = false;
  return true;
}

/** label 由调用方在 save 前临时设置（描述"这次改了什么"，撤销时可读）。 */
const pendingLabel = ref('编辑');

/**
 * 最后一次"已提交（或刚载入）"的工程快照。
 *
 * ★★★ 为什么必须有它（2026-10-07 实测踩到：撤销点了没反应）：
 *   第一版直接在 `save()` 里 `const before = snapshotProject()` —— 但 save 是**调用方改完
 *   工程之后**才调的（`project.value.clips.splice(...); await save()`），
 *   此时取到的 before 已经是**改动后**的状态 → 入栈的是"现状" → 撤销回现状 = 看似无效。
 *   ★ 正确做法：用一个"跟随工程变化的**上一状态**"来记录真正的改动前快照。
 *     在 save 成功时把 lastCommitted 更新为**当前**状态，于是它永远等于"上一次提交后的样子"。
 */
let lastCommitted = '';

/** 载入工程后调用：把基线对齐到刚读进来的状态（否则第一次编辑会存进一个空/旧基线）。 */
function resetHistory() {
  undoStack.value = [];
  redoStack.value = [];
  lastCommitted = snapshotProject();
}

async function save() {
  if (!project.value) return;
  const after = snapshotProject();
  const ok = await persistProject();
  // ★ 落盘成功才入历史栈：保存失败说明改动没生效，不该给用户一条"可撤销"的假历史
  if (ok) {
    pushHistory(pendingLabel.value, lastCommitted);   // 入栈的是**改动前**的状态
    lastCommitted = after;                            // 基线推进到当前
  }
  pendingLabel.value = '编辑';
}

async function loadFiles() {
  if (!convId.value) return;
  const r = await api.get<{ data?: ConvFile[] } | ConvFile[]>(`/conversations/${encodeURIComponent(convId.value)}/files`);
  if ('error' in r) return;
  const d = r.data as { data?: ConvFile[] } | ConvFile[];
  files.value = Array.isArray(d) ? d : (d.data || []);
  // 预览优先给最新一段视频产物（渲染完成后自动出现）
  const vids = files.value.filter((f) => isVideo(f) && /\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name));
  if (vids.length && !previewUrl.value) {
    const last = vids[vids.length - 1];
    previewUrl.value = streamUrl(last.name);
  }
}

// ===== 素材导入（本机文件 → 会话素材库）=====
/**
 * 从本机导入素材。
 *
 * ★★★ 为什么必须有（2026-10-07 用户截图指出）：素材栏空态写着"用「+」上传"，
 *   但**那个「+」在这个页面根本不存在**（是照着聊天输入区写的文案）——纯误导。
 *   剪辑的第一步就是"把素材搞进来"，而此前唯一的路径是在对话里让剪辑师生成/下载，
 *   用户从本机拖视频进来的路是断的。
 *
 * ★ 实现走**登记真实路径**而不是上传字节：剪辑渲染（ffmpeg）读的是本机绝对路径，
 *   把文件复制进产物目录既慢又占双份空间。登记后与"剪辑师生成的产物"同一套数据模型
 *   （conversation_file），素材栏/文件管理都能看到 —— 与 Premiere「引用式素材」同思路。
 *   代价：源文件被移动/删除会变成"离线素材"，项目列表卡片的角标已做提示。
 *
 * ★★ 桌面端（Electron）走原生多选对话框；**Web 端没有原生选择器**，
 *   走隐藏 <input type=file> 取字节后落盘到会话 upload 目录 —— 否则 Web/移动端
 *   这个按钮等于死按钮（点了一下什么都不发生，用户只会认为"功能不可用"）。
 */
async function importMedia() {
  const cid = await ensureConversation();
  if (!cid) { note('无法创建会话，已中止导入'); return; }
  const dlg = (window as any).electronAPI?.dialog;
  if (dlg?.showOpenFiles) {
    const paths: string[] = (await dlg.showOpenFiles()) || [];
    if (!paths.length) return;
    const ok = await registerByPaths(cid, paths);
    await loadFiles();
    note(ok ? `已导入 ${ok} 个素材` : '导入失败，请重试');
    return;
  }
  // 非桌面端：走 <input type=file>（可多选）→ 读字节 → 落盘到会话 upload 目录
  pickViaInput(cid);
}

/** 用隐藏 input 选文件（Web/移动端兜底）。 */
function pickViaInput(cid: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*,image/*,audio/*';
  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const list = Array.from(input.files || []);
    document.body.removeChild(input);
    if (!list.length) return;
    let ok = 0;
    for (const f of list) {
      const saved = await uploadFileBytes(cid, f);
      if (saved) ok++;
    }
    await loadFiles();
    note(ok ? `已上传 ${ok} 个素材` : '上传失败，请重试');
  };
  input.click();
}

/** 非桌面端：把文件字节交给服务端落盘（无原生路径可用）。 */
async function uploadFileBytes(cid: string, f: File): Promise<boolean> {
  try {
    const buf = await f.arrayBuffer();
    // 分块 base64（大文件一次性 btoa 会爆栈）
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
    }
    const r = await api.post(`/conversations/${encodeURIComponent(cid)}/files/upload`, {
      name: f.name, category: 'upload', base64: btoa(bin),
    });
    return !('error' in r);
  } catch {
    return false;
  }
}

/** 桌面端：逐条登记真实路径（引用式素材）。 */
async function registerByPaths(cid: string, paths: string[]): Promise<number> {
  let ok = 0;
  for (const p of paths) {
    const path = String(p || '').replace(/\\/g, '/');
    if (!path) continue;
    const name = path.split('/').pop() || path;
    const r = await api.post(`/conversations/${encodeURIComponent(cid)}/files`, {
      name, path, category: 'upload', source: 'user',
    });
    if (!('error' in r)) ok++;
  }
  return ok;
}

/**
 * 直接把系统文件拖进素材栏。
 *
 * ★★★ Electron 32+ **移除了 `File.path`**（拖入的文件拿不到绝对路径）——
 *   我第一版用了 `(f as any).path`，在 Electron 33（本项目当前版本）上**恒为 undefined**，
 *   于是拖入永远静默失败：「功能还是不可用」就是这个。
 *   正解是 preload 已暴露的 `electronAPI.getPathForFile(file)`（内部走 webUtils）。
 */
async function onDropMedia(e: DragEvent) {
  const dropped = e.dataTransfer?.files;
  if (!dropped || !dropped.length) return;
  const cid = convId.value || await ensureConversation();
  if (!cid) return;
  const api2 = (window as any).electronAPI;
  const getPath = api2?.getPathForFile;
  const resolved: string[] = [];
  const unresolved: File[] = [];
  for (const f of Array.from(dropped)) {
    let p: string | null = null;
    try { p = getPath ? getPath(f) : ((f as File & { path?: string }).path || null); } catch { p = null; }
    if (p) resolved.push(String(p)); else unresolved.push(f);
  }
  let ok = await registerByPaths(cid, resolved);
  // 拿不到路径的（Web 端 / 非文件来源）回落成上传字节，不让"拖了没反应"发生
  for (const f of unresolved) {
    if (await uploadFileBytes(cid, f)) ok++;
  }
  await loadFiles();
  note(ok ? `已导入 ${ok} 个素材` : '未能读取文件，请改用「导入素材」按钮');
}

/** 项目目录说明（顶栏标签的 tooltip）。 */
const projectDirTitle = computed(() =>
  currentSpaceDir.value
    ? `项目目录：${currentSpaceDir.value}\n工程、素材登记与成片都归档到该目录；点此更换`
    : '未绑定项目目录：产物落在默认数据目录。点此选择目录（工程/素材/成片都会归档到那里，便于交接与迁移）');

async function reloadAll() {
  await loadFiles();
  await reload();
  note('已重新读取工程与素材');
}

let noteTimer: ReturnType<typeof setTimeout> | null = null;
function note(msg: string) {
  lastNote.value = msg;
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { lastNote.value = ''; }, 4000);
}

// ===== 右键菜单（对标商用软件：片段/字幕/素材/空白区 四种上下文）=====
interface CtxItem {
  label: string;
  icon?: string;
  shortcut?: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  action: () => void | Promise<void>;
}
const ctxMenu = reactive<{ show: boolean; x: number; y: number; title: string; items: CtxItem[] }>({
  show: false, x: 0, y: 0, title: '', items: [],
});

function openCtxMenu(e: MouseEvent, title: string, items: CtxItem[]) {
  // ★ 必须做边界夹取（复用既有 clampMenuPos）：贴右侧/底部右击时菜单会跑出视窗，
  //   用户看不到最后几项且无法滚动（菜单是 fixed 定位，不受父容器滚动影响）
  const pos = clampMenuPos(e, 200, Math.min(400, 34 + items.length * 28));
  Object.assign(ctxMenu, { show: true, x: pos.x, y: pos.y, title, items });
}
function closeCtxMenu() { ctxMenu.show = false; }
function runCtxItem(it: CtxItem) {
  if (it.disabled) return;
  closeCtxMenu();
  void it.action();
}

/** 片段右键：剪切类操作（商用软件这一组是最高频的） */
function onClipMenu(e: MouseEvent, c: ClipSegment) {
  selectClip(c.id);
  const i = clips.value.findIndex((x) => x.id === c.id);
  openCtxMenu(e, `${i + 1}. ${c.label || baseName(c.file)}`, [
    { label: '在播放头分割', icon: 'Scissor', shortcut: 'S', action: splitAtPlayhead,
      hint: '播放头需落在该片段内部' },
    { label: '在播放头新建字幕', icon: 'ChatLineSquare', action: addTextAtPlayhead },
    { label: '复制片段', icon: 'CopyDocument', shortcut: 'Ctrl+D', action: duplicateClip },
    { label: '删除片段', icon: 'Delete', shortcut: 'Delete', danger: true, action: removeClip },
    { label: '前移一位', icon: 'ArrowLeft', disabled: i <= 0, action: () => moveClip(-1) },
    { label: '后移一位', icon: 'ArrowRight', disabled: i >= clips.value.length - 1, action: () => moveClip(1) },
    { label: '清空所有效果', icon: 'RefreshLeft',
      hint: '去掉调色/蒙版/变速/淡入淡出，保留裁剪与顺序',
      action: clearClipEffects },
    { label: '在文件管理器中显示', icon: 'FolderOpened',
      action: () => revealInSystem(c.file) },
  ]);
}

/** 字幕右键 */
function onTextMenu(e: MouseEvent, t: ClipText) {
  selectText(t.id);
  openCtxMenu(e, `字幕：${t.text.slice(0, 12)}${t.text.length > 12 ? '…' : ''}`, [
    { label: '在播放头对齐起点', icon: 'Clock', action: alignTextToPlayhead },
    { label: '延长 1 秒', icon: 'Plus', action: () => extendText(1) },
    { label: '缩短 1 秒', icon: 'Minus', disabled: (t.end - t.start) <= 1.2, action: () => extendText(-1) },
    { label: '复制字幕', icon: 'CopyDocument', action: duplicateText },
    { label: '删除字幕', icon: 'Delete', shortcut: 'Delete', danger: true, action: removeText },
  ]);
}

/** 素材右键（尚未上轨的原始素材） */
function onMediaMenu(e: MouseEvent, f: ConvFile) {
  openCtxMenu(e, f.name, [
    { label: '加入时间轴末尾', icon: 'Plus', action: () => appendClip(f.path) },
    { label: '在播放头新建字幕', icon: 'ChatLineSquare', disabled: !clipCount.value, action: addTextAtPlayhead },
    ...(isVideo(f) || isImage(f)
      ? [{ label: '设为画中画', icon: 'Picture', disabled: !clipCount.value, action: () => addOverlay(f) }]
      : []),
    ...(isVideo(f) || isImage(f)
      ? [{ label: '设为背景音乐', icon: 'Headset', disabled: !/mp3|m4a|wav|aac|flac/i.test(f.path || f.name),
          action: () => setBgm(f.path) }]
      : [{ label: '设为背景音乐', icon: 'Headset', action: () => setBgm(f.path) }]),
    { label: '复制路径', icon: 'DocumentCopy', action: () => copyText(f.path) },
    { label: '在文件管理器中显示', icon: 'FolderOpened', action: () => revealInSystem(f.path) },
  ]);
}

/** 空白区右键（整片操作） */
function onEmptyMenu(e: MouseEvent) {
  openCtxMenu(e, '工程', [
    { label: '撤销', icon: 'RefreshLeft', shortcut: 'Ctrl+Z', disabled: !undoStack.value.length, action: undo },
    { label: '重做', icon: 'RefreshRight', shortcut: 'Ctrl+Shift+Z', disabled: !redoStack.value.length, action: redo },
    { label: '播放/暂停', icon: 'VideoPlay', shortcut: '空格', action: togglePlay },
    { label: '回到开头', icon: 'DArrowLeft', shortcut: 'Home', action: () => seek(0) },
    { label: '跳到结尾', icon: 'DArrowRight', shortcut: 'End', action: () => seek(estTotal.value) },
    { label: '在播放头新建字幕', icon: 'ChatLineSquare', disabled: !clipCount.value, action: addTextAtPlayhead },
    { label: '出预览档', icon: 'VideoCamera', disabled: !clipCount.value, action: () => render(true) },
    { label: '导出成片', icon: 'Check', disabled: !clipCount.value, action: () => render(false) },
    { label: '刷新工程与素材', icon: 'Refresh', action: reloadAll },
  ]);
}

/** 复制文本到剪贴板（失败时如实提示，不静默）。 */
async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    note('已复制到剪贴板');
  } catch {
    note('复制失败（浏览器未授权剪贴板）');
  }
}

/** 在系统文件管理器中显示（桌面端走 Electron shell；失败/不支持时提示）。 */
function revealInSystem(p: string) {
  const api2 = (window as any).electronAPI;
  if (api2?.shell?.showItemInFolder) {
    try { api2.shell.showItemInFolder(String(p).replace(/\//g, '\\')); return; } catch { /* 落到提示 */ }
  }
  note('当前环境不支持打开文件管理器');
}

/** 去掉片段上的所有效果（保留裁剪与顺序）——"试了半天想还原"时最需要的一个操作。 */
async function clearClipEffects() {
  pendingLabel.value = '清空片段效果';
  const c = selectedClip.value;
  if (!c) return;
  delete c.colorPreset; delete c.mask; delete c.speed; delete c.volume;
  delete c.fadeIn; delete c.fadeOut; delete c.kenburns;
  dirty.value = true; await save();
  Object.assign(clipPatch, { colorPreset: '', maskShape: '', maskKey: '', speed: 1, volume: 1,
    fadeIn: undefined, fadeOut: undefined, maskScale: 0.9, maskOffsetX: 0, maskOffsetY: 0, maskFeather: 0 });
  scheduleFrameFetch(150);
  note('已清空该片段的效果');
}

/** 把选中字幕的起点对齐到播放头（保持时长不变）。 */
async function alignTextToPlayhead() {
  const t = selectedText.value;
  if (!t) return;
  const dur = t.end - t.start;
  t.start = Number(Math.max(0, playhead.value).toFixed(3));
  t.end = Number((t.start + dur).toFixed(3));
  dirty.value = true; await save();
  Object.assign(textPatch, { start: t.start, end: t.end });
  note('字幕已对齐到播放头');
}

/** 字幕时长增减（秒）。 */
async function extendText(delta: number) {
  const t = selectedText.value;
  if (!t) return;
  const end = Math.max(t.start + 0.5, t.end + delta);
  t.end = Number(end.toFixed(3));
  dirty.value = true; await save();
  textPatch.end = t.end;
  note(`字幕时长 ${delta > 0 ? '延长' : '缩短'}到 ${(t.end - t.start).toFixed(1)}s`);
}

/** 复制选中的字幕（放在它后面 0.2s，避免重叠）。 */
async function duplicateText() {
  pendingLabel.value = '复制字幕';
  const t = selectedText.value;
  if (!t || !project.value) return;
  let max = 0;
  for (const x of project.value.texts) { const m = /^t(\d+)$/.exec(x.id); if (m) max = Math.max(max, Number(m[1])); }
  const dur = t.end - t.start;
  const start = Number((t.end + 0.2).toFixed(3));
  const item: ClipText = { ...t, id: `t${max + 1}`, start, end: Number((start + dur).toFixed(3)) };
  project.value.texts.push(item);
  dirty.value = true; await save();
  selectText(item.id);
  note('已复制字幕');
}

// ===== 拖拽修剪（片段左右边缘，商用软件的标配交互）=====
/**
 * 按住片段边缘拖动 = 实时改裁剪点。
 *
 * ★ 为什么必须有：进属性面板改数字的反馈是"盲的"（不知道 3.2s 处画面是什么），
 *   而拖动边缘 + 实时预览帧 = 所见即所得。这是剪辑软件最核心的手感。
 * ★ 增量按像素换算：拖动距离 / pxPerSec = 秒数；变速的段要乘 speed 换算回素材时间。
 */
function startTrim(e: MouseEvent, c: ClipSegment, which: 'start' | 'end') {
  e.preventDefault();
  selectClip(c.id);
  const startX = e.clientX;
  const t0 = c.trimStart ?? 0;
  const raw = mediaMeta.value[c.file]?.duration ?? 0;
  const t1 = c.trimEnd ?? raw;
  const sp = c.speed ?? 1;
  // 正在拖的段不做"移动"判定
  dragMoved.value = false;

  const move = (ev: MouseEvent) => {
    const dSec = ((ev.clientX - startX) / pxPerSec.value) * sp;
    if (which === 'start') {
      // 起点不能越过终点，且不小于 0
      const next = Math.max(0, Math.min(t1 - 0.1, t0 + dSec));
      c.trimStart = Number(next.toFixed(3));
    } else {
      const maxEnd = raw > 0 ? raw : t1 + Math.max(0, dSec);
      const next = Math.max((c.trimStart ?? 0) + 0.1, Math.min(maxEnd, t1 + dSec));
      c.trimEnd = Number(next.toFixed(3));
    }
    dirty.value = true;
    scheduleFrameFetch(180);   // 拖动中持续刷新预览帧（这就是"边剪边看"）
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    // 拖完才落盘（拖动中每帧都写库既慢又产生大量无意义写入）
    void save().then(() => {
      const cur = clips.value.find((x) => x.id === c.id);
      if (cur) selectClip(cur.id);
    });
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/** 片段按下：区分"点击选中"与"按住拖动（预留拖拽移动）"。 */
/**
 * 片段按下：实现"按住拖动 → 交换位序"。
 *
 * ★★★ 为什么必须做（2026-10-07 用户："实现一个剪辑软件最基础的功能"）：
 *   调整片段顺序是剪辑里**最高频**的操作（改叙事节奏），此前只能右键"前移/后移一位"，
 *   挪 5 位要点 5 次。商用软件都是直接拖。
 *
 * ★ 实现取舍：**交换位序**而不是"插入到任意位置" ——
 *   时间轴是首尾相接的线性结构，"拖到第 N 位"与"与前一段交换"对用户是同一件事，
 *   但前者要处理"拖到空白处"等边界；交换语义简单、结果可预期。
 * ★ 阈值 4px：低于它视为点击（否则轻微抖动会把片段顺序弄乱）。
 */
function onClipMouseDown(e: MouseEvent, c: ClipSegment) {
  if (e.button !== 0) return;   // 只有左键
  dragMoved.value = false;
  const startX = e.clientX;
  let lastSwapIdx = clips.value.findIndex((x) => x.id === c.id);

  const move = (ev: MouseEvent) => {
    if (Math.abs(ev.clientX - startX) < 4) return;
    dragMoved.value = true;
    const curIdx = clips.value.findIndex((x) => x.id === c.id);
    if (curIdx < 0 || !project.value) return;
    // 指针位置对应"应处于第几段"：按各段像素宽度累计判断（中点分界）
    const el = tlScroll.value as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xInTimeline = ev.clientX - rect.left + el.scrollLeft;
    let acc = 0;
    let targetIdx = clips.value.length - 1;
    for (let i = 0; i < clips.value.length; i++) {
      const w = segWidth(clips.value[i]);
      if (xInTimeline < acc + w / 2) { targetIdx = i; break; }
      acc += w;
    }
    if (targetIdx === curIdx || targetIdx === lastSwapIdx) return;
    // 就地交换（拖动中不落盘）
    const arr = project.value.clips;
    const moved = arr.splice(curIdx, 1)[0];
    arr.splice(targetIdx, 0, moved);
    lastSwapIdx = targetIdx;
    selectClip(c.id);
    scheduleFrameFetch(200);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    if (dragMoved.value) {
      pendingLabel.value = '调整片段顺序';
      dirty.value = true;
      void save();
    }
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

// ===== 键盘快捷键（对标商用软件）=====
/**
 * 快捷键表（在剪辑模式下生效）。
 * ★ 只在编辑视图、且焦点不在输入框时生效 —— 否则打字时按 Delete 会删片段。
 */
const SHORTCUTS: Array<{ key: string; ctrl?: boolean; label: string; run: () => void }> = [
  { key: ' ', label: '播放/暂停', run: () => togglePlay() },
  { key: 'z', ctrl: true, label: '撤销', run: () => void undo() },
  // ★ Shift+Ctrl+Z（重做）：表里用大写 Z 区分（e.key 在 Shift 下就是 'Z'）
  { key: 'Z', ctrl: true, label: '重做', run: () => void redo() },
  { key: 'y', ctrl: true, label: '重做', run: () => void redo() },
  { key: 's', label: '分割', run: () => void splitAtPlayhead() },
  { key: 'd', ctrl: true, label: '复制片段', run: () => void duplicateClip() },
  { key: 'Delete', label: '删除选中', run: () => void (selectedTextId.value ? removeText() : removeClip()) },
  { key: 'Backspace', label: '删除选中', run: () => void (selectedTextId.value ? removeText() : removeClip()) },
  { key: 'ArrowLeft', label: '播放头左移', run: () => seek(playhead.value - (shiftHeld ? 1 : 0.1)) },
  { key: 'ArrowRight', label: '播放头右移', run: () => seek(playhead.value + (shiftHeld ? 1 : 0.1)) },
  { key: ',', label: '上一帧', run: () => stepFrame(-1) },
  { key: '.', label: '下一帧', run: () => stepFrame(1) },
  { key: 'Home', label: '回到开头', run: () => seek(0) },
  { key: 'End', label: '跳到结尾', run: () => seek(estTotal.value) },
];

let shiftHeld = false;

function onKeyDown(e: KeyboardEvent) {
  if (view.value !== 'editor') return;
  // ★ 焦点在输入框/文本域时不拦截（否则打字会触发删除/分割）
  const el = e.target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;
  // 有弹窗（新建/删除确认）时也不拦截
  if (document.querySelector('.el-dialog') || document.querySelector('.el-overlay')) return;

  shiftHeld = e.shiftKey;
  // Escape 关菜单
  if (e.key === 'Escape') { closeCtxMenu(); return; }
  const hit = SHORTCUTS.find((s) => {
    if (s.key !== e.key) return false;
    const needCtrl = !!s.ctrl;
    const hasCtrl = e.ctrlKey || e.metaKey;
    return needCtrl ? hasCtrl : !hasCtrl;
  });
  if (!hit) return;
  // 空格要阻止页面滚动
  if (e.key === ' ') e.preventDefault();
  hit.run();
}

// ===== 播放/暂停：实时模式下用"逐帧推进"近似播放（真实播放请切成片模式）。 =====
/**
 * 逐帧步进（±1 帧即 1/output.fps 秒）。
 * ★ 成片模式直接步 <video>（跟手）；实时模式步播放头并取帧（受防抖影响略滞后，但够用）。
 */
function stepFrame(dir: number) {
  const step = 1 / (outFps.value || 30);
  if (monitorMode.value === 'clip' && videoEl.value && Number.isFinite(videoEl.value.currentTime)) {
    videoEl.value.currentTime = Math.max(0, Math.min(videoEl.value.duration || estTotal.value, videoEl.value.currentTime + dir * step));
    playhead.value = videoEl.value.currentTime;
    return;
  }
  seek(Math.max(0, Math.min(estTotal.value, playhead.value + dir * step)));
}

// 播放进度计时器（本地播放头推进）。
// ★ 2026-10-11 刻意**保留 setInterval**（未走 visible-polling）：
//   播放是**刚需连续推进**，不能因切页暂停（音频本身仍在播，暂停计时会导致进度与声音脱节）。
//   （轮询收口只针对**打接口**的定时器，本处是纯本地状态推进。）
let playTimer: ReturnType<typeof setInterval> | null = null;
function togglePlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; note('已暂停'); return; }
  if (monitorMode.value === 'clip' && videoEl.value) {
    if (videoEl.value.paused) { void videoEl.value.play(); note('播放成片'); }
    else { videoEl.value.pause(); note('已暂停'); }
    return;
  }
  // 实时模式：定时器按 ~4fps 推进播放头（每帧一次抽图，再快 ffmpeg 跟不上）
  playTimer = setInterval(() => {
    const next = playhead.value + 0.25;
    if (next >= estTotal.value) { clearInterval(playTimer!); playTimer = null; seek(estTotal.value); note('播放结束'); return; }
    seek(next);
  }, 250);
  note('播放中（实时模式约 4fps，切「成片」可流畅播放）');
}

// ===== 项目管理（剪映式草稿箱）=====
/**
 * 拉项目列表。
 * 一个项目 = 一个剪辑任务（会话）= 一条时间线，粒度与剪映「草稿」一致。
 * 摘要（段数/时长/字幕数/素材缺失数）由后端一次算好，前端不逐会话轮询（避免 N+1）。
 */
async function loadProjects() {
  loadingList.value = true;
  const r = await api.get<{ projects: ProjectListItem[] }>('/clip/projects');
  loadingList.value = false;
  if ('error' in r) { note(`读取项目列表失败：${r.error}`); return; }
  projectList.value = r.data.projects || [];
}

/** 打开项目：切到该会话（工程与对话都跟着切），再进编辑视图。 */
async function openProject(conversationId: string) {
  if (conversationId !== convId.value) {
    await chat.selectConv(conversationId);
  }
  view.value = 'editor';
  await loadFiles();
  await reload();
}

/** 返回项目列表（不销毁当前工程；工程已自动落盘）。 */
async function backToList() {
  if (dirty.value) await save();
  view.value = 'projects';
  await loadProjects();
}

/**
 * 新建项目。
 * ★ 规格在**这一步**定死：画幅决定时间轴比例、字幕字号基准、渲染规格与安全区计算，
 *   中途改会让已排好版的字幕与画面整体错位 —— 与剪映/Premiere 一致（改规格＝新建）。
 */
async function createProject() {
  creating.value = true;
  try {
    const name = newName.value.trim() || '未命名剪辑';
    const cid = await chat.store.createConversation(name);
    if (!cid) { note('会话创建失败，未新建项目'); return; }
    // createConversation 只建行、不切当前会话 → 必须 selectConv（否则 save 无 id 可写）
    await chat.selectConv(cid);
    const blank: ClipProject = {
      version: 1, name, updatedAt: Date.now(),
      output: { size: newSize.value, fps: newFps.value },
      clips: [], texts: [],
    };
    const r = await api.put('/clip/project', { conversationId: cid, project: blank });
    if ('error' in r) { note(`工程创建失败：${r.error}`); return; }
    newProjectDialog.value = false;
    newName.value = '';
    view.value = 'editor';
    await loadFiles();
    await reload();
    note(`项目「${name}」已创建（${newSize.value}@${newFps.value}）`);
  } catch (e) {
    // ★★ 必须有 catch（2026-10-07 用户报「点了新建项目没反应」的真实原因）：
    //   原实现只有 try/finally —— `createConversation` 抛错时异常**逃逸成未捕获拒绝**，
    //   弹窗不关、界面不变、也没有任何提示，用户只看到"点了没用"。
    //   而"点了没反应"是最难反馈的故障形态，必须把失败转成可见文案。
    note(`新建项目失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    creating.value = false;
  }
}

function askDeleteProject(p: ProjectListItem) { delTarget.value = p; delDialog.value = true; }

/** 删除项目：删会话与工程文件；**不删素材源文件**（与剪映"删草稿不删素材"一致）。 */
async function doDeleteProject() {
  const p = delTarget.value;
  if (!p) return;
  const r = await api.delete(`/clip/projects/${encodeURIComponent(p.conversationId)}`);
  if ('error' in r) { note(`删除失败：${r.error}`); return; }
  delDialog.value = false;
  delTarget.value = null;
  if (p.conversationId === convId.value) {
    // 删的是当前打开的项目 → 回列表并清空本地工程态
    project.value = null;
    previewUrl.value = '';
    view.value = 'projects';
  }
  await loadProjects();
  note('项目已删除（素材源文件未动）');
}

/** 规格中文名（只读展示用）。 */
const specLabel = computed(() => {
  const p = SPEC_PRESETS.find((s) => s.size === outSize.value);
  return p ? `${p.label.split(' · ')[0]} · ${outSize.value}` : outSize.value;
});
/** 项目卡片封面：按画幅比例画一个占位框（真实首帧需渲染，成本高且非必要）。 */
function coverStyle(output: { size: string; fps: number } | null) {
  const [w, h] = (output?.size || '1080x1920').split('x').map(Number);
  return { aspectRatio: String(w && h ? w / h : 9 / 16) };
}
function timeAgo(ts: number): string {
  if (!ts) return '未保存';
  const d = Date.now() - ts;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
  return `${Math.floor(d / 86400000)} 天前`;
}

/** 路径缩短展示（只留末两级，避免长路径把头部撑开）。 */
function shortPath(p: string): string {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`;
}

/**
 * 绑定项目目录。
 *
 * ★ 为什么复用**空间（space）**而不是新造一套：产物根的解析（`resolveArtifactRoot`）
 *   已经是「空间 dirPath > 全局工作目录 > 数据根」三级，绑空间即让该项目的工程、
 *   素材、成片全部落到用户选的目录里 —— 团队交接/多机迁移只需拷这个目录。
 *   另起一套"剪辑目录"会与产物根解析形成两个真相源（必然漂移）。
 * 未选路径 = 解绑，回落默认数据目录（不报错）。
 */
async function onDirSelected(dirPath: string) {
  const p = (dirPath || '').trim();
  if (!p) { note('未选择目录，项目保持默认目录'); return; }
  try {
    const id = await spaceStore.createSpace({ name: shortPath(p).replace(/^…\//, ''), dirPath: p });
    spaceStore.selectSpace(id);
    // 当前项目改归属到这个空间，工程与产物根随之一致
    if (convId.value) {
      await chat.store.updateConversation(convId.value, { spaceId: id } as never);
    }
    await loadFiles();
    await reload();
    note(`项目目录已绑定：${p}`);
  } catch (e) {
    note(`绑定失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

// ===== 时间轴编辑（本地改 + 落盘；与智能体同一份工程）=====
function onDragStart(e: DragEvent, f: ConvFile) { e.dataTransfer?.setData('text/plain', f.path); }

function onDropTrack(e: DragEvent) {
  const p = e.dataTransfer?.getData('text/plain');
  if (!p) return;
  if (/\.(mp3|m4a|wav|aac|flac)$/i.test(p)) { void setBgm(p); return; }
  void appendClip(p);
}

function nextClipId(): string {
  let max = 0;
  for (const c of clips.value) { const m = /^c(\d+)$/.exec(c.id); if (m) max = Math.max(max, Number(m[1])); }
  return `c${max + 1}`;
}
function nextTextId(): string {
  let max = 0;
  for (const t of texts.value) { const m = /^t(\d+)$/.exec(t.id); if (m) max = Math.max(max, Number(m[1])); }
  return `t${max + 1}`;
}

function ensureProject() {
  if (!project.value) {
    project.value = {
      version: 1, name: projectName.value || '未命名剪辑', updatedAt: Date.now(),
      output: { size: outSize.value, fps: outFps.value }, clips: [], texts: [],
    };
  }
  return project.value;
}

/**
 * 确保有会话可挂工程。
 *
 * ★★ 必须的有（真实缺陷，不是防御性代码）：新建任务时 currentConvId 是**空串**（草稿态），
 *   而工程是按会话 id 落盘的 —— 此时读不到、也没有 id 可写，
 *   用户拖入素材看着时间轴变了，**一刷新全没了**（且全程不报错）。
 * ★★ 必须 `selectConv` 而不只是 `createConversation`：
 *   后者只建行并返回 id，**不会把 currentConvId 切过去**（实测：返回 id 正确但 convId 仍为空）
 *   → 后续 save() 因无 id 直接 return，等于白做。
 */
async function ensureConversation(): Promise<string> {
  if (convId.value) return convId.value;
  const id = await chat.store.createConversation(projectName.value || '未命名剪辑');
  if (!id) return '';
  await chat.selectConv(id);
  return chat.store.currentConvId || id;
}

async function appendClip(file: string) {
  pendingLabel.value = '加入片段';
  await ensureConversation();          // ★ 草稿态先建会话（否则工程无处可存）
  const p = ensureProject();
  p.clips.push({ id: nextClipId(), file, label: baseName(file) });
  dirty.value = true;
  await save();
  await loadMediaMeta();   // 新素材也要探时长，否则它先被当成 0 秒挂在轨道上
  selectClip(p.clips[p.clips.length - 1].id);
  note('已加入时间轴');
}

async function setBgm(file: string) {
  await ensureConversation();
  const p = ensureProject();
  p.bgm = { file, volume: bgmVolume.value, duck: bgmDuck.value };
  dirty.value = true;
  await save();
  note('已设为背景音乐');
}

async function clearBgm() {
  if (!project.value) return;
  delete project.value.bgm;
  dirty.value = true;
  await save();
}

async function applyBgm() {
  if (!project.value?.bgm) return;
  project.value.bgm.volume = bgmVolume.value;
  project.value.bgm.duck = bgmDuck.value;
  dirty.value = true;
  await save();
}

// ===== 画中画（叠加轨）=====
/** 音频波形图 URL（服务端 showwavespic；仅限本会话工程引用/登记过的文件）。 */
function waveUrl(p: string, w = 600, h = 56): string {
  if (!convId.value || !p) return '';
  const code = getLicenseCode();
  const qs = code ? `&license=${encodeURIComponent(code)}` : '';
  return `${API_BASE}/clip/waveform?conversationId=${encodeURIComponent(convId.value)}&path=${encodeURIComponent(p)}&w=${w}&h=${h}${qs}`;
}

/** 把素材设为画中画：落在播放头处 3 秒（夹住片尾），右下角 0.35 倍，之后在属性面板调。 */
async function addOverlay(f: ConvFile) {
  pendingLabel.value = '添加画中画';
  const p = ensureProject();
  const start = Math.max(0, Math.min(playhead.value, Math.max(0, estTotal.value - 0.5)));
  const end = Math.min(estTotal.value, start + 3);
  if (!(end > start)) { note('播放头已在片尾，无法添加画中画'); return; }
  const id = `o${(p.overlays || []).reduce((m, o) => { const n = Number(String(o.id).replace(/^o/, '')); return Number.isFinite(n) ? Math.max(m, n) : m; }, 0) + 1}`;
  const item = { id, file: f.path, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), pos: 'bottomright', scale: 0.35 };
  if (!p.overlays) p.overlays = [];
  p.overlays.push(item);
  dirty.value = true; await save();
  selectedOverlayId.value = id;
  rightTab.value = 'inspector';
  note('已添加画中画（右侧属性面板可调位置/大小/时间）');
}

function selectOverlay(id: string) {
  selectedOverlayId.value = id;
  selectedClipId.value = '';
  selectedTextId.value = '';
  rightTab.value = 'inspector';
}

async function removeOverlay(id: string) {
  const p = project.value;
  if (!p?.overlays) return;
  pendingLabel.value = '删画中画';
  p.overlays = p.overlays.filter((o) => o.id !== id);
  if (!p.overlays.length) delete p.overlays;
  if (selectedOverlayId.value === id) selectedOverlayId.value = '';
  dirty.value = true; await save();
}

/** 画中画右键菜单。 */
function onOverlayMenu(e: MouseEvent, o: { id: string; file: string }) {
  openCtxMenu(e, `画中画 ${baseName(o.file)}`, [
    { label: '起点对齐播放头', icon: 'Clock', action: async () => {
        const cur = project.value?.overlays?.find((x) => x.id === o.id);
        if (!cur) return;
        pendingLabel.value = '画中画对齐';
        const dur = cur.end - cur.start;
        cur.start = Number(Math.max(0, Math.min(playhead.value, estTotal.value - 0.1)).toFixed(3));
        cur.end = Number(Math.min(estTotal.value, cur.start + dur).toFixed(3));
        dirty.value = true; await save();
      } },
    { label: '删除画中画', icon: 'Delete', danger: true, action: () => removeOverlay(o.id) },
  ]);
}

async function applyOverlayPatch() {
  const o = project.value?.overlays?.find((x) => x.id === selectedOverlayId.value);
  if (!o || !project.value) return;
  pendingLabel.value = '改画中画';
  if (!(o.end > o.start)) { note('画中画终点必须大于起点'); return; }
  o.scale = Math.max(0.05, Math.min(1, o.scale ?? 0.35));
  dirty.value = true; await save();
  note('画中画已应用');
}

function selectClip(id: string) {
  selectedClipId.value = id;
  selectedTextId.value = '';
  rightTab.value = 'inspector';
  const c = clips.value.find((x) => x.id === id);
  if (!c) return;
  Object.assign(clipPatch, {
    trimStart: c.trimStart, trimEnd: c.trimEnd,
    speed: c.speed ?? 1, volume: c.volume ?? 1,
    fadeIn: c.fadeIn, fadeOut: c.fadeOut, colorPreset: c.colorPreset || '',
    maskShape: c.mask?.shape || '', maskKey: c.mask?.key || '',
    maskScale: c.mask?.scale ?? 0.9, maskOffsetX: c.mask?.offsetX ?? 0,
    maskOffsetY: c.mask?.offsetY ?? 0, maskFeather: c.mask?.feather ?? 0,
    transitionType: c.transition?.type || '', transitionDuration: c.transition?.duration ?? 0.8,
    cropX: c.crop?.x ?? 0, cropY: c.crop?.y ?? 0, cropW: c.crop?.w ?? 1, cropH: c.crop?.h ?? 1,
  });
  if (c.mask?.shape || c.mask?.key) maskOpen.value = true;
  if (c.transition?.type) transOpen.value = true;
  if (c.crop) cropOpen.value = true;
  if (c.keyframes?.length) kfOpen.value = true;
}

function selectText(id: string) {
  selectedTextId.value = id;
  selectedClipId.value = '';
  rightTab.value = 'inspector';
  const t = texts.value.find((x) => x.id === id);
  if (!t) return;
  Object.assign(textPatch, {
    text: t.text, start: t.start, end: t.end, fontSizePx: t.fontSizePx ?? 88,
    animation: t.animation || '', slideDirection: t.slideDirection || 'right',
    position: t.position || 'bottom', color: t.color || '#FFFFFF',
    outlineColor: t.outlineColor || '#000000', safeArea: !!t.safeArea,
    outlinePx: t.outlinePx ?? 12, backColor: t.backColor || '',
  });
}

async function moveClip(delta: number) {
  pendingLabel.value = '移动片段';
  const i = selectedClipIndex.value;
  if (i < 0 || !project.value) return;
  const to = i + delta;
  if (to < 0 || to >= clips.value.length) return;
  const [seg] = project.value.clips.splice(i, 1);
  project.value.clips.splice(to, 0, seg);
  dirty.value = true; await save();
}

async function duplicateClip() {
  pendingLabel.value = '复制片段';
  const i = selectedClipIndex.value;
  if (i < 0 || !project.value) return;
  const copy: ClipSegment = { ...project.value.clips[i], id: nextClipId() };
  project.value.clips.splice(i + 1, 0, copy);
  dirty.value = true; await save();
  note('已复制片段');
}

async function removeClip() {
  pendingLabel.value = '删除片段';
  const i = selectedClipIndex.value;
  if (i < 0 || !project.value) return;
  project.value.clips.splice(i, 1);
  selectedClipId.value = '';
  dirty.value = true; await save();
}

async function removeText() {
  pendingLabel.value = '删除字幕';
  const i = selectedTextIndex.value;
  if (i < 0 || !project.value) return;
  project.value.texts.splice(i, 1);
  selectedTextId.value = '';
  dirty.value = true; await save();
}

// ===== 内置音效库（合成式免版权）=====
interface SfxLibItem { id: string; label: string; desc: string; group: string; maxSec: number }
const sfxLibOpen = ref(false);
const sfxLibItems = ref<SfxLibItem[]>([]);
const sfxBusy = ref('');

/** 音效库分组（弹窗按组渲染） */
const sfxGroups = computed(() => {
  const map = new Map<string, SfxLibItem[]>();
  for (const it of sfxLibItems.value) {
    const arr = map.get(it.group) || [];
    arr.push(it);
    map.set(it.group, arr);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
});

async function openSfxLibrary() {
  sfxLibOpen.value = true;
  if (sfxLibItems.value.length) return;
  const r = await api.get<{ sfx: SfxLibItem[] }>('/clip/library');
  if ('error' in r) { note(`读取音效库失败：${r.error}`); return; }
  sfxLibItems.value = r.data.sfx || [];
}

/**
 * 生成一个音效到会话素材库。
 * ★ 生成后立刻刷新素材列表（选素材库视图的用户能马上看到），并提示文件位置。
 */
async function generateSfx(id: string) {
  const cid = await ensureConversation();
  if (!cid) { note('无法创建会话，已中止'); return; }
  sfxBusy.value = id;
  try {
    const r = await api.post<{ ok: boolean; name: string; label: string }>('/clip/library/sfx', { conversationId: cid, id });
    if ('error' in r) { note(`生成失败：${r.error}`); return; }
    await loadFiles();
    note(`音效「${r.data.label}」已加入素材库（${r.data.name}）`);
  } finally {
    sfxBusy.value = '';
  }
}

// ===== 音效链（整片，对标商用软件的"音频效果"面板）=====
/** 当前音效链（直接读工程，不用本地副本 —— 与智能体改的同一份） */
const audioFx = computed<string[]>(() => project.value?.audioFx || []);

function audioFxLabel(id: string): string { return AUDIO_EFFECTS.find((e) => e.id === id)?.label || id; }

/**
 * 添加音效。
 * ★ 上限 4 个：音效叠加过多会互相污染（降噪→变声→混响→再降噪，听感反而更差），
 *   后端也有同样的闸门，这里提前拦并说明原因，避免用户加到第 5 个才被拒。
 */
async function onPickAudioFx(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  if (!id) return;
  if (audioFx.value.includes(id)) { note('该音效已在链中（拖动顺序暂不支持，先移除再加）'); return; }
  if (audioFx.value.length >= 4) { note('音效最多串联 4 个：叠加过多会互相污染，听感反而更差'); return; }
  await setAudioFx([...audioFx.value, id]);
}

async function removeAudioFx(i: number) {
  const next = audioFx.value.slice();
  next.splice(i, 1);
  await setAudioFx(next);
}

async function clearAudioFx() {
  await setAudioFx([]);
}

/** 落盘音效链（走工程保存，与智能体的 set_audio_fx 同一字段）。 */
async function setAudioFx(fx: string[]) {
  pendingLabel.value = '修改音效链';
  if (!project.value) return;
  if (fx.length) project.value.audioFx = fx; else delete project.value.audioFx;
  dirty.value = true;
  await save();
  // 音效影响听感但不影响画面，所以不刷新预览帧（避免无谓开销）
  note(fx.length ? `音效链：${fx.map(audioFxLabel).join(' → ')}` : '已清除音效链');
}

/** 形状/抠像标签（面板徽标展示用）。 */
function shapeLabelOf(id: string): string { return MASK_SHAPES.find((m) => m.id === id)?.label || id; }
function keyLabelOf(id: string): string { return MASK_KEYS.find((m) => m.id === id)?.label || id; }

function transitionLabelOf(id: string): string { return TRANSITIONS.find((t) => t.id === id)?.label || id; }
/** 选了转场但时长还是默认值时给个合理值（不同转场的舒服时长不同）。 */
function syncTransitionDuration() {
  if (clipPatch.transitionType && !clipPatch.transitionDuration) clipPatch.transitionDuration = 0.8;
}
function clearClipTransition() { clipPatch.transitionType = ''; }

/** 选形状：与抠像互斥（色键优先，选了形状就清抠像）。 */
function pickMaskShape(id: string) {
  clipPatch.maskShape = clipPatch.maskShape === id ? '' : id;
  if (clipPatch.maskShape) clipPatch.maskKey = '';
}
/** 选抠像：与形状互斥。 */
function pickMaskKey(id: string) {
  clipPatch.maskKey = clipPatch.maskKey === id ? '' : id;
  if (clipPatch.maskKey) clipPatch.maskShape = '';
}
/** 清除蒙版（只改本地态，"应用"后才落盘）。 */
function clearClipMask() {
  clipPatch.maskShape = '';
  clipPatch.maskKey = '';
}

/**
 * 套用字幕样式模板。
 * ★ 只覆盖模板里写了的字段（其余保留用户自己的设置）—— 全量覆盖会把用户
 *   已调好的时间/文案也重置，那是"点了模板就丢东西"的糟糕体验。
 */
function applyTextStyle(s: TextStylePreset) {
  const st = s.style;
  if (st.fontSizePx != null) textPatch.fontSizePx = st.fontSizePx;
  if (st.color) textPatch.color = st.color;
  if (st.outlineColor) textPatch.outlineColor = st.outlineColor;
  if (st.outlinePx != null) textPatch.outlinePx = st.outlinePx;
  if (st.position) textPatch.position = st.position;
  textPatch.safeArea = !!st.safeArea;
  if (st.animation) textPatch.animation = st.animation;
  // 底板色（textPatch.backColor）留给后端 backColor 字段；空串=无底板
  textPatch.backColor = st.backColor || '';
  note(`已套用样式「${s.label}」，点「应用字幕参数」生效`);
}

async function applyClipPatch() {
  pendingLabel.value = '修改片段参数';
  const c = selectedClip.value;
  if (!c) return;
  const clean = <T,>(v: T): T | undefined =>
    v === undefined || v === null || v === ('' as unknown as T) || Number.isNaN(v as unknown as number) ? undefined : v;
  c.trimStart = clean(clipPatch.trimStart);
  c.trimEnd = clean(clipPatch.trimEnd);
  const sp = Number(clipPatch.speed);
  if (Number.isFinite(sp) && Math.abs(sp - 1) > 0.001) c.speed = sp; else delete c.speed;
  const vol = Number(clipPatch.volume);
  if (Number.isFinite(vol) && Math.abs(vol - 1) > 0.001) c.volume = vol; else delete c.volume;
  c.fadeIn = clean(clipPatch.fadeIn);
  c.fadeOut = clean(clipPatch.fadeOut);
  if (clipPatch.colorPreset) c.colorPreset = clipPatch.colorPreset; else delete c.colorPreset;
  // 蒙版：形状与抠像至少给一个才写；都要清空时删字段
  const shape = String(clipPatch.maskShape || '').trim();
  const key = String(clipPatch.maskKey || '').trim();
  const hasShape = shape && shape !== 'none';
  const hasKey = key && key !== 'none';
  if (hasShape || hasKey) {
    c.mask = {
      ...(hasShape ? { shape } : {}),
      ...(hasKey ? { key } : {}),
      ...(hasShape ? { scale: clipPatch.maskScale, offsetX: clipPatch.maskOffsetX, offsetY: clipPatch.maskOffsetY, feather: clipPatch.maskFeather } : {}),
    };
  } else delete c.mask;
  // 转场：第一段没有"前一段"→ 不写（写了也是无效配置，渲染时会忽略）
  const i = selectedClipIndex.value;
  if (clipPatch.transitionType && i > 0) {
    c.transition = { type: clipPatch.transitionType, duration: clipPatch.transitionDuration };
  } else delete c.transition;
  // 裁剪：四项全缺省视为未裁剪（与后端 normalizeCrop 的"全画幅=无裁剪"同口径）
  const cropped = clipPatch.cropW < 0.999 || clipPatch.cropH < 0.999 || clipPatch.cropX > 0.001 || clipPatch.cropY > 0.001;
  if (cropped) {
    c.crop = {
      x: Math.max(0, Math.min(0.9, clipPatch.cropX)),
      y: Math.max(0, Math.min(0.9, clipPatch.cropY)),
      w: Math.max(0.1, Math.min(1, clipPatch.cropW)),
      h: Math.max(0.1, Math.min(1, clipPatch.cropH)),
    };
  } else delete c.crop;
  if (c.trimStart != null && c.trimEnd != null && !(c.trimEnd > c.trimStart)) {
    note('裁剪区间无效：终点必须大于起点');
    return;
  }
  dirty.value = true; await save();
  note('片段参数已应用');
}

/** 清除画面裁剪（恢复全画幅，需点「应用片段参数」生效）。 */
function clearClipCrop() {
  clipPatch.cropX = 0; clipPatch.cropY = 0; clipPatch.cropW = 1; clipPatch.cropH = 1;
}

// ===== 关键帧动画（打点式：播放头定位 → 打点 → 改数值 → 应用） =====

/**
 * 播放头在选中片段内的位置（比例 0~1）。
 * ★ 分割/移动等既有一致口径（segSeconds 累计起点），复用同一套换算，不另写一份。
 */
function playheadFractionInSelectedClip(): number | null {
  const i = selectedClipIndex.value;
  const c = selectedClip.value;
  if (i < 0 || !c) return null;
  let cursor = 0;
  for (let k = 0; k < i; k++) cursor += segSeconds(clips.value[k]);
  const dur = segSeconds(c);
  if (dur <= 0) return null;
  return Math.max(0, Math.min(1, (playhead.value - cursor) / dur));
}

/** 在播放头处给选中片段打一个关键帧（默认缩放 1.3，之后在列表里改数值）。 */
async function addKeyframeAtPlayhead() {
  const c = selectedClip.value;
  if (!c || !project.value) { note('先选中一个片段'); return; }
  const frac = playheadFractionInSelectedClip();
  if (frac == null) { note('无法定位播放头（素材时长未知）'); return; }
  pendingLabel.value = '打关键帧';
  if (!c.keyframes) c.keyframes = [];
  // 同一位置（±0.02）已有帧 → 覆盖，不叠加
  const near = c.keyframes.find((k) => Math.abs(k.t - frac) < 0.02);
  if (near) { near.scale = near.scale ?? 1.3; note(`已更新 ${frac.toFixed(2)} 处的关键帧`); }
  else { c.keyframes.push({ t: Number(frac.toFixed(3)), scale: 1.3 }); c.keyframes.sort((a, b) => a.t - b.t); note(`已在播放头（${frac.toFixed(2)}）打关键帧`); }
  dirty.value = true; await save();
}

async function removeKeyframe(i: number) {
  const c = selectedClip.value;
  if (!c || !project.value || !c.keyframes) return;
  pendingLabel.value = '删关键帧';
  c.keyframes.splice(i, 1);
  if (!c.keyframes.length) delete c.keyframes;
  dirty.value = true; await save();
}

async function clearKeyframes() {
  const c = selectedClip.value;
  if (!c || !project.value) return;
  pendingLabel.value = '清空关键帧';
  delete c.keyframes;
  dirty.value = true; await save();
  note('已清空关键帧');
}

/** 关键帧数值在列表里直接 v-model 改，点应用统一落盘（避免拖一下存一次）。 */
async function applyKeyframes() {
  const c = selectedClip.value;
  if (!c || !project.value) return;
  pendingLabel.value = '改关键帧';
  if (c.keyframes) {
    c.keyframes = c.keyframes
      .map((k) => ({ ...k, t: Math.max(0, Math.min(1, k.t || 0)) }))
      .sort((a, b) => a.t - b.t);
  }
  dirty.value = true; await save();
  note('关键帧已应用');
}

async function applyTextPatch() {
  pendingLabel.value = '修改字幕';
  const t = selectedText.value;
  if (!t) return;
  if (!textPatch.text.trim()) { note('字幕文本不能为空'); return; }
  if (!(textPatch.end > textPatch.start)) { note('字幕终点必须大于起点'); return; }
  t.text = textPatch.text.trim();
  t.start = Number(textPatch.start.toFixed(3));
  t.end = Number(textPatch.end.toFixed(3));
  t.fontSizePx = textPatch.fontSizePx || 88;
  t.outlinePx = Math.max(0, Math.min(60, Number(textPatch.outlinePx) || 12));
  if (textPatch.backColor) t.backColor = textPatch.backColor; else delete t.backColor;
  if (textPatch.animation) t.animation = textPatch.animation; else delete t.animation;
  if (textPatch.animation === 'slide') t.slideDirection = textPatch.slideDirection as ClipText['slideDirection'];
  else delete t.slideDirection;
  t.position = (textPatch.position as ClipText['position']) || 'bottom';
  if (textPatch.color) t.color = textPatch.color;
  if (textPatch.outlineColor) t.outlineColor = textPatch.outlineColor;
  if (textPatch.safeArea) t.safeArea = true; else delete t.safeArea;
  dirty.value = true; await save();
  note('字幕已更新');
}

/** 在播放头处分割选中片段（播放头是成片时间 → 换算成该段内的相对时间）。 */
async function splitAtPlayhead() {
  pendingLabel.value = '分割片段';
  const i = selectedClipIndex.value;
  const c = selectedClip.value;
  if (i < 0 || !c || !project.value) return;
  let cursor = 0;
  for (let k = 0; k < i; k++) cursor += segSeconds(clips.value[k]);
  const offset = playhead.value - cursor;
  const dur = segSeconds(c);
  if (!(offset > 0.15 && offset < dur - 0.15)) { note('播放头不在片段内部，无法分割'); return; }
  const ts = c.trimStart ?? 0;
  const cut = ts + offset * (c.speed ?? 1);
  const rest: ClipSegment = { ...c, id: nextClipId(), trimStart: Number(cut.toFixed(3)) };
  c.trimEnd = Number(cut.toFixed(3));
  project.value.clips.splice(i + 1, 0, rest);
  dirty.value = true; await save();
  note(`已在 ${playhead.value.toFixed(2)}s 分割`);
}

/**
 * 在播放头处加一条字幕。
 *
 * ★ 为什么必须要有（此前的真缺口）：字幕轨此前**只有删除按钮**，新增全靠对话让剪辑师做 ——
 *   用户手动剪到某个镜头想说"这句加个字幕"时，UI 里没有任何入口。
 *   手动剪辑与对话剪辑是**双驱动**设计，两条路都得能用，否则等于少了半个功能。
 * ★ 默认时长 2s 并按句尾夹住：字幕越过成片结尾会在渲染时被静默截断/不显示（不报错）。
 */
async function addTextAtPlayhead() {
  pendingLabel.value = '添加字幕';
  await ensureConversation();
  const p = ensureProject();
  const total = estTotal.value;
  const start = Math.max(0, Math.min(playhead.value, Math.max(0, total - 0.5)));
  const end = Math.min(total, start + 2);
  if (!(end > start)) { note('播放头已在片尾，无法在此添加字幕'); return; }
  const item: ClipText = { id: nextTextId(), text: '新字幕', start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), position: 'bottom' };
  p.texts.push(item);
  dirty.value = true;
  await save();
  selectText(item.id);
  rightTab.value = 'inspector';
  note(`已在 ${start.toFixed(2)}s 添加字幕，右侧可改文案`);
}

// ===== 语音转字幕（本地 whisper.cpp）=====
//
// ★ 为什么在工作台里加这个（2026-10-08）：ASR 后端（media_asr_transcribe / whisper.cpp）
//   此前只能从**对话**触发。剪辑时"素材只有音频想自动打轴"却没有入口 = 能力有了、用不上。
// ★ 为什么不上传云端：用户拍板本地 whisper.cpp（隐私/离线/无按量计费）。
// ★ 依赖缺失时**原样展示服务端的指引**（含手动放置目录），不自己编文案 ——
//   服务端比前端清楚"到底缺二进制还是模型、该放哪个目录"。
const asrRunning = ref(false);
const asrModel = ref('small');   // base 快 / small 准（默认）/ medium 最准但慢

async function runAsrOnSelected() {
  const clip = selectedClip.value;
  if (!clip) { note('先在时间轴上选中一个片段（要识别它的语音）'); return; }
  const src = (clip as { src?: string; path?: string }).src || (clip as { path?: string }).path || '';
  if (!src) { note('该片段没有可识别的源文件'); return; }
  await ensureConversation();
  asrRunning.value = true;
  pendingLabel.value = '语音识别中（本地）';
  try {
    type AsrCue = { text: string; start: number; end: number };
    // ★ 解包口径对齐 /clip/probe：apiFetch 已把响应解包成 `{ data: <接口 data 字段> }`，
    //   所以 r.data 就是 cues 数组本身（**不能再写 r.data.data**，会拿到 undefined）。
    //   失败时返回 `{ error }` → 先判 `'error' in r`，避免把错误当成功处理。
    const r = await api.post<AsrCue[]>('/clip/asr', {
      conversationId: convId.value, path: src, model: asrModel.value,
    }) as { data?: AsrCue[]; model?: string; requestedModel?: string; error?: string };
    if ('error' in r && r.error) {
      // 服务端已给出可执行指引（含手动放置目录），原样转达
      note(String((r as { error?: string }).error || '语音识别失败'));
      return;
    }
    const cues: AsrCue[] = Array.isArray(r.data) ? r.data : [];
    if (!cues.length) { note('未识别到语音内容，可换 medium 模型或确认音频'); return; }
    const p = ensureProject();
    // ★ 片段在时间轴上的**起点偏移**：ASR 时间轴是相对音频文件的，
    //   而字幕要落在成片时间轴上 → 必须加上该片段的起始位置（否则整体前移）
    const offset = Number((clip as { start?: number }).start || 0);
    const added: ClipText[] = cues.map((c) => ({
      id: nextTextId(),
      text: c.text,
      start: Number((offset + c.start).toFixed(3)),
      end: Number((offset + c.end).toFixed(3)),
      position: 'bottom',
    }));
    p.texts.push(...added);
    dirty.value = true;
    await save();
    selectText(added[0].id);
    rightTab.value = 'inspector';
    // 如实告知实际用的模型（请求 small 但本机只有 base 时服务端会自动降级）
    const usedModel = (r as { model?: string }).model || asrModel.value;
    const fellBack = usedModel !== asrModel.value;
    note(
      `已识别 ${added.length} 条字幕（模型 ${usedModel}${fellBack ? `，${asrModel.value} 未装已自动降级` : ''}），右侧可逐条改文案与时间`,
    );
  } catch (e: unknown) {
    note(e instanceof Error ? e.message : String(e));
  } finally {
    asrRunning.value = false;
    pendingLabel.value = '';
  }
}

// ===== 播放头 =====
function seek(sec: number) {
  playhead.value = Math.max(0, sec);
  if (videoEl.value && Number.isFinite(videoEl.value.duration)) {
    videoEl.value.currentTime = Math.min(playhead.value, videoEl.value.duration);
  }
}
/**
 * 吸附（magnetic timeline）：把时间值吸到最近的**片段边界**上。
 *
 * ★ 为什么是"最基础"：手动拖到正好某段开头几乎做不到（差 0.03s 就会导致
 *   字幕与画面错位、转场对不齐）。商用软件默认都开吸附（剪映的"自动吸附"）。
 * ★ 阈值用**像素**而不是秒：用户感知的是"屏幕上的距离"，缩放不同档位下
 *   同样的秒数视觉距离差别很大，用秒做阈值会在大缩放下形同虚设。
 */
const SNAP_PX = 8;
/** 所有可吸附的时间点（成片时间轴）：每段的起点与终点。 */
function snapPoints(): number[] {
  const pts: number[] = [0];
  let acc = 0;
  for (const c of clips.value) {
    acc += segSeconds(c);
    pts.push(Number(acc.toFixed(3)));
  }
  return pts;
}
/** 把 t 吸到最近的吸附点（无命中则原样返回）。 */
function snapTime(t: number): number {
  const threshSec = SNAP_PX / pxPerSec.value;
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of snapPoints()) {
    const d = Math.abs(p - t);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best != null && bestD <= threshSec ? best : t;
}

function seekFromEvent(e: MouseEvent) {
  const el = tlScroll.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left + el.scrollLeft;
  // ★ 播放头定位也吸附（否则"拖到片段开头"永远差一点点，字幕/转场全对不齐）
  seek(snapTime(x / pxPerSec.value));
}
function startScrub(e: MouseEvent) {
  seekFromEvent(e);
  const move = (ev: MouseEvent) => seekFromEvent(ev);
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
function onTimeUpdate() { playhead.value = videoEl.value?.currentTime || 0; }
function onLoadedMeta() { videoDur.value = videoEl.value?.duration || 0; }

// ===== 渲染（唯一出口是 clip_project 工具：不另开 UI 渲染通道）=====
async function render(preview: boolean) {
  if (!clipCount.value) { note('时间轴还没有片段'); return; }
  await ensureConversation();          // ★ 草稿态先建会话（渲染产物要落在会话目录）
  if (!convId.value) { note('无法创建会话，已中止'); return; }
  rendering.value = true;
  note(preview ? '正在出预览档…' : '正在导出成片…');
  try {
    await save();
    chat.input.value = preview
      ? '用 clip_project op=render preview=true 出一版快速预览档，只回一句文件路径。'
      : '用 clip_project op=render 出正式成片，只回一句文件路径与时长。';
    await chat.send();
    await loadFiles();
    note(preview ? '预览档已生成' : '成片已导出');
  } catch (e) {
    note(`渲染失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    rendering.value = false;
  }
}

// ★ 播放头一动就取帧（这是"边剪辑边预览"的驱动核心）
watch(playhead, () => { scheduleFrameFetch(); });

// 工程内容变化（参数改了/加删段）→ 立刻刷新当前帧，让改动马上可见
watch(() => [clipCount.value, JSON.stringify(project.value?.clips?.map((c) => [c.colorPreset, c.mask, c.speed, c.trimStart, c.trimEnd, c.fadeIn, c.fadeOut, c.mask]))], () => {
  if (monitorMode.value === 'live') scheduleFrameFetch(200);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (frameTimer) clearTimeout(frameTimer);
  replaceFrameUrl('');
});

watch(() => chat.store.currentConvId, async () => {
  previewUrl.value = ''; videoDur.value = 0;
  await loadFiles();
  await reload();
  // 自动打开了某个项目（点卡片/切会话）就进编辑视图；否则留在项目列表
  if (project.value) view.value = 'editor';
});

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown);
  await loadFiles();
  await reload();
  // ★ 进剪辑模式的第一屏是**项目列表**（剪映式草稿箱），不是空白时间轴：
  //   剪辑是产出型工作，用户首先要知道"手上有几个片子、各剪到哪了"。
  //   已有当前会话的工程（从别处带着会话进来）则直接进编辑视图，不做多余一跳。
  if (project.value) view.value = 'editor';
  await loadProjects();
  // 进编辑视图后立刻出一帧（否则监视器空白，用户会以为预览坏了）
  if (view.value === 'editor' && clipCount.value) scheduleFrameFetch(300);
});
</script>

<style scoped>
/* ★ flex:1 而不是 height:100% —— 上层 .main-content 是 flex 列容器，
   子元素写 height:100% 取不到父高，整页会缩成内容高度（上一版踩到）。 */
.clip-page { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--el-bg-color-page, #f5f7fa); }

/* ===== 顶栏 ===== */
.cp-top { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--el-bg-color); border-bottom: 1px solid var(--el-border-color-lighter); flex: 0 0 auto; min-height: 44px; }
.cp-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; color: var(--el-text-color-secondary); }
.cp-name-input { width: 180px; flex: 0 1 180px; min-width: 90px; padding: 3px 8px; font-size: 13px; font-weight: 600; border: 1px solid transparent; border-radius: 4px; background: transparent; }
.cp-name-input:hover, .cp-name-input:focus { border-color: var(--el-border-color); background: var(--el-fill-color-blank); }
.cp-meta { font-size: 12px; white-space: nowrap; color: var(--el-text-color-secondary); }
.cp-spacer { flex: 1; min-width: 0; }

/* ===== 主体三栏 ===== */
.cp-body { display: flex; flex: 1; min-height: 0; }
.cp-left { width: 210px; flex: 0 0 210px; display: flex; flex-direction: column; min-height: 0; background: var(--el-bg-color); border-right: 1px solid var(--el-border-color-lighter); }
.cp-center { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.cp-right { width: 330px; flex: 0 0 330px; display: flex; flex-direction: column; min-height: 0; background: var(--el-bg-color); border-left: 1px solid var(--el-border-color-lighter); }

.cp-panel-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px 4px; font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); flex: 0 0 auto; }
.cp-panel-head.sub { border-top: 1px solid var(--el-border-color-lighter); margin-top: 4px; }
.cp-count { font-weight: 400; color: var(--el-text-color-secondary); }
.cp-input { margin: 0 10px 6px; padding: 4px 8px; font-size: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; flex: 0 0 auto; }

/* 素材网格 */
.cp-media { flex: 1; min-height: 60px; overflow: auto; padding: 0 8px 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; align-content: start; }
.cp-media-item { display: flex; flex-direction: column; gap: 3px; padding: 6px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-blank); cursor: grab; font-size: 11px; }
.cp-media-item:hover { border-color: var(--el-color-primary); box-shadow: 0 1px 6px rgb(0 0 0 / 8%); }
.cp-media-icon { display: flex; align-items: center; justify-content: center; height: 34px; border-radius: 4px; background: var(--el-fill-color); color: var(--el-color-primary); }
.cp-media-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cp-spec { display: flex; gap: 6px; padding: 0 10px 8px; align-items: center; }
/* 工程设置（只读展示） */
.cp-propset { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 4px; }
.cp-prop { display: flex; align-items: center; justify-content: space-between; font-size: 11px; }
.cp-prop > span { color: var(--el-text-color-secondary); }
.cp-prop > b { font-weight: 500; font-variant-numeric: tabular-nums; }
.cp-tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: var(--el-fill-color); color: var(--el-text-color-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
/* 项目目录标签（可点击更换）：与只读规格标签区分开 —— 它是可操作的 */
.cp-dir-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 7px; border-radius: 3px; border: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-regular); cursor: pointer; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-dir-tag:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.cp-select { flex: 1; min-width: 0; padding: 3px 6px; font-size: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-fill-color-blank); }
.cp-spec-fps { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--el-text-color-secondary); }
.cp-num { width: 52px; padding: 3px 6px; font-size: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; }
.cp-num.wide { width: 100%; min-width: 0; }
.cp-bgm { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.cp-bgm-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--el-text-color-secondary); }
.cp-range { flex: 1; min-width: 0; }
.cp-val { font-size: 11px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.cp-check { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--el-text-color-regular); }

/* ===== 监视器 =====
   ★ 比例按剪辑软件惯例：监视器占**剩余全部高度**（flex:1），时间轴按内容定高在下方。
   上一版反了（monitor 定高 + timeline flex:1）→ 监视器被挤成窄条、时间轴下方大片空白。 */
.cp-monitor { flex: 1; min-height: 140px; padding: 10px 12px 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
/* 舞台铺满可用宽度、深色底（视频工作区惯例，不是主题色），画面在其中等比居中 */
.cp-monitor-stage { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; flex: 1; min-height: 0; background: #101216; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgb(0 0 0 / 18%); }
.cp-video { max-width: 100%; max-height: 100%; background: #000; }
.cp-monitor-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 16px; color: #7c8798; font-size: 12px; text-align: center; }
/* 实时预览帧：按输出画幅比例居中（与 <video> 一致的观感） */
.cp-live-frame { object-fit: contain; background: #000; }
/* 取帧中的旋转图标 */
.cp-spin { animation: cp-rotate 1s linear infinite; }
@keyframes cp-rotate { from { transform: rotate(0) } to { transform: rotate(360deg) } }
/* 「实时」角标：让用户清楚现在看的是实时帧而不是成片 */
.cp-live-badge { position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; font-size: 10px; border-radius: 3px; background: rgb(22 163 74 / 88%); color: #fff; z-index: 2; }
/* 取帧失败提示（贴底居中，不遮挡画面主体） */
.cp-live-err { position: absolute; left: 8px; right: 8px; bottom: 8px; font-size: 11px; line-height: 1.5; padding: 4px 8px; border-radius: 4px; background: rgb(220 38 38 / 88%); color: #fff; text-align: center; z-index: 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-transport { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 0; }
.cp-time { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--el-text-color-regular); }
/* 「待重新渲染」角标：成片与工程不一致时提醒（避免用户以为改动没生效） */
.cp-stale { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 1px 6px; border-radius: 3px; background: var(--el-color-warning-light-9); color: var(--el-color-warning); }
.cp-zoom { display: inline-flex; gap: 4px; }

/* ===== 时间轴（按内容定高，在监视器下方） ===== */
.cp-timeline { flex: 0 0 auto; display: flex; flex-direction: column; padding: 6px 12px 10px; }
.cp-toolbar { display: flex; align-items: center; gap: 4px; padding: 2px 0 6px; flex: 0 0 auto; }
.cp-toolbar-sep { width: 1px; height: 16px; background: var(--el-border-color-lighter); margin: 0 4px; }
.cp-hint { font-size: 11px; color: var(--el-text-color-placeholder); }
.cp-tl { display: flex; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; overflow: hidden; background: var(--el-fill-color-blank); }
.cp-tl-labels { flex: 0 0 62px; background: var(--el-fill-color-light); border-right: 1px solid var(--el-border-color-lighter); }
.cp-tl-label { display: flex; align-items: center; gap: 4px; height: 58px; padding: 0 8px; font-size: 11px; color: var(--el-text-color-secondary); border-bottom: 1px solid var(--el-border-color-lighter); }
.cp-tl-label.head { height: 24px; border-bottom: 1px solid var(--el-border-color-lighter); }
.cp-tl-scroll { flex: 1; min-width: 0; overflow-x: auto; overflow-y: hidden; }
.cp-tl-canvas { position: relative; min-width: 100%; }

/* 刻度尺 */
.cp-ruler { position: relative; height: 24px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-light); cursor: ew-resize; }
.cp-tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--el-border-color); }
.cp-tick span { position: absolute; left: 3px; top: 4px; font-size: 10px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* 轨道 */
.cp-track { position: relative; height: 58px; border-bottom: 1px solid var(--el-border-color-lighter); }
.cp-track-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--el-text-color-placeholder); }
.cp-track-empty-btn { width: 100%; padding: 0; border: none; background: none; cursor: pointer; }
.cp-track-empty-btn:hover:not(:disabled) { color: var(--el-color-primary); }
.cp-track-empty-btn:disabled { cursor: not-allowed; opacity: .55; }

/* 音效库弹窗 */
.cp-sfxl { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow: auto; }
.cp-sfxl-note { font-size: 11px; line-height: 1.7; color: var(--el-text-color-secondary); padding: 6px 8px; background: var(--el-fill-color-light); border-radius: 4px; }
.cp-sfxl-group { display: flex; flex-direction: column; gap: 5px; }
.cp-sfxl-gtitle { font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); }
.cp-sfxl-items { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.cp-sfxl-item { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 9px; text-align: left; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; background: var(--el-fill-color-blank); cursor: pointer; }
.cp-sfxl-item:hover:not(:disabled) { border-color: var(--el-color-primary); }
.cp-sfxl-item:disabled { opacity: .6; cursor: wait; }
.cp-sfxl-label { font-size: 12px; font-weight: 600; }
.cp-sfxl-desc { font-size: 10px; color: var(--el-text-color-secondary); }
.cp-sfxl-meta { position: absolute; right: 6px; top: 6px; font-size: 10px; color: var(--el-text-color-placeholder); font-variant-numeric: tabular-nums; }
.cp-sfxl-busy { font-size: 10px; color: var(--el-color-primary); }

/* 音效链：标签式展示 + 下拉添加 */
.cp-sfx { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.cp-sfx-chain { display: flex; flex-wrap: wrap; gap: 4px; }
.cp-sfx-tag { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; font-size: 11px; border-radius: 3px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); }
.cp-sfx-x { cursor: pointer; opacity: .7; }
.cp-sfx-x:hover { opacity: 1; }

/* ===== 右键菜单 ===== */
.cp-ctx { position: fixed; z-index: 3000; min-width: 190px; padding: 4px; background: var(--el-bg-color-overlay, #fff); border: 1px solid var(--el-border-color); border-radius: 6px; box-shadow: 0 6px 24px rgb(0 0 0 / 16%); }
.cp-ctx-mask { position: fixed; inset: 0; z-index: 2999; }
.cp-ctx-title { padding: 5px 9px 6px; font-size: 11px; color: var(--el-text-color-placeholder); border-bottom: 1px solid var(--el-border-color-lighter); margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-ctx-item { display: flex; align-items: center; gap: 7px; width: 100%; padding: 6px 9px; font-size: 12px; text-align: left; border: none; background: none; color: var(--el-text-color-regular); cursor: pointer; border-radius: 4px; }
.cp-ctx-item:hover:not(:disabled) { background: var(--el-fill-color-light); color: var(--el-color-primary); }
.cp-ctx-item:disabled { opacity: .4; cursor: not-allowed; }
.cp-ctx-item.danger:hover:not(:disabled) { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.cp-ctx-key { margin-left: auto; padding-left: 12px; font-size: 10px; color: var(--el-text-color-placeholder); font-variant-numeric: tabular-nums; }

/* ===== 片段边缘拖拽把手（拖动即修剪）===== */
.cp-clip-handle { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; z-index: 3; }
.cp-clip-handle:hover { background: rgb(255 255 255 / 45%); }
.cp-clip-handle.left { left: 0; border-radius: 5px 0 0 5px; }
.cp-clip-handle.right { right: 0; border-radius: 0 5px 5px 0; }

/* 片段（视频轨） */
.cp-clip { position: absolute; top: 5px; bottom: 5px; display: flex; flex-direction: column; gap: 1px; padding: 4px 6px; border-radius: 5px; background: linear-gradient(180deg, #7cc0ff, #4a9ded); border: 1px solid #2b7fd4; color: #fff; cursor: pointer; overflow: hidden; }
.cp-clip:hover { filter: brightness(1.05); }
.cp-clip.active { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.cp-clip-idx { font-size: 10px; opacity: .85; }
.cp-clip-name { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-clip-tags { display: flex; gap: 3px; flex-wrap: wrap; }
.cp-clip-tags em { font-style: normal; font-size: 9px; padding: 0 4px; border-radius: 3px; background: rgb(255 255 255 / 28%); }
/* 片段块内的音频波形底图（铺满底部；加载失败 img 不显示不报错） */
.cp-clip-wave { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 40%; object-fit: fill; opacity: .35; pointer-events: none; }

/* 字幕条 */
.cp-text { position: absolute; top: 8px; height: 42px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 3px 6px; border-radius: 5px; background: linear-gradient(180deg, #ffe08a, #f5c33f); border: 1px solid #d9a520; color: #4a3606; cursor: pointer; overflow: hidden; }
.cp-text:hover { filter: brightness(1.03); }
.cp-text.active { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.cp-text-txt { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-text-anim { font-style: normal; font-size: 9px; opacity: .8; }

/* 音频条 */
.cp-audio { position: absolute; top: 10px; height: 38px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border-radius: 5px; background: linear-gradient(180deg, #b6e3c6, #86cfa6); border: 1px solid #5fae7f; color: #14432a; font-size: 11px; overflow: hidden; }
.cp-bgm-wave { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; opacity: .3; pointer-events: none; }
/* 画中画块（紫色系区分视频/音频轨） */
.cp-pip { position: absolute; top: 5px; bottom: 5px; display: flex; align-items: center; padding: 0 6px; border-radius: 5px; background: linear-gradient(180deg, #c9b6f5, #a68ade); border: 1px solid #7d5cc9; color: #fff; font-size: 11px; cursor: pointer; overflow: hidden; }
.cp-pip.active { outline: 2px solid #fff; }
/* 关键帧行：t / scale / x / y / opacity 五个数字 + 删除 */
.cp-kf-row { display: flex; align-items: center; gap: 3px; }
.cp-kf-row .cp-num { flex: 1; min-width: 0; padding: 2px 3px; }

/* 播放头 */
.cp-playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #ff4d4f; pointer-events: none; z-index: 5; }
.cp-playhead-knob { position: absolute; top: 0; left: -4px; width: 10px; height: 10px; border-radius: 0 0 4px 4px; background: #ff4d4f; }

/* ===== 检视器 ===== */
.cp-tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid var(--el-border-color-lighter); }
.cp-tab { flex: 1; padding: 8px 0; font-size: 12px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--el-text-color-secondary); cursor: pointer; }
.cp-tab.on { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; }
.cp-ins { flex: 1; min-height: 0; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.cp-ins-head { display: flex; align-items: baseline; gap: 6px; }
.cp-ins-title { font-size: 13px; font-weight: 600; }
.cp-ins-sub { font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-field { display: flex; flex-direction: column; gap: 4px; }
.cp-field > label { display: flex; justify-content: space-between; font-size: 11px; color: var(--el-text-color-secondary); }
.cp-field-row { display: flex; align-items: center; gap: 6px; }
.cp-tilde { font-size: 11px; color: var(--el-text-color-placeholder); }
.cp-textarea { width: 100%; padding: 5px 8px; font-size: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; resize: vertical; font-family: inherit; }
.cp-seg-btns { display: flex; gap: 4px; }
.cp-color { width: 34px; height: 24px; padding: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: none; cursor: pointer; }
.cp-chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }

/* ===== 项目列表（剪映式草稿箱） ===== */
.cp-projects { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px; }
.cp-pj-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.cp-pj-title { font-size: 15px; font-weight: 600; }
.cp-pj-count { font-size: 12px; color: var(--el-text-color-secondary); }
.cp-pj-dir { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--el-text-color-placeholder); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-pj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.cp-pj-card { position: relative; display: flex; flex-direction: column; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); overflow: hidden; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
.cp-pj-card:hover { border-color: var(--el-color-primary); box-shadow: 0 3px 12px rgb(0 0 0 / 10%); }
.cp-pj-card.active { border-color: var(--el-color-primary); }
/* 封面：按画幅比例画占位框（真实首帧需渲染，成本高且非必要） */
.cp-pj-cover { position: relative; display: flex; align-items: center; justify-content: center; max-height: 150px; background: linear-gradient(140deg, #2b3446, #48566f); }
.cp-pj-cover::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgb(255 255 255 / 4%) 0 8px, transparent 8px 16px); }
.cp-pj-dur { position: absolute; right: 6px; bottom: 6px; padding: 1px 5px; font-size: 11px; border-radius: 3px; background: rgb(0 0 0 / 55%); color: #fff; font-variant-numeric: tabular-nums; z-index: 1; }
.cp-pj-warn { position: absolute; left: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px; font-size: 11px; border-radius: 3px; background: rgb(230 162 60 / 92%); color: #fff; z-index: 1; }
.cp-pj-info { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 3px; }
.cp-pj-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-pj-meta { font-size: 11px; color: var(--el-text-color-secondary); }
.cp-pj-time { font-size: 11px; color: var(--el-text-color-placeholder); font-variant-numeric: tabular-nums; }
.cp-pj-del { position: absolute; top: 6px; right: 6px; display: none; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; border-radius: 4px; background: rgb(0 0 0 / 45%); color: #fff; cursor: pointer; z-index: 2; }
.cp-pj-card:hover .cp-pj-del { display: inline-flex; }
.cp-pj-del:hover { background: var(--el-color-danger); }

/* ===== 新建项目对话框 ===== */
.cp-np { display: flex; flex-direction: column; gap: 12px; }
.cp-np-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.cp-np-row.col { flex-direction: column; align-items: stretch; gap: 6px; }
.cp-np-row > span { color: var(--el-text-color-secondary); }
.cp-np-row .cp-input { margin: 0; }
.cp-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
/* 小号预设网格（蒙版/样式模板用：3 列，字小一点） */
.cp-preset-grid.sm { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.cp-preset-grid.sm .cp-preset { padding: 5px 4px; }
.cp-preset-grid.sm .cp-preset-label { font-size: 11px; }

/* 属性面板里的可折叠分组（蒙版等） */
.cp-grp { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; overflow: hidden; }
.cp-grp-head { display: flex; align-items: center; gap: 5px; padding: 6px 8px; font-size: 12px; font-weight: 600; background: var(--el-fill-color-light); cursor: pointer; }
.cp-grp-head:hover { background: var(--el-fill-color); }
.cp-grp-badge { font-weight: 400; font-size: 10px; padding: 0 5px; border-radius: 3px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); }
.cp-grp-body { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.cp-preset { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-blank); cursor: pointer; font-size: 11px; }
.cp-preset:hover { border-color: var(--el-color-primary); }
.cp-preset.on { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.cp-preset-ratio { display: block; width: auto; height: 34px; background: var(--el-fill-color-dark); border: 1px solid var(--el-border-color); border-radius: 3px; }
.cp-preset.on .cp-preset-ratio { background: var(--el-color-primary-light-7); }
.cp-preset-label { color: var(--el-text-color-regular); text-align: center; }
.cp-preset-size { color: var(--el-text-color-placeholder); font-variant-numeric: tabular-nums; }
.cp-np-hint { font-size: 11px; line-height: 1.7; color: var(--el-text-color-placeholder); }
.cp-btn.danger { background: var(--el-color-danger); border-color: var(--el-color-danger); color: #fff; }
.cp-btn.danger:hover:not(:disabled) { filter: brightness(1.08); color: #fff; }

/* ===== 按钮与提示 ===== */
.cp-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 12px; border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-fill-color-blank); color: var(--el-text-color-regular); cursor: pointer; white-space: nowrap; }
.cp-btn:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.cp-btn:disabled { opacity: .45; cursor: not-allowed; }
.cp-btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; }
.cp-btn.primary:hover:not(:disabled) { filter: brightness(1.08); color: #fff; }
.cp-btn.ghost { background: transparent; }
.cp-btn.full { width: 100%; justify-content: center; margin-top: 2px; }
.cp-mini { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 6px; font-size: 11px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-fill-color-blank); color: var(--el-text-color-regular); cursor: pointer; }
.cp-mini:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.cp-mini:disabled { opacity: .4; cursor: not-allowed; }
.cp-mini.on { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; }
.cp-mini.danger:hover:not(:disabled) { border-color: var(--el-color-danger); color: var(--el-color-danger); }
.cp-empty { padding: 16px 10px; font-size: 12px; line-height: 1.7; color: var(--el-text-color-placeholder); text-align: center; word-break: normal; overflow-wrap: anywhere; }
.cp-empty.small { padding: 8px; }
/* 素材栏窄（210px）：空态与条目标题都不许被压成竖排 */
.cp-media-name, .cp-bgm-name, .cp-sec-title { white-space: nowrap; }
.cp-empty { white-space: normal; }
.cp-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 7px 14px; font-size: 12px; color: #fff; background: rgb(0 0 0 / 76%); border-radius: 6px; cursor: pointer; z-index: 20; }

/* 窄屏：顶栏换行（不横向溢出）、右栏收窄、素材栏收成更窄（保留可用，不做"直接消失"） */
@media (max-width: 1199px) {
  /* ★ 150px 太窄：空态长句会被压成竖排（实测 1100px 命中）。
     收到 168px 并配合 .cp-empty 的自然断行，仍保持单列可用。 */
  .cp-left { width: 168px; flex-basis: 168px; }
  .cp-right { width: 270px; flex-basis: 270px; }
  .cp-media { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .cp-top { flex-wrap: wrap; }
  .cp-left { display: none; }
}
@media (max-width: 640px) {
  .cp-right { width: 220px; flex-basis: 220px; }
  .cp-hint { display: none; }
}
</style>