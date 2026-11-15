// 周易文库 · 精选集静态数据（供文库页使用；与课程内容包同一防编造纪律）。
// ★ excerptLines 分两档：
//   ① 逐字引文：只用高置信公版素材，一字不改，note 注明「逐字引文」；
//   ② 篇名与提要：编者自撰的叙录性文字，note 注明「编者提要，未录原文」。
//   现代点校本、今人译注、出土文献释文一律 license='仅书目'。
export type ZhouyiCanonWork = {
  id: string;
  title: string;
  author?: string;
  dynasty: string;
  category: '经' | '传' | '注' | '术数' | '外缘';
  license: '公版' | '仅书目';
  excerptLines: Array<{ text: string; note?: string }>;
};

export const ZHOUYI_CANON_WORKS: ZhouyiCanonWork[] = [
  {
    id: 'canon_zhouyi_jing',
    title: '周易（经文上下篇）',
    dynasty: '西周至春秋（通行说）',
    category: '经',
    license: '公版',
    excerptLines: [
      {
        text: '《周易》经文分上下两篇：上篇三十卦，下篇三十四卦，合六十四卦、三百八十六爻（含乾用九、坤用六），卦爻辞为占筮系辞。',
        note: '编者提要，未录原文；经文逐字引文见各精读课原文层。',
      },
    ],
  },
  {
    id: 'canon_zhouyi_yizhuan',
    title: '周易·易传（十翼节录）',
    dynasty: '战国至汉初（通行说）',
    category: '传',
    license: '公版',
    excerptLines: [
      {
        text: '易有太极，是生两仪，两仪生四象，四象生八卦。',
        note: '《系辞上》逐字引文（公版，通行十三经注疏本）。',
      },
      {
        text: '有天地，然后万物生焉。盈天地之间者唯万物，故受之以屯。',
        note: '《序卦传》开篇逐字引文（公版，通行十三经注疏本）。',
      },
      {
        text: '《易传》七种十篇：彖、象、系辞各分上下，加文言、说卦、序卦、杂卦，合称十翼，是解释经文的最早成体系文献。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_zhouyi_zhengyi',
    title: '周易正义',
    author: '孔颖达等奉敕撰',
    dynasty: '唐',
    category: '注',
    license: '公版',
    excerptLines: [
      {
        text: '《周易正义》为唐初官修《易》注疏解本，疏解王弼、韩康伯之注；其卷首论卦序「二二相耦，非覆即变」之规律，为后世分析序卦之基础。',
        note: '编者提要，未录原文；通行十三经注疏本所收即此书。',
      },
    ],
  },
  {
    id: 'canon_zhouyi_jijie',
    title: '周易集解',
    author: '李鼎祚辑',
    dynasty: '唐',
    category: '注',
    license: '公版',
    excerptLines: [
      {
        text: '《周易集解》为唐李鼎祚所辑汉魏以降三十余家易注之总集，虞翻、荀爽诸家旧说多赖以存留，是汉代象数易最重要的汇存文献。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_yichuan_yizhuan',
    title: '伊川易传',
    author: '程颐撰',
    dynasty: '宋',
    category: '注',
    license: '公版',
    excerptLines: [
      {
        text: '《伊川易传》为程颐晚年居伊川所撰易注，又称《程氏易传》；以儒理说易，是宋明义理易学的奠基之作。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_zhouyi_benyi',
    title: '周易本义',
    author: '朱熹撰',
    dynasty: '宋',
    category: '注',
    license: '公版',
    excerptLines: [
      {
        text: '《周易本义》为朱熹易注，以「易本卜筮之书」为立场，欲复原经文占筮本旨而后言义理，与程传立场判然有别，可对读。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_jingshi_yizhuan',
    title: '京氏易传',
    author: '旧题京房撰',
    dynasty: '汉',
    category: '注',
    license: '公版',
    excerptLines: [
      {
        text: '《京氏易传》旧题西汉京房撰，以八宫、纳甲、世应、飞伏说易，是汉代象数易的代表文献；传本经后人增改，读时注意辨析。',
        note: '编者提要，未录原文；作者署名与文本年代须以「旧题」待之。',
      },
    ],
  },
  {
    id: 'canon_jiaoshi_yilin',
    title: '焦氏易林',
    author: '旧题焦延寿撰',
    dynasty: '汉',
    category: '术数',
    license: '公版',
    excerptLines: [
      {
        text: '《焦氏易林》旧题西汉焦延寿撰，依六十四卦变为四千零九十六繇，每繇为韵语以占验吉凶，兼具文学价值；作者归属另有异说，读时并存。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_meihua_yishu',
    title: '梅花易数',
    author: '托名邵雍',
    dynasty: '旧题宋（实为后人编纂）',
    category: '术数',
    license: '公版',
    excerptLines: [
      {
        text: '《梅花易数》托名北宋邵雍，实为后人编纂；以起卦、体用生克、三要十应等法占断，是明清以来流传最广的易占入门书之一。',
        note: '编者提要，未录原文；本课程对其规则只作教学演示，不构成任何现实预测服务。',
      },
    ],
  },
  {
    id: 'canon_bushi_zhengzong',
    title: '卜筮正宗',
    author: '王洪绪（维德）撰',
    dynasty: '清',
    category: '术数',
    license: '公版',
    excerptLines: [
      {
        text: '《卜筮正宗》为清王洪绪（维德）所撰六爻纳甲筮法汇编，体例整饬，是六爻文献的通行读本；其断例属术数规则，仅作文献研究对象。',
        note: '编者提要，未录原文。',
      },
    ],
  },
  {
    id: 'canon_hanlong_jing',
    title: '撼龙经',
    author: '旧题杨筠松撰',
    dynasty: '旧题唐（托名有争议）',
    category: '术数',
    license: '公版',
    excerptLines: [
      {
        text: '《撼龙经》旧题唐杨筠松撰，专言山川形格与寻龙点穴之法，为形势派（峦头）代表文献；署名托名有争议，年代经后人考辨。',
        note: '编者提要，未录原文；引用时一律标「旧题」。',
      },
    ],
  },
  {
    id: 'canon_zangshu',
    title: '葬书',
    author: '旧题郭璞撰',
    dynasty: '旧题晋（实晚出）',
    category: '术数',
    license: '公版',
    excerptLines: [
      {
        text: '气乘风则散，界水则止。古人聚之使不散，行之使有止，故谓之风水。',
        note: '《葬书》开篇逐字引文（公版，通行整理本，高置信素材）；「风水」一词即出此句。',
      },
      {
        text: '《葬书》一卷，旧题东晋郭璞撰，实为晚出托名之作；言乘生气、藏风聚气之旨，为形势派首出文献。',
        note: '编者提要，未录原文。',
      },
    ],
  },
];
