// 文本编码自动识别 —— 三端共用（桌面 IPC / Web File System Access / 移动 Capacitor / 服务端 Node）
//
// ★ 为什么必须有（2026-09-27 用户反馈）：
//   「txt 不支持别的中文格式？电脑的软件打开正常啊，这个应用打开乱码？？」
//   根因：所有文本读取路径都**写死 UTF-8** —— Node 侧 `fsp.readFile(p,'utf-8')`、
//   桌面 IPC 同一个口径、浏览器侧 `file.text()`、Capacitor `Encoding.UTF8`、
//   预览面板 `new TextDecoder('utf-8')`。
//   GBK/GB2312 编码的中文 txt（Windows 记事本「ANSI」另存、老程序/老系统导出）
//   一旦用 UTF-8 去解，每个汉字都落到非法序列上变成 U+FFFD 替换符 →
//   满屏「锟斤拷 / 」。而记事本、Word 会自己猜编码，所以「电脑的软件打开正常」。
//
// 识别策略（顺序即优先级，先权威后推断）：
//   ① **BOM 优先**：EF BB BF → utf-8，FF FE → utf-16le，FE FF → utf-16be。
//      有 BOM 就是写入方明确的声明，不需要猜。
//   ② **UTF-8 严格解码（fatal: true）能过 → 判为 UTF-8**。
//      UTF-8 的结构约束很强（多字节序列的起始/后续字节范围受限、禁止过长编码），
//      GBK 的中文字节几乎必然违反它 —— 因此这是一个**可靠判别器**。
//      （实测：GBK「中文测试」8 字节 100% 抛错；UTF-8 中文 100% 通过。）
//   ③ **兜底 GB18030**：它是 GBK / GB2312 的**超集**，且对任意字节流几乎不抛错
//      （实测随机高位字节 300/300 通过），作为「非 UTF-8 的中文」的最终兜底最稳。
//
// ⚠️ 已知局限（不要试图「优化」掉，会把好文件猜坏）：
//   Big5（中国台湾/中国香港）与 GB18030 互相解码**都不抛错**（解出来只是另一种错字），
//   无法用「是否抛错」区分，只能靠人工指定编码。
//   所以这里**不做**启发式打分猜 Big5 —— 那样反而会把正常的 GBK 文件猜成乱码。
//   需要 Big5 时请调用方显式传 encoding。

/**
 * 支持的文本编码（2026-10-21 扩面：用户要求「大部分编码都要支持」）。
 *
 * 三组：
 *   ① Unicode：utf-8 / utf-16le / utf-16be
 *   ② 中日韩多字节：gb18030（GBK/GB2312 超集）/ big5 / shift_jis / euc-jp / euc-kr
 *   ③ 单字节西文：windows-125x / iso-8859-x / koi8 / macintosh / ibm866 / windows-874
 * 这些都走 TextDecoder 解码；编码侧由 `encodeTextBytes` 用「解码器反推表」实现，零第三方依赖。
 */
export type TextEncoding =
  | 'utf-8' | 'utf-16le' | 'utf-16be'
  | 'gb18030' | 'big5' | 'shift_jis' | 'euc-jp' | 'euc-kr'
  | 'windows-874'
  | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1256' | 'windows-1257'
  | 'iso-8859-2' | 'iso-8859-5' | 'iso-8859-7' | 'iso-8859-9' | 'iso-8859-15'
  | 'koi8-r' | 'koi8-u' | 'macintosh' | 'ibm866';

/**
 * 编码别名归一（用户/模型可能写 GBK、ANSI、cp936、sjis、latin1…）。
 * ★ 只做**名字**归一：gbk/gb2312 → gb18030（超集，解出来一致）。
 */
const ENCODING_ALIASES: Record<string, TextEncoding> = {
  'utf-8': 'utf-8', utf8: 'utf-8', 'utf8-bom': 'utf-8',
  'utf-16': 'utf-16le', 'utf-16le': 'utf-16le', utf16le: 'utf-16le',
  'utf-16be': 'utf-16be', utf16be: 'utf-16be',
  gb18030: 'gb18030', gbk: 'gb18030', gb2312: 'gb18030', 'gb-2312': 'gb18030', cp936: 'gb18030', ansi: 'gb18030',
  big5: 'big5', 'big-5': 'big5', 'big5-hkscs': 'big5', cp950: 'big5',
  'shift_jis': 'shift_jis', shiftjis: 'shift_jis', sjis: 'shift_jis', cp932: 'shift_jis', 'windows-31j': 'shift_jis',
  'euc-jp': 'euc-jp', eucjp: 'euc-jp',
  'euc-kr': 'euc-kr', euckr: 'euc-kr', cp949: 'euc-kr',
  'windows-874': 'windows-874', cp874: 'windows-874',
  'windows-1250': 'windows-1250', cp1250: 'windows-1250',
  'windows-1251': 'windows-1251', cp1251: 'windows-1251',
  'windows-1252': 'windows-1252', cp1252: 'windows-1252', latin1: 'windows-1252', 'latin-1': 'windows-1252',
  'windows-1253': 'windows-1253', cp1253: 'windows-1253',
  'windows-1254': 'windows-1254', cp1254: 'windows-1254',
  'windows-1256': 'windows-1256', cp1256: 'windows-1256',
  'windows-1257': 'windows-1257', cp1257: 'windows-1257',
  'iso-8859-1': 'windows-1252', // Latin-1 的 Windows 变体（0x80-0x9F 有字形）；解 ASCII/西欧文本等价
  'iso-8859-2': 'iso-8859-2', 'iso-8859-5': 'iso-8859-5', 'iso-8859-7': 'iso-8859-7',
  'iso-8859-9': 'iso-8859-9', 'iso-8859-15': 'iso-8859-15',
  'koi8-r': 'koi8-r', 'koi8-u': 'koi8-u', macintosh: 'macintosh', mac: 'macintosh', ibm866: 'ibm866', cp866: 'ibm866',
};

/** 把任意写法归一成受支持的编码名；不认识返回 null */
export function resolveEncodingName(name: string): TextEncoding | null {
  const key = String(name || '').trim().toLowerCase().replace(/[_\s]/g, '-');
  if (!key) return null;
  const direct = ENCODING_ALIASES[key];
  if (direct) return direct;
  // 「utf-8」被 replace 成 utf-8 之外，处理 shift_jis → shift-jis 之类
  const alt = ENCODING_ALIASES[key.replace(/-/g, '_')];
  return alt ?? null;
}

/** 所有受支持的编码（供界面下拉 / 单测遍历） */
export const SUPPORTED_ENCODINGS: readonly TextEncoding[] = Object.freeze(
  [...new Set(Object.values(ENCODING_ALIASES))],
);

/** 解码结果：文本 + 实际判定的编码（编码用于界面如实告知用户，别偷偷改了还不说） */
export interface DecodedText {
  text: string;
  /** 实际判定出的编码 */
  encoding: TextEncoding;
  /**
   * 原文件带 BOM 时记录其编码族（写回时据此补回 BOM）。
   * ★ 为什么需要（2026-10-21 实报）：只识别编码不识别 BOM，读进来再写回去
   *   「UTF-8 BOM 文件」会被写成无 BOM，「UTF-16」甚至会被写成 UTF-8 ——
   *   用户的文件被悄悄换了编码，下游工具（老编译器/Excel/记事本）立刻乱码。
   */
  bom?: TextEncoding;
}

/** 判定为二进制的控制符占比阈值（见 looksBinaryBytes） */
const CONTROL_RATIO_MAX = 0.05;

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * 探测某编码在本环境是否可用（服务端精简 ICU 构建、老 WebView 都可能缺 gb18030）。
 * 只探测一次并缓存 —— 避免每个文件都白白抛一次 RangeError。
 */
const supportCache = new Map<string, boolean>();
function isEncodingSupported(encoding: string): boolean {
  const hit = supportCache.get(encoding);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    // 构造本身就会在编码名不被识别时抛 RangeError
    new TextDecoder(encoding);
    ok = true;
  } catch {
    ok = false;
  }
  supportCache.set(encoding, ok);
  return ok;
}

/** 严格解码：任何非法字节序列都抛错，返回 null 表示「这些字节不是该编码」 */
function tryDecodeStrict(encoding: string, bytes: Uint8Array): string | null {
  if (!isEncodingSupported(encoding)) return null;
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 宽松解码：非法序列替换为 U+FFFD，绝不抛错（最终兜底用） */
function decodeLenient(encoding: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * 自动识别的候选集（2026-10-21 扩面）。
 *
 * ★ 为什么需要打分而不是「谁先解成功算谁」（原实现）：GB18030 对任意字节流几乎都不抛错，
 *   于是 Big5 / Shift_JIS / EUC-KR 的中文日文韩文文件**永远**被判成 GBK（解出来是鬼画符），
 *   而文件本身能正常显示在用户的编辑器里 —— 用户看到的就是"这个应用不支持我的编码"。
 *   打分的判据来自**文字特征**（假名/谚文/常用汉字/西里尔/带音标拉丁），
 *   而不是"能不能解" —— 因为后者对 8-bit 编码没有判别力。
 *   GB18030 放第一位：平手优先判 GBK（现有用户的绝大多数中文文件是 GBK/GB2312）。
 */
const DETECT_CANDIDATES: readonly TextEncoding[] = [
  // 顺序即平手时的优先级：GBK/中文优先，然后日韩、西欧，再西里尔/希腊/阿拉伯
  'gb18030', 'big5', 'shift_jis', 'euc-jp', 'euc-kr', 'windows-1252',
  'iso-8859-15', 'iso-8859-2', 'koi8-r', 'koi8-u', 'windows-1251', 'iso-8859-5', 'ibm866',
  'iso-8859-7', 'windows-1253', 'windows-1256', 'windows-1250', 'windows-1254', 'windows-1257', 'windows-874',
];

/** 简繁共有的高频字 + 简繁各自的特征字（只用于区分"正常文字"与"鬼画符"） */
const COMMON_CJK = new Set(
  [...(
    // 现代汉语高频字（覆盖日常代码/文档/报错文案的绝大部分）
    '的一是在不了有和人这這个個们們说說时時对對开開关關么麼为為与與儿兒头頭来來去去年月日中文测试測試' +
    '我你他她它想要会能可以没没有好很多少大小上下前后面里外中东西南北' +
    '工作文件目录路径代码程序运行错误失败成功检查输出输入保存读取写入删除修改添加' +
    '因为所以但是如果然后现在之前之后已经还是就是可能应该需要必须进行使用处理显示' +
    '问题结果数据信息系统服务网络请求响应接口参数配置环境版本更新安装启动停止' +
    '命令执行完成开始结束时间日期名称地址端口连接断开登录注册用户权限密码' +
    '部分全部一些每个其他以及或者并且就是可以能够不会不是没有一样什么怎么为什么' +
    '我们他们大家自己别人东西时候地方情况方法方式原因结果目的意义作用价值' +
    '现在过去将来今天明天昨天今年明年去年上午下午晚上早上中午' +
    '电脑手机软件硬件浏览器页面按钮菜单选项窗口图标图片视频音频文档表格' +
    '请谢谢对不起没关系您好再见注意小心重要严重警告提示建议意见' +
    '这那個個們說時對開關麼為與兒頭來電車東馬鳥龍學國會後發現點樣還這麼' +
    '繁體檔測試錯誤資訊網路系統使用者權限密碼連線開啟關閉儲存讀取寫入刪除修改'
  )],
);

/**
 * 日文常用汉字（与中文常用字表互补）。
 * ★ 为什么需要：日文被 GBK 误读时，汉字会变成「泣塑胳矢机冉年澄千」这类生僻字；
 *   而正确解读「日本語文字判定確認」里的 語/判/定/確/認 不在中文常用字表里 ——
 *   只按中文高频字打分，两边都"看起来不常用"，判别力就没了。
 */
const JA_COMMON = new Set([...'日本語文字判定確認情報設定表示実行結果選択開始終了時間処理説明画面機能状態変更追加削除読込書込保存更新検査対象範囲内外出力入力値']);

/** 仅繁体/仅简体特征字（用于区分同字节流下的 Big5 与 GBK，两者结构都合法无法靠"能否解"判别） */
const TRAD_ONLY = new Set([...'這個們說時對開關麼為與兒頭來電車東馬鳥龍學國會後發現點樣還這麼']);
const SIMP_ONLY = new Set([...'这个们说时对开关么为与儿头来电车东马鸟龙学国会后发现点样还这么']);

/** 俄文高频字母（西里尔系编码互相解错时，只有正确编码能解出这些高频字） */
const RU_COMMON = new Set([...'оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъё']);

/**
 * 俄文字母频率（近似标准频率）。
 *
 * ★ 为什么用**频率余弦相似度**而不是"常见双字组计数"：koi8-r / windows-1251 /
 *   iso-8859-5 / ibm866 互为置换（同样的字节换个映射还是西里尔字母），
 *   错误解码出来的仍是一串"看起来像俄文"的字 —— 单字高频占比区分不开（实测两边都 ~0.8），
 *   双字组在短文本上又太稀疏。而**字母频率分布**是俄文最稳定的指纹：
 *   正确解码的分布会与标准频率高度重合，错误解码则明显偏离。
 */
const RU_FREQ: Record<string, number> = {
  о: 0.1097, е: 0.0845, а: 0.0801, и: 0.0735, н: 0.0670, т: 0.0626, с: 0.0547, р: 0.0473,
  в: 0.0454, л: 0.0440, к: 0.0349, м: 0.0321, д: 0.0298, п: 0.0281, у: 0.0262, я: 0.0201,
  ы: 0.0190, ь: 0.0174, г: 0.0170, з: 0.0165, б: 0.0159, ч: 0.0144, й: 0.0121, х: 0.0097,
  ж: 0.0094, ш: 0.0073, ю: 0.0064, ц: 0.0048, щ: 0.0036, э: 0.0032, ф: 0.0026, ъ: 0.0004, ё: 0.0004,
};

/** 文本的西里尔字母分布与标准俄文频率的余弦相似度（0..1） */
function ruFrequencySimilarity(text: string): number {
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of text.toLowerCase()) {
    if (RU_FREQ[ch] === undefined) continue;
    counts.set(ch, (counts.get(ch) || 0) + 1);
    letters += 1;
  }
  if (letters < 8) return 0;
  let dot = 0;
  let norm = 0;
  for (const [ch, f] of Object.entries(RU_FREQ)) {
    const observed = (counts.get(ch) || 0) / letters;
    dot += observed * f;
    norm += f * f;
  }
  let obsNorm = 0;
  for (const [, n] of counts) {
    const observed = n / letters;
    obsNorm += observed * observed;
  }
  if (norm === 0 || obsNorm === 0) return 0;
  return dot / Math.sqrt(norm * obsNorm);
}

/** 一段文本的"文字特征"统计 */
function scriptStats(text: string): {
  total: number; cjk: number; common: number; trad: number; simp: number;
  kana: number; hangul: number; bad: number;
  cyrillic: number; cyrillicCommon: number; latinAscii: number; latinAccent: number;
} {
  let total = 0, cjk = 0, common = 0, trad = 0, simp = 0, kana = 0, hangul = 0, bad = 0;
  let cyrillic = 0, cyrillicCommon = 0, latinAscii = 0, latinAccent = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 9 || cp === 10 || cp === 13 || cp === 32) continue;
    total += 1;
    if (cp === 0xfffd) { bad += 1; continue; }
    if (cp >= 0x3040 && cp <= 0x30ff) { kana += 1; continue; }
    if (cp >= 0xac00 && cp <= 0xd7af) { hangul += 1; continue; }
    if (cp >= 0x4e00 && cp <= 0x9fff) {
      cjk += 1;
      if (COMMON_CJK.has(ch) || JA_COMMON.has(ch)) common += 1;
      if (TRAD_ONLY.has(ch)) trad += 1;
      if (SIMP_ONLY.has(ch)) simp += 1;
      continue;
    }
    if (cp >= 0x0400 && cp <= 0x04ff) {
      cyrillic += 1;
      if (RU_COMMON.has(ch.toLowerCase())) cyrillicCommon += 1;
      continue;
    }
    if (cp >= 0x00c0 && cp <= 0x024f) { latinAccent += 1; continue; }
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) { latinAscii += 1; continue; }
    if (cp >= 0xe000 && cp <= 0xf8ff) bad += 1; // 私用区：几乎必然是解错了
  }
  return { total, cjk, common, trad, simp, kana, hangul, bad, cyrillic, cyrillicCommon, latinAscii, latinAccent };
}

/**
 * 候选编码的"像正常文本"总分（只在 GB 系编码严格解不动时使用）。
 *
 * ★ 判据是**文字家族纯度 + 该家族的语言特征**，不是单纯"能解":
 *   西里尔系的 koi8-r / windows-1251 / iso-8859-5 / ibm866 互相都能解出西里尔字母
 *   （全是一堆"看起来像俄文"的字），只能靠**俄文高频字母占比**区分谁是对的。
 */
function familyScore(st: ReturnType<typeof scriptStats>, text: string): number {
  const t = st.total || 1;
  const latin = (st.latinAscii + st.latinAccent) / t;
  const purity = Math.max(st.kana / t, st.hangul / t, st.cjk / t, st.cyrillic / t, latin);
  let score = purity * 200;

  if (st.cyrillic / t >= 0.4) {
    // 正确解出的俄文：高频字母占比通常 > 0.5；解错的编码只有 0.2~0.4
    score += st.cyrillicCommon / Math.max(1, st.cyrillic) >= 0.45 ? 150 : 0;
    // 字母频率分布与俄文标准频率的相似度（正确解码 ≈0.95+，错误解码 ≈0.6~0.8）
    score += ruFrequencySimilarity(text) * 120;
  }
  if (st.cjk / t >= 0.4) score += (st.common / Math.max(1, st.cjk)) * 120;
  // 一堆生僻汉字 = 解错了（EU C-JP 被 GBK 解时会保留假名，但汉字全变生僻字，
  // 只靠"假名占比"分不出来 —— 必须额外惩罚生僻字）
  if (st.cjk >= 3 && st.common / Math.max(1, st.cjk) < 0.2) score -= 60;
  // 繁体特征字成串出现 = Big5 解对的标志（GBK 解同一段字节只会得到生僻字）
  if (st.trad >= 3 && st.trad > st.simp) score += 40;
  if (st.kana / t >= 0.2) {
    score += 120;
    // 假名 + 成串"正常汉字" = 真日文；被 GBK 误读的日文只有假名对、汉字全是生僻字
    if (st.common / Math.max(1, st.cjk) >= 0.5) score += 60;
  }
  if (st.hangul / t >= 0.2) score += 120;
  score -= (st.bad / t) * 300;
  return score;
}

/**
 * 无 BOM 的 UTF-16 探测：ASCII 内容在 UTF-16 里呈现「字母,0,字母,0」的交替 0 模式。
 *
 * ★ 为什么需要（2026-10-21 用户追问「要有自动识别能力啊」）：记事本"Unicode"存盘会带 BOM，
 *   但不少老工具/导出程序写的是**无 BOM 的 UTF-16** —— 这类文件此前一律被当成二进制拒绝打开。
 *   判据用**位置分布**而不是"含 NUL"：UTF-16LE 的 0 集中在奇数位、BE 集中在偶数位，
 *   二进制（png/exe）的 0 位置随机，两个比例不会一边 30%+ 一边 <5%。
 */
function detectUtf16WithoutBom(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 1024) & ~1;
  if (n < 8) return null;
  let zeroEven = 0;
  let zeroOdd = 0;
  const pairs = n / 2;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) zeroEven += 1;
    if (bytes[i + 1] === 0) zeroOdd += 1;
  }
  const rEven = zeroEven / pairs;
  const rOdd = zeroOdd / pairs;
  // ★ 端序别写反（2026-10-21 实测踩到）：UTF-16LE 的 ASCII 'a' 是 `61 00`，
  //   高字节 0 落在**奇数位**；UTF-16BE 是 `00 61`，0 落在**偶数位**。
  if (rOdd >= 0.3 && rEven <= 0.05) return 'utf-16le';
  if (rEven >= 0.3 && rOdd <= 0.05) return 'utf-16be';
  return null;
}

/** 取样本（判语言用前 16KB 足够；整文件解码仍用判定结果） */
const DETECT_SAMPLE_BYTES = 16 * 1024;

/**
 * 传统 8-bit / 多字节编码的自动识别。
 *
 * ★ 判别难点：GBK / Big5 / Shift_JIS / EUC-KR 的字节结构高度重叠（双字节、高位 lead），
 *   **同一段字节在四种编码下都"能解成功"**，靠"能否解码"永远分不出来。
 *   本实现用两道硬信号，其余一律以 GB18030 为基准（中文用户的主流编码，且是既有行为）：
 *     A) **文字特征**：日文假名占比 ≥30%、韩文谚文占比 ≥30%、或繁体特征字明显多于简体
 *        → 才认为"这不是 GBK，是日/韩/繁体中文"；
 *     B) GB18030 **严格解码失败**（说明字节根本不是 GB 系）→ 在候选集里按"像不像正常文本"打分。
 *   ★ 为什么不直接按分数取最大：实测 GBK 文本「中文构建完成」被 EUC-KR 解成谚文，
 *     单看分数会判错 —— 必须用"基准 + 明确反证"的结构，否则只是把误判换个方向。
 */
function detectLegacyEncoding(sample: Uint8Array): { encoding: TextEncoding; score: number } | null {
  const gbStrict = tryDecodeStrict('gb18030', sample);

  if (gbStrict !== null) {
    const gb = scriptStats(gbStrict);
    const ratio = (n: number) => (gb.total ? n / gb.total : 0);
    /**
     * GBK 解读结果像不像"鬼画符"：替换符/私用区，或汉字里几乎没有高频字。
     * ★ 必须加这道闸：实测 GBK「中文测试 完成」被 EUC-KR 解出 2 个谚文（占 33%），
     *   只看比例就会把正常中文判成韩文 —— 而 GBK 解读本身明显是通顺中文（高频字 4/6）。
     */
    const gbIsGarbage = gb.bad > 0
      || (gb.cjk >= 3 && gb.common / gb.cjk < 0.15)
      // GBK 文本里成片冒出日文假名 → 多半是日文被当成 GBK 解了（中文正文只会偶尔夹一两个）
      || (gb.kana >= 3 && gb.kana / gb.total >= 0.2);

    // GBK 解读通顺 → 就是 GBK（不做任何"更聪明"的改判）
    if (!gbIsGarbage) return { encoding: 'gb18030', score: 50 };

    // GBK 解读像鬼画符 → 让其它候选按「文字家族纯度 + 语言特征」竞争，且必须明显更好才改判
    const gbScore = familyScore(gb, gbStrict);
    let bestAlt: { encoding: TextEncoding; score: number } | null = null;
    for (const enc of ['shift_jis', 'euc-jp', 'euc-kr', 'big5', 'windows-1252'] as TextEncoding[]) {
      if (!isEncodingSupported(enc)) continue;
      const altText = decodeLenient(enc, sample);
      const st = scriptStats(altText);
      if (st.total && st.bad / st.total > 0.02) continue; // 替换符太多 → 不是该编码
      const sc = familyScore(st, altText);
      if (!bestAlt || sc > bestAlt.score) bestAlt = { encoding: enc, score: sc };
    }
    // 门槛 +40：只有 GBK 解读已被判定为"鬼画符"时才走到这里，故不需要很高的门槛；
    // 门槛太高会把日文/韩文/繁体文件留在 GBK 的错误解读上（实测 shift_jis 需要 ≤+53）。
    if (bestAlt && bestAlt.score >= gbScore + 40) return bestAlt;
    return { encoding: 'gb18030', score: gbScore };
  }

  // B) 不是 GB 系（GB18030 严格解不动）→ 在候选里按"文字家族 + 语言特征"挑
  let best: { encoding: TextEncoding; score: number } | null = null;
  for (const enc of DETECT_CANDIDATES) {
    if (enc === 'gb18030' || !isEncodingSupported(enc)) continue;
    const text = decodeLenient(enc, sample);
    const st = scriptStats(text);
    if (st.total && st.bad / st.total > 0.02) continue; // 替换符太多 → 不是该编码
    const score = familyScore(st, text);
    if (!best || score > best.score) best = { encoding: enc, score };
  }
  return best;
}

/**
 * 把字节流解码成文本，自动识别编码并返回判定结果。
 *
 * 顺序：BOM → 严格 UTF-8 → 候选打分（GBK/Big5/Shift_JIS/EUC-JP/EUC-KR/windows-1252）
 *       → GB18030 严格兜底 → 宽松 UTF-8。
 *
 * 调用方拿到 `encoding` 后应告知用户（例如预览面板显示「GBK」徽标），
 * 否则用户改完保存、文件编码被换了会莫名其妙。
 */
export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (!bytes.length) return { text: '', encoding: 'utf-8' };

  // ① BOM 是写入方的显式声明，最高优先级
  if (startsWith(bytes, UTF16LE_BOM)) {
    return { text: decodeLenient('utf-16le', bytes.subarray(2)), encoding: 'utf-16le', bom: 'utf-16le' };
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return { text: decodeLenient('utf-16be', bytes.subarray(2)), encoding: 'utf-16be', bom: 'utf-16be' };
  }
  if (startsWith(bytes, UTF8_BOM)) {
    return { text: decodeLenient('utf-8', bytes.subarray(3)), encoding: 'utf-8', bom: 'utf-8' };
  }

  // ①' 无 BOM 的 UTF-16：必须在"严格 UTF-8"之前判 —— 它的字节（字母 + 0x00）本身就是合法
  //    UTF-8（NUL 是合法码点），按 UTF-8 解会得到一串夹着 NUL 的怪文本。
  const utf16NoBom = detectUtf16WithoutBom(bytes);
  if (utf16NoBom) {
    return { text: decodeLenient(utf16NoBom, bytes), encoding: utf16NoBom };
  }

  // ② 严格 UTF-8 能过 → 就是 UTF-8（判别力强，见文件头说明）
  const utf8 = tryDecodeStrict('utf-8', bytes);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };

  // ③ 候选打分（判语言特征，而不是"能不能解"）
  const sample = bytes.length > DETECT_SAMPLE_BYTES ? bytes.subarray(0, DETECT_SAMPLE_BYTES) : bytes;
  const picked = detectLegacyEncoding(sample);
  if (picked) {
    return { text: decodeLenient(picked.encoding, bytes), encoding: picked.encoding };
  }

  // ④ 兜底 GB18030（GBK/GB2312 超集）
  const gb = tryDecodeStrict('gb18030', bytes);
  if (gb !== null) return { text: gb, encoding: 'gb18030' };

  // ⑤ 极端环境（无 gb18030 解码器）：宽松 UTF-8，至少不抛错
  return { text: decodeLenient('utf-8', bytes), encoding: 'utf-8' };
}

/**
 * 按**指定编码**解码（调用方明确知道编码时用，例如 file_read 的 encoding 参数）。
 * 返回 null 表示不支持该编码名，调用方应回落自动识别。
 */
export function decodeTextBytesAs(bytes: Uint8Array, encoding: string): string | null {
  const target = resolveEncodingName(encoding);
  if (!target) return null;
  if (!isEncodingSupported(target)) return null;
  return decodeLenient(target, bytes);
}

/**
 * 二进制判定（供「扩展名白名单外也试着当文本读」的分支使用）。
 *
 * ★ 为什么必须单独判，不能沿用旧写法（2026-09-27 引入自动编码后新增）：
 *   旧代码靠「UTF-8 解码产生多少 U+FFFD 替换符」判二进制。
 *   但自动识别改成 GB18030 兜底后，**任意字节流几乎都能被 GB18030 解成功**
 *   （实测随机高位字节 300/300 不抛错）→ U+FFFD 变 0 → 所有二进制文件
 *   都会被当成「GBK 文本」显示一堆乱字。
 *   所以这里改从**字节本身**判：NUL 字节、或解出大量不可打印控制符。
 */
export function looksBinaryBytes(bytes: Uint8Array, sampleSize = 8000): boolean {
  if (!bytes.length) return false;
  const n = Math.min(bytes.length, sampleSize);
  const head = bytes.subarray(0, n);

  // ⓪ BOM 已声明是 Unicode 文本 → 直接放行。
  //   ★ 为什么必须放在 NUL 判据之前：UTF-16 的高字节天然全是 0x00，
  //     按"NUL = 二进制"会把这整类文本文件判死（实测 UTF-16LE 记事本存盘文件被编辑器拒开）。
  if (startsWith(head, UTF8_BOM) || startsWith(head, UTF16LE_BOM) || startsWith(head, UTF16BE_BOM)) {
    return false;
  }
  // ⓪' 无 BOM 的 UTF-16 同理（位置分布判据，不会把 png/exe 误判成文本）
  if (detectUtf16WithoutBom(head)) return false;

  // ① NUL 字节是二进制最可靠的信号（合法文本文件不含 NUL）。
  //    实测：png/jpg/ico/icns/exe 都在前 9 字节内出现 NUL。
  for (let i = 0; i < n; i += 1) {
    if (head[i] === 0) return true;
  }

  // ② 取文本：严格 UTF-8 优先，否则 GB18030，最后宽松兜底
  const strictUtf8 = tryDecodeStrict('utf-8', head);
  const text = strictUtf8 ?? tryDecodeStrict('gb18030', head) ?? decodeLenient('gb18030', head);
  if (!text.length) return false;

  // ③ 控制符占比过高 → 二进制。
  //    ★ 这一步必须**在所有解码尝试之后**无条件执行：
  //    纯控制字节（如 0x01 填充）本身是合法 UTF-8/ASCII，若因「UTF-8 能过」就提前
  //    返回"文本"，这类数据会被当成文本渲染（本函数初版就踩了这个坑）。
  let control = 0;
  const limit = Math.min(text.length, sampleSize);
  for (let i = 0; i < limit; i += 1) {
    const c = text.charCodeAt(i);
    // 允许 \t(9) \n(10) \r(13)；其余 C0/C1 控制符、替换符、零宽字符都算「不像文本」
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xfffd || c === 0x200b) control += 1;
  }
  return control / limit > CONTROL_RATIO_MAX;
}

/**
 * base64 → 字节。
 *
 * ★ 这里刻意不写 `Buffer.from(...)` 的字面量：packages/shared 不依赖 @types/node
 *   （面向三端 + 浏览器），直接引用 Buffer 会 TS2580。改从 globalThis 上探测，
 *   既避免类型依赖，也不影响三端任一环境的行为（浏览器走 atob）。
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bufCtor = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  const bin = typeof atob === 'function'
    ? atob(b64)
    : (bufCtor ? bufCtor.from(b64, 'base64').toString('binary') : '');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 编码的展示名（给界面用）。GB 系统一显示 GB18030 会更让人困惑，
 * 因为用户手上的文件自称 GBK/ANSI —— 这里显示更贴近用户认知的写法。
 */
export function encodingLabel(encoding: TextEncoding): string {
  switch (encoding) {
    case 'gb18030': return 'GBK';
    case 'big5': return 'Big5';
    case 'shift_jis': return 'Shift_JIS';
    case 'euc-jp': return 'EUC-JP';
    case 'euc-kr': return 'EUC-KR';
    case 'utf-16le': return 'UTF-16 LE';
    case 'utf-16be': return 'UTF-16 BE';
    case 'windows-1250': return 'Windows-1250';
    case 'windows-1251': return 'Windows-1251';
    case 'windows-1252': return 'Windows-1252';
    case 'windows-1253': return 'Windows-1253';
    case 'windows-1254': return 'Windows-1254';
    case 'windows-1256': return 'Windows-1256';
    case 'windows-1257': return 'Windows-1257';
    case 'windows-874': return 'Windows-874';
    case 'iso-8859-2': return 'ISO-8859-2';
    case 'iso-8859-5': return 'ISO-8859-5';
    case 'iso-8859-7': return 'ISO-8859-7';
    case 'iso-8859-9': return 'ISO-8859-9';
    case 'iso-8859-15': return 'ISO-8859-15';
    case 'koi8-r': return 'KOI8-R';
    case 'koi8-u': return 'KOI8-U';
    case 'macintosh': return 'Mac Roman';
    case 'ibm866': return 'IBM866';
    default: return 'UTF-8';
  }
}
// ────────────────────────────────────────────────────────────────────────────
// 编码（写回）—— 与上面的识别配套，保证「读进来是什么编码，写回去还是什么编码」
//
// ★★★ 为什么必须有（2026-10-21 用户实报）：「默认都 utf-8？gbk 也要支持啊，修改文件肯定
//   要根据文件编码类型啊」。此前**只有解码侧做了识别**，写入侧（服务端 fs.writeFile）写死
//   'utf8' —— 于是模型改一个 GBK/ANSI 的 .bat / .txt，整个文件被悄悄转成 UTF-8：
//   老程序、cmd.exe、记事本（ANSI 模式）立刻满屏乱码，用户完全不知道为什么「越改越坏」。
//   ⇒ encodeTextBytes 是 decodeTextBytes 的逆运算，按探测结果原样写回。
// ────────────────────────────────────────────────────────────────────────────

/** 每编码的反向表缓存：码点 → 字节序列（惰性构建，见 buildReverseTable） */
const reverseTables = new Map<TextEncoding, Map<number, number[]>>();

/** 双字节编码族（需要扫 lead×trail 组合；单字节编码只扫 0x80-0xFF） */
const DBCS_ENCODINGS = new Set<TextEncoding>(['gb18030', 'big5', 'shift_jis', 'euc-jp', 'euc-kr']);

/**
 * 构建「码点 → 字节」反向表（约 2.4 万条/编码，构建一次几十毫秒，之后走缓存）。
 *
 * ★ 为什么用 TextDecoder 反推而不是内置码表：运行环境只有解码器（TextDecoder），
 *   没有编码器；逐字节对试解即可反推，且与运行环境的实现**永远一致** ——
 *   抄一份码表反而会在不同 ICU 版本上偏。
 * ★ 单字节区必须扫：Shift_JIS 的半角假名、西欧编码的 é/ñ 都在 0x80-0xFF 单字节上。
 */
function buildReverseTable(enc: TextEncoding): Map<number, number[]> {
  const cached = reverseTables.get(enc);
  if (cached) return cached;
  const table = new Map<number, number[]>();
  if (!isEncodingSupported(enc) || enc === 'utf-8' || enc === 'utf-16le' || enc === 'utf-16be') {
    reverseTables.set(enc, table);
    return table;
  }
  const dec = new TextDecoder(enc);

  const put = (bytes: number[]) => {
    const s = dec.decode(Uint8Array.from(bytes));
    if (s.length === 1 && s.charCodeAt(0) !== 0xfffd && !table.has(s.charCodeAt(0))) {
      table.set(s.charCodeAt(0), bytes);
    }
  };

  // ① 单字节区
  for (let b = 0x80; b <= 0xff; b += 1) put([b]);

  // ② 双字节区（仅 DBCS 编码族）
  if (DBCS_ENCODINGS.has(enc)) {
    const pair = new Uint8Array(2);
    for (let lead = 0x81; lead <= 0xfe; lead += 1) {
      for (let trail = 0x40; trail <= 0xfe; trail += 1) {
        if (trail === 0x7f) continue;
        pair[0] = lead;
        pair[1] = trail;
        const s = dec.decode(pair);
        if (s.length === 1 && s.charCodeAt(0) !== 0xfffd) {
          const cp = s.charCodeAt(0);
          if (!table.has(cp)) table.set(cp, [lead, trail]);
        }
      }
    }
  }

  reverseTables.set(enc, table);
  return table;
}

/** 把文本按指定编码写成字节流；[withBom] 为 true 时补回对应 BOM（仅 Unicode 编码有意义） */
export function encodeTextBytes(
  text: string,
  encoding: TextEncoding = 'utf-8',
  opts?: { withBom?: boolean },
): Uint8Array {
  const source = String(text ?? '');
  const withBom = opts?.withBom === true;

  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const body = new Uint8Array(source.length * 2);
    for (let i = 0; i < source.length; i += 1) {
      const code = source.charCodeAt(i);
      const hi = (code >> 8) & 0xff;
      const lo = code & 0xff;
      if (encoding === 'utf-16le') {
        body[i * 2] = lo;
        body[i * 2 + 1] = hi;
      } else {
        body[i * 2] = hi;
        body[i * 2 + 1] = lo;
      }
    }
    const bomBytes = encoding === 'utf-16le' ? UTF16LE_BOM : UTF16BE_BOM;
    return withBom ? concatBytes([Uint8Array.from(bomBytes), body]) : body;
  }

  if (encoding === 'utf-8') {
    const body = new TextEncoder().encode(source);
    return withBom ? concatBytes([Uint8Array.from(UTF8_BOM), body]) : body;
  }

  // ③ 传统 8-bit / 双字节编码：查反向表；表里没有的字符（emoji、生僻字、目标编码不覆盖的字）
  //    只能落 '?'。与其把整份文件转成 UTF-8 让所有老工具乱码，不如单字符降级。
  const table = buildReverseTable(encoding);
  const out: number[] = [];
  for (const ch of source) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) { out.push(cp); continue; }
    const bytes = table.get(cp);
    if (bytes) out.push(...bytes);
    else out.push(0x3f);
  }
  return Uint8Array.from(out);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
