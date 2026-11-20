<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Activity,
  CircleDot,
  GitBranch,
  HeartPulse,
  ScanLine,
  UserRound,
} from 'lucide-vue-next';

type AtlasLayer = 'regions' | 'organs' | 'skeleton' | 'vessels' | 'meridians';

type AtlasDefinition = {
  key: AtlasLayer;
  label: string;
  short: string;
  title: string;
  description: string;
  points: readonly string[];
  source: string;
  safety: string;
  icon: unknown;
};

const ATLAS_LAYERS: readonly AtlasDefinition[] = [
  {
    key: 'regions',
    label: '体表分区',
    short: '人体',
    title: '人体外部区域与方向',
    description: '先建立头颈、胸腹、盆腔和四肢的共同方位词。学习病例时用“左/右”时，默认描述病例本人的左右侧。',
    points: ['头颈部', '胸部', '腹部', '盆腔', '上肢与下肢'],
    source: '据 OpenStax Anatomy and Physiology 2e 的体表分区与方向术语整理。',
    safety: '位置图为教学示意，不代替体表标志触诊或专业解剖教材。',
    icon: UserRound,
  },
  {
    key: 'organs',
    label: '内脏分布',
    short: '内脏',
    title: '主要器官的胸腔与腹腔位置',
    description: '用前视图建立脑、肺、心、肝、胃、肠、肾与膀胱的相对位置，重点理解器官相邻、被骨骼保护以及与体表投影的大致关系。',
    points: ['脑与中枢', '肺与心脏', '肝、胃与胆囊', '小肠与大肠', '肾与膀胱'],
    source: '据 OpenStax Anatomy and Physiology 2e、MedlinePlus 与 NIH 公开人体解剖资料整理。',
    safety: '器官大小、位置会随年龄、体型、呼吸和病理状态变化，本图不代表个体真实影像。',
    icon: Activity,
  },
  {
    key: 'skeleton',
    label: '骨骼',
    short: '骨骼',
    title: '人体主要骨骼与关节',
    description: '认识颅骨、脊柱、胸廓、骨盆和四肢长骨的大体连接。病例里的“胸骨后”“右上腹”“腰椎旁”等词，要先回到这些结构。',
    points: ['颅骨与下颌骨', '颈椎、胸椎与腰椎', '肋骨与胸骨', '肩带与上肢骨', '骨盆与下肢骨'],
    source: '据 OpenStax Anatomy and Physiology 2e 与 NCBI Bookshelf 公开解剖教材整理。',
    safety: '本图省略大量骨性标志与细节，不可用于骨折定位、穿刺或影像判读。',
    icon: GitBranch,
  },
  {
    key: 'vessels',
    label: '血脉循环',
    short: '血脉',
    title: '心脏与主要动静脉通路',
    description: '用颜色和箭头区分富含氧的动脉侧与回流静脉侧，认识主动脉、上下腔静脉、颈部与四肢主要通路，但不绘制个体变异。',
    points: ['心脏四腔示意', '主动脉与体循环', '上下腔静脉', '颈动脉与锁骨下血管', '髂动脉与股血管'],
    source: '据 OpenStax Anatomy and Physiology 2e 与 MedlinePlus 循环系统资料整理。',
    safety: '血管走行高度简化，不能用于止血点、注射、穿刺或影像定位。',
    icon: HeartPulse,
  },
  {
    key: 'meridians',
    label: '经络穴位',
    short: '经络',
    title: '经络与常用穴位的课堂定位',
    description: '把十二经脉与常见穴位放进人体方位图中，用于阅读古籍、理解传统术语和核对病例资料。经络线为传统理论示意，不等同于血管或神经。',
    points: ['百会：头顶部', '合谷：手部虎口区域', '内关：前臂掌侧', '足三里：小腿前外侧', '三阴交：内踝上方'],
    source: '经络名称与穴位定位参考国家中医药管理局公开标准及《黄帝内经》《针灸甲乙经》等公版文献。',
    safety: '只用于辨认与学习；不依据此图自行针刺、艾灸、按压治疗或替代就医。',
    icon: CircleDot,
  },
] as const;

const activeLayer = ref<AtlasLayer>('regions');
const selected = computed(() =>
  ATLAS_LAYERS.find((item) => item.key === activeLayer.value) || ATLAS_LAYERS[0],
);
const figureTitleId = computed(() => `medical-atlas-${activeLayer.value}-title`);
</script>

<template>
  <section class="medical-atlas" data-medical-atlas>
    <header class="medical-atlas-head">
      <div>
        <span>人体图鉴 · 五层示意</span>
        <h2>先看位置，再读病例</h2>
        <p>前视示意图用于建立方位和结构关系。所有图均为学习简化，不替代解剖教材、影像或真人检查。</p>
      </div>
      <ScanLine :size="26" aria-hidden="true" />
    </header>

    <nav class="medical-atlas-tabs" role="tablist" aria-label="人体图鉴层级">
      <button
        v-for="layer in ATLAS_LAYERS"
        :key="layer.key"
        type="button"
        role="tab"
        :aria-selected="activeLayer === layer.key"
        :aria-controls="`medical-atlas-${layer.key}`"
        :class="{ active: activeLayer === layer.key }"
        @click="activeLayer = layer.key"
      >
        <component :is="layer.icon" :size="16" aria-hidden="true" />
        <span>{{ layer.label }}</span>
      </button>
    </nav>

    <div class="medical-atlas-layout">
      <figure
        class="medical-atlas-figure"
        role="tabpanel"
        :id="`medical-atlas-${activeLayer}`"
        :aria-labelledby="figureTitleId"
      >
        <figcaption>
          <b>{{ selected.title }}</b>
          <span>前视教学示意 · 非真人影像</span>
        </figcaption>
        <svg
          viewBox="0 0 340 560"
          role="img"
          :aria-labelledby="figureTitleId"
          preserveAspectRatio="xMidYMid meet"
        >
          <title :id="figureTitleId">{{ selected.title }}</title>
          <defs>
            <linearGradient id="medical-body-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#e8f1ed" />
              <stop offset="1" stop-color="#d8e7e1" />
            </linearGradient>
            <pattern id="medical-artery-pattern" width="7" height="7" patternUnits="userSpaceOnUse">
              <path d="M0 7L7 0" stroke="#fff" stroke-width="1" opacity=".45" />
            </pattern>
            <marker id="medical-arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" fill="#b94b4b" />
            </marker>
            <marker id="medical-arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" fill="#4a6f9c" />
            </marker>
          </defs>

          <g class="medical-body-outline" aria-hidden="true">
            <circle cx="170" cy="48" r="25" />
            <path d="M157 71h26l6 39c10 4 24 8 37 17l51 73-17 12-43-57-8 57 8 80-10 193h-28l-3-169-3 169h-28l-10-193 8-80-8-57-43 57-17-12 51-73c13-9 27-13 37-17l6-39Z" />
            <path d="M154 98c-2 39-1 77 3 111h26c4-34 5-72 3-111" />
          </g>

          <g v-if="activeLayer === 'regions'" class="medical-region-layer">
            <path class="medical-region-band" d="M144 83h52v31h-52z" />
            <path class="medical-region-band" d="M128 116c26-12 58-12 84 0l4 92h-92z" />
            <path class="medical-region-band" d="M126 211h88v95h-88z" />
            <path class="medical-region-band" d="M132 309h76v48h-76z" />
            <path class="medical-region-band" d="M70 144l30-25 18 27-22 88-24-11z" />
            <path class="medical-region-band" d="M240 119l30 25-2 79-24 11-22-88z" />
            <path class="medical-region-band" d="M106 359h44v139h-44z" />
            <path class="medical-region-band" d="M190 359h44v139h-44z" />
            <g class="medical-atlas-labels">
              <path d="M170 48h86" /><text x="260" y="52">头颈部</text>
              <path d="M170 150h94" /><text x="268" y="154">胸部</text>
              <path d="M170 250h106" /><text x="280" y="254">腹部</text>
              <path d="M170 332h116" /><text x="290" y="336">盆腔</text>
              <path d="M78 220h-42" /><text x="8" y="224">上肢</text>
              <path d="M212 430h55" /><text x="271" y="434">下肢</text>
            </g>
          </g>

          <g v-else-if="activeLayer === 'organs'" class="medical-organ-layer">
            <path class="organ brain" d="M150 34c6-15 34-15 40 0 8 6 8 25-4 31h-32c-12-6-12-25-4-31Z" />
            <path class="organ lung" d="M133 113c-22 8-31 39-25 66 5 21 20 31 38 16l13-48Z" />
            <path class="organ lung" d="M207 113c22 8 31 39 25 66-5 21-20 31-38 16l-13-48Z" />
            <path class="organ heart" d="M164 153c-14-14-29 8-8 25l14 13 15-13c20-17 4-39-9-25-4 4-8 4-12 0Z" />
            <path class="organ liver" d="M153 215c19-9 51-8 60 5 5 8-4 25-18 28-18 3-36-4-44-15Z" />
            <path class="organ stomach" d="M150 230c-19 4-26 24-14 39 8 10 22 12 31 2 8-10 6-28-4-36Z" />
            <path class="organ kidney" d="M130 249c-14-5-22 12-14 24 5 8 14 10 22 5l3-22Z" />
            <path class="organ kidney" d="M210 249c14-5 22 12 14 24-5 8-14 10-22 5l-3-22Z" />
            <path class="organ intestine" d="M137 281c14-11 51-11 66 0 7 5 7 28 0 35-13 15-53 15-66 0-7-7-7-30 0-35Z" />
            <path class="organ colon" d="M126 303c-5-25 13-42 44-42s49 17 44 42c-4 18-23 28-44 28s-40-10-44-28Z" />
            <path class="organ bladder" d="M155 345c8-10 22-10 30 0 8 12 3 24-15 24s-23-12-15-24Z" />
            <g class="medical-organ-labels">
              <path d="M187 49h78" /><text x="270" y="53">脑</text>
              <path d="M117 145h-52" /><text x="26" y="149">肺</text>
              <path d="M193 172h62" /><text x="260" y="176">心脏</text>
              <path d="M210 233h69" /><text x="284" y="237">肝</text>
              <path d="M151 249h-66" /><text x="48" y="253">胃</text>
              <path d="M215 289h71" /><text x="291" y="293">肠</text>
              <path d="M146 355h-64" /><text x="48" y="359">膀胱</text>
            </g>
          </g>

          <g v-else-if="activeLayer === 'skeleton'" class="medical-skeleton-layer">
            <ellipse class="bone skull" cx="170" cy="48" rx="22" ry="26" />
            <path class="bone" d="M156 68h28l-3 15h-22z" />
            <path class="bone clavicle" d="M147 104c-15-3-30 0-41 8" />
            <path class="bone clavicle" d="M193 104c15-3 30 0 41 8" />
            <path class="bone spine" d="M170 84c-2 56 4 121 0 181 0 39 5 88 1 125" />
            <g class="vertebrae">
              <circle v-for="y in [96, 111, 126, 141, 156, 171, 186, 205, 224, 243, 262, 287, 312, 337]" :key="y" cx="170" :cy="y" r="4" />
            </g>
            <path v-for="(y, index) in [119, 134, 149, 164, 179, 194]" :key="`rib-${y}`" class="bone rib" :d="`M170 ${y}c-${26 + index * 2} -4 -${38 + index * 3} ${10 + index * 2} -${28 + index * 2} ${24 + index * 2}`" />
            <path v-for="(y, index) in [119, 134, 149, 164, 179, 194]" :key="`rib-right-${y}`" class="bone rib" :d="`M170 ${y}c${26 + index * 2} -4 ${38 + index * 3} ${10 + index * 2} ${28 + index * 2} ${24 + index * 2}`" />
            <path class="bone pelvis" d="M137 241c-16 19-11 49 8 59l25-21V243l-15-10-18 8Zm66 0c16 19 11 49-8 59l-25-21V243l15-10 18 8Z" />
            <path class="bone arm" d="M105 118L76 193 55 249" />
            <path class="bone arm" d="M235 118l29 75 21 56" />
            <path class="bone leg" d="M150 291l-20 97-5 111" />
            <path class="bone leg" d="M190 291l20 97 5 111" />
            <g class="joints">
              <circle v-for="point in [[76,193],[235,193],[55,249],[265,249],[150,291],[190,291],[130,388],[210,388],[125,499],[215,499]]" :key="point.join('-')" :cx="point[0]" :cy="point[1]" r="5" />
            </g>
            <g class="medical-atlas-labels">
              <path d="M192 48h70" /><text x="270" y="52">颅骨</text>
              <path d="M174 160h74" /><text x="256" y="164">脊柱 · 肋骨</text>
              <path d="M203 275h65" /><text x="276" y="279">骨盆</text>
              <path d="M58 249h-36" /><text x="7" y="253">关节</text>
              <path d="M128 430h-74" /><text x="36" y="434">下肢骨</text>
            </g>
          </g>

          <g v-else-if="activeLayer === 'vessels'" class="medical-vessel-layer">
            <path class="artery" d="M170 146c0 25 1 50-3 72-4 28-10 50-20 70" marker-end="url(#medical-arrow-red)" />
            <path class="artery" d="M170 146c-1-32-4-63-7-94" marker-end="url(#medical-arrow-red)" />
            <path class="artery" d="M163 150c-24 8-45 17-71 30" marker-end="url(#medical-arrow-red)" />
            <path class="artery" d="M177 150c24 8 45 17 71 30" marker-end="url(#medical-arrow-red)" />
            <path class="artery" d="M148 287c-18 39-19 74-23 117-3 35-5 65-8 91" marker-end="url(#medical-arrow-red)" />
            <path class="artery" d="M192 287c18 39 19 74 23 117 3 35 5 65 8 91" marker-end="url(#medical-arrow-red)" />
            <path class="vein" d="M160 171c2 30 4 61 6 89" marker-end="url(#medical-arrow-blue)" />
            <path class="vein" d="M154 105c-10-18-20-35-24-55" marker-end="url(#medical-arrow-blue)" />
            <path class="vein" d="M98 182c-16-22-23-36-30-51" marker-end="url(#medical-arrow-blue)" />
            <path class="vein" d="M242 182c16-22 23-36 30-51" marker-end="url(#medical-arrow-blue)" />
            <path class="vein" d="M158 266c-10 30-13 68-14 112" marker-end="url(#medical-arrow-blue)" />
            <path class="vein" d="M182 266c10 30 13 68 14 112" marker-end="url(#medical-arrow-blue)" />
            <path class="heart-outline" d="M154 150c-18-18-35 9-10 29l26 24 27-24c24-20 7-47-10-29-6 5-13 5-19 0-4-3-8-3-14 0Z" />
            <g class="medical-vessel-legend">
              <path class="artery" d="M18 520h30" marker-end="url(#medical-arrow-red)" /><text x="56" y="524">动脉侧 · 富氧</text>
              <path class="vein" d="M184 520h30" marker-end="url(#medical-arrow-blue)" /><text x="222" y="524">静脉侧 · 回流</text>
            </g>
            <g class="medical-atlas-labels">
              <path d="M190 171h77" /><text x="273" y="175">心脏</text>
              <path d="M166 80h62" /><text x="236" y="84">颈血管</text>
              <path d="M86 189h-49" /><text x="12" y="193">上肢血管</text>
              <path d="M120 458h-78" /><text x="18" y="462">下肢血管</text>
            </g>
          </g>

          <g v-else class="medical-meridian-layer">
            <path class="meridian-line" d="M170 28c-9 27-9 55 0 83 8 25 8 58-2 92-9 31-11 67-7 99 5 41 7 88 3 139" />
            <path class="meridian-line" d="M151 105c-24 15-44 35-56 60-16 32-32 67-47 109" />
            <path class="meridian-line" d="M189 105c24 15 44 35 56 60 16 32 32 67 47 109" />
            <path class="meridian-line" d="M143 220c-18 32-25 68-29 104-5 43-9 85-12 127" />
            <path class="meridian-line" d="M197 220c18 32 25 68 29 104 5 43 9 85 12 127" />
            <path class="meridian-line" d="M150 119c11 20 19 47 21 76 2 28 0 57-4 87" />
            <path class="meridian-line" d="M190 119c-11 20-19 47-21 76-2 28 0 57 4 87" />
            <g class="acupoints">
              <circle cx="170" cy="28" r="5" />
              <circle cx="53" cy="272" r="5" />
              <circle cx="287" cy="272" r="5" />
              <circle cx="225" cy="245" r="5" />
              <circle cx="122" cy="439" r="5" />
              <circle cx="134" cy="476" r="5" />
            </g>
            <g class="medical-atlas-labels">
              <path d="M170 28h77" /><text x="254" y="32">百会</text>
              <path d="M225 245h49" /><text x="280" y="249">内关</text>
              <path d="M53 272h-38" /><text x="8" y="276">合谷</text>
              <path d="M122 439h-70" /><text x="36" y="443">足三里</text>
              <path d="M134 476h-68" /><text x="58" y="480">三阴交</text>
            </g>
            <text class="medical-meridian-note" x="14" y="546">经络线为传统理论示意，不等同于血管或神经</text>
          </g>
        </svg>
      </figure>

      <aside class="medical-atlas-detail">
        <span>{{ selected.label }}</span>
        <h3>{{ selected.title }}</h3>
        <p>{{ selected.description }}</p>
        <ol>
          <li v-for="(point, index) in selected.points" :key="point">
            <i>{{ String(index + 1).padStart(2, '0') }}</i>
            <span>{{ point }}</span>
          </li>
        </ol>
        <section>
          <b>来源</b>
          <p>{{ selected.source }}</p>
        </section>
        <section class="medical-atlas-safety">
          <b>使用边界</b>
          <p>{{ selected.safety }}</p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.medical-atlas {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  background: var(--lv2-surface, #fff);
  color: var(--color-text, #17211e);
}

.medical-atlas-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.medical-atlas-head span {
  color: var(--lv2-accent, #1f6f5c);
  font-size: 9px;
  font-weight: 700;
}

.medical-atlas-head h2 {
  margin: 4px 0 0;
  font-size: 22px;
  letter-spacing: 0;
}

.medical-atlas-head p,
.medical-atlas-detail > p,
.medical-atlas-detail section p {
  margin: 7px 0 0;
  color: var(--lv2-muted, #748078);
  font-size: 11px;
  line-height: 1.75;
}

.medical-atlas-head > svg {
  flex: 0 0 auto;
  color: var(--lv2-accent, #1f6f5c);
}

.medical-atlas-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.medical-atlas-tabs button {
  display: inline-flex;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  cursor: pointer;
}

.medical-atlas-tabs button.active {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-tint, #edf7f2);
  font-weight: 700;
}

.medical-atlas-layout {
  display: grid;
  grid-template-columns: minmax(320px, 1.15fr) minmax(250px, .85fr);
  gap: 12px;
  min-height: 0;
  flex: 1;
}

.medical-atlas-figure,
.medical-atlas-detail {
  min-width: 0;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 8px;
  background: #fafcfa;
}

.medical-atlas-figure {
  display: flex;
  flex-direction: column;
}

.medical-atlas-figure figcaption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.medical-atlas-figure figcaption b {
  font-size: 12px;
}

.medical-atlas-figure figcaption span {
  color: var(--lv2-muted, #748078);
  font-size: 8px;
}

.medical-atlas-figure svg {
  display: block;
  width: 100%;
  min-height: 390px;
  flex: 1;
  border-radius: 7px;
  background: #f4f8f5;
}

.medical-body-outline > * {
  fill: url(#medical-body-fill);
  stroke: #9fb9ae;
  stroke-width: 1.4;
}

.medical-body-outline > path:nth-child(2) {
  fill: none;
  stroke-dasharray: 4 4;
}

.medical-region-band {
  fill: #d6ebe2;
  stroke: #4c8c76;
  stroke-width: 1.2;
}

.medical-atlas-labels path {
  fill: none;
  stroke: #76968a;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.medical-atlas-labels text,
.medical-vessel-legend text,
.medical-meridian-note {
  fill: #405a50;
  font-size: 10px;
}

.organ {
  stroke: #355247;
  stroke-width: 1.2;
  opacity: .92;
}

.organ.brain { fill: #d6c8d8; }
.organ.lung { fill: #c9d9e7; }
.organ.heart { fill: #d89090; }
.organ.liver { fill: #b98974; }
.organ.stomach { fill: #d8c697; }
.organ.kidney { fill: #9d8f76; }
.organ.intestine { fill: #d4b9a4; }
.organ.colon { fill: none; stroke-width: 8; }
.organ.bladder { fill: #d5c5a5; }

.medical-organ-labels path {
  fill: none;
  stroke: #7d8d87;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.medical-organ-labels text {
  fill: #465a52;
  font-size: 10px;
}

.bone,
.skull {
  fill: #e8e4d9;
  stroke: #8a806c;
  stroke-width: 2.2;
}

.bone.rib,
.bone.clavicle {
  fill: none;
  stroke-width: 3;
}

.bone.spine {
  fill: none;
  stroke-width: 4;
}

.bone.pelvis {
  fill: #ded8cb;
}

.vertebrae circle,
.joints circle {
  fill: #b8aa91;
  stroke: #7d725f;
  stroke-width: 1;
}

.artery,
.vein,
.heart-outline {
  fill: none;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.artery {
  stroke: #b94b4b;
}

.vein {
  stroke: #4a6f9c;
}

.heart-outline {
  fill: #e7b6b6;
  stroke: #b94b4b;
  stroke-width: 2.4;
}

.meridian-line {
  fill: none;
  stroke: #528c79;
  stroke-width: 2.2;
  stroke-dasharray: 5 4;
}

.acupoints circle {
  fill: #c17b35;
  stroke: #fff;
  stroke-width: 2;
}

.medical-atlas-detail {
  display: flex;
  flex-direction: column;
}

.medical-atlas-detail > span {
  color: var(--lv2-accent, #1f6f5c);
  font-size: 9px;
  font-weight: 700;
}

.medical-atlas-detail h3 {
  margin: 5px 0 0;
  font-size: 18px;
}

.medical-atlas-detail ol {
  display: grid;
  gap: 7px;
  margin: 14px 0;
  padding: 0;
  list-style: none;
}

.medical-atlas-detail li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 9px;
  padding: 8px 0;
  border-bottom: 1px solid var(--lv2-line, #dbe3df);
  font-size: 10px;
}

.medical-atlas-detail li i {
  color: var(--lv2-accent, #1f6f5c);
  font-style: normal;
  font-weight: 700;
}

.medical-atlas-detail section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--lv2-line, #dbe3df);
}

.medical-atlas-detail section b {
  font-size: 10px;
}

.medical-atlas-safety {
  margin-top: auto !important;
  color: #725d3c;
}

.medical-atlas-safety p {
  color: #725d3c !important;
}

@media (max-width: 900px) {
  .medical-atlas {
    padding: 12px;
  }

  .medical-atlas-head h2 {
    font-size: 19px;
  }

  .medical-atlas-head p,
  .medical-atlas-detail > p,
  .medical-atlas-detail section p {
    font-size: 12px;
  }

  .medical-atlas-layout {
    grid-template-columns: 1fr;
  }

  .medical-atlas-figure svg {
    max-height: 520px;
    min-height: 340px;
  }

  .medical-atlas-tabs button {
    font-size: 11px;
  }
}

@media (max-width: 360px) {
  .medical-atlas-head {
    display: block;
  }

  .medical-atlas-head > svg {
    display: none;
  }

  .medical-atlas-figure figcaption {
    display: block;
  }

  .medical-atlas-figure figcaption span {
    display: block;
    margin-top: 3px;
  }
}
</style>
