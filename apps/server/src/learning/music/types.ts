// 音乐学习内容模型 v2（docs/音乐双方向重构方案-2026-11-15.md §四）。
// ★ v1 只有一套中国传统五声体系（Pitch = 宫商角徵羽），没有西方乐理的数据位 ——
//   用户指正「五线谱不是国外的吗？怎么都是宫调式」后重写：
//   十二平均律（step + alter + octave）是唯一音高内核，五声降级为只读视图（scale.ts PENTA_VIEW）。
// ★ 与 services/music-plan.ts 的 NoteEvent 同名不同义：那边是多声部、start/dur 秒制；
//   这边是单声部、beats 拍制。两套数据只经 arrange.ts 的 scoreToSpec/specToScore 显式转换，
//   禁止直接当同一类型用（同名导出不在同一个 export * 汇聚点，但转换仍必须显式）。

/** 乐理体系方向：western = 现代通用乐理（西方体系）；traditional = 中国传统音乐 */
export type MusicTrack = 'western' | 'traditional';

/** 七个基本音级（C D E F G A B） */
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** 五声正音名（只用于传统方向视图与调式命名，不再是音高内核） */
export type TradPitch = 'gong' | 'shang' | 'jue' | 'zhi' | 'yu';

/** 单个音符事件（四记法共用同一份数据） */
export type NoteEvent = {
  step: Step;
  /** 升降号：-1 降 / 0 还原（缺省）/ 1 升；黑键 = 白键 + alter */
  alter?: -1 | 0 | 1;
  /** 八度：4 = 中央 C 所在八度（C4 = 261.63 Hz），每 +1 八度 +12 半音 */
  octave: number;
  /** 时值（拍）：0.5 八分 / 1 四分 / 1.5 附点四分 / 2 二分 / 4 全音符 */
  beats: number;
  /** 依谱写词 / 曲目示范词：该音对应的字（一字一音） */
  lyric?: string;
  /** 休止：true 时 pitch 无声，谱面画休止符 */
  rest?: boolean;
};

/** 调式：西方 = 大/小调（白键根），传统 = 五声调式（宫商角徵羽主音） */
export type ScoreMode =
  | { kind: 'major' | 'minor'; tonic: Step }
  | { kind: 'pentatonic'; tonic: TradPitch };

/** 曲目 / 作品谱面 */
export type Score = {
  id: string;
  title: string;
  track: MusicTrack;
  /** 首版单声部高音谱表 */
  clef: 'treble';
  /** 调号说明（谱面文本呈现，P0 收口）：'C' | 'G' | 'F' | 'C 宫' */
  key: string;
  /** 拍号，如 [4, 4] = 4/4、[3, 4] = 3/4 */
  meter: [number, number];
  mode: ScoreMode;
  notes: NoteEvent[];
};

/** 音乐分阶（两方向共用阶名集合；每方向用子集） */
export type MusicLevel = '听与拍' | '识谱' | '调性与色彩' | '依谱写词' | '编曲实践' | '体系对照';

/** 沉浸台五步：听 → 认 → 写 → 奏 → 查 */
export type MusicStepKind = 'listen' | 'recognize' | 'write' | 'play' | 'check';

/** 自测题：服务端下发、前端判卷 */
export type MusicQuickCheck = {
  question: string;
  options: string[];
  /** 与 options 之一全等 */
  answer: string;
  explanation: string;
};

/** 音乐课时（A/B 两方向各自的课时，track 必填） */
export type MusicLesson = {
  id: string;
  kind: 'listen' | 'read' | 'compose' | 'lyric' | 'check';
  title: string;
  goal: string;
  minutes: number;
  level: MusicLevel;
  track: MusicTrack;
  steps: MusicStepKind[];
  /** 本课绑定的曲目（识谱/写词/编曲课指向 scores.ts 的公版旋律） */
  scoreId?: string;
  /** 依谱写词课的字位提示模板：与曲谱非休止音符逐位对齐（空串 = 不给提示） */
  lyricTemplate?: string[];
  quickCheck?: MusicQuickCheck;
};

/** 作品来源：manual 手改 / auto 规则自动 / ai 辅助生成 */
export type CompositionOrigin = 'manual' | 'auto' | 'ai';

/** 编曲作品（learning_composition 表行；spec 为 music-plan 的 MusicSpec JSON） */
export type Composition = {
  id: string;
  track: MusicTrack;
  title: string;
  spec: Record<string, unknown>;
  score: Score;
  audioUrl?: string;
  origin: CompositionOrigin;
  seed: number;
  createdAt: number;
  updatedAt: number;
};
