const NATIONAL_SOURCE = 'https://www.ruankao.org.cn/';
const REGISTRATION_URL = 'https://bm.ruankao.org.cn/sign/welcome';
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * 地区入口来自软考官网「各地考试机构」公开链接。
 * 服务端只抓取白名单 URL，绝不接受用户传入任意地址，避免 SSRF。
 */
const REGION_SOURCES: Record<string, string> = {
  北京: 'http://rsj.beijing.gov.cn/ywsite/bjpta/',
  天津: 'https://www.ruankao.org.cn/article/content/2609041717564227810690038.html',
  河北: 'http://www.hebpta.com.cn',
  山西: 'https://www.ruankao.org.cn/article/content/100003230309143819970466.html',
  内蒙古: 'http://www.impta.com.cn',
  宁波: 'http://jxj.ningbo.gov.cn/',
  吉林: 'http://www.jlzkb.com/',
  辽宁: 'http://www.lnicloud.com/',
  黑龙江: 'http://www.hljrsks.org.cn',
  大连: 'http://www.dlrkb.com',
  上海: 'http://rsj.sh.gov.cn',
  江苏: 'https://www.jsiic.cn/',
  浙江: 'https://www.ruankao.org.cn/article/content/2502131006541603762472524.html',
  安徽: 'http://www.apta.gov.cn',
  福建: 'http://gxt.fujian.gov.cn/zwgk/ztjj/fjrkzl/',
  江西: 'http://www.itetc.org',
  山东: 'http://hrss.shandong.gov.cn/rsks',
  河南: 'http://www.chniee.org.cn/',
  湖北: 'http://www.hbsme.com.cn/',
  湖南: 'http://gxt.hunan.gov.cn/rkb/',
  广东: 'http://rsks.gd.gov.cn',
  广西: 'http://www.gxpta.com.cn',
  海南: 'https://zhaopin.hainan.gov.cn',
  重庆: 'https://cqitrk.cqitc.cn',
  四川: 'http://rst.sc.gov.cn',
  贵州: 'http://www.gzsic.cn/',
  云南: 'http://www.ynxr.com',
  西藏: 'http://weibo.com/u/2501551951',
  陕西: 'http://www.shaanxirk.com',
  甘肃: 'http://ks.rst.gansu.gov.cn/ncms/index.shtml',
  青海: 'http://www.qhpta.com',
  宁夏: 'http://www.nxpta.com',
  新疆: 'http://gxt.xinjiang.gov.cn/',
  新疆兵团: 'http://btpta.xjbt.gov.cn/',
  香港: 'http://www.apec.org.hk/',
  澳门: 'http://cms.cpttm.org.mo',
};

export const SOFT_EXAM_REGIONS = Object.entries(REGION_SOURCES).map(([name, officialUrl]) => ({
  name,
  officialUrl,
  registrationUrl: REGISTRATION_URL,
}));

export type SoftExamNotice = {
  title: string;
  url: string;
  source: '全国' | '地区';
};

export type SoftExamLiveInfo = {
  region: string;
  registrationUrl: string;
  officialUrl: string;
  nationalUrl: string;
  fetchedAt: number;
  status: 'live' | 'partial' | 'fallback';
  notices: SoftExamNotice[];
};

const cache = new Map<string, { expiresAt: number; value: SoftExamLiveInfo }>();

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNotices(html: string, baseUrl: string, source: '全国' | '地区'): SoftExamNotice[] {
  const rows: SoftExamNotice[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && rows.length < 12) {
    const title = cleanText(match[2]);
    if (title.length < 6 || !/(软考|软件资格|软件考试|计算机技术|报名|准考证|考试安排|批次|成绩|合格标准)/.test(title)) continue;
    let url = '';
    try { url = new URL(match[1], baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(url)) continue;
    const key = `${title}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ title, url, source });
  }
  return rows;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return text.slice(0, 2_000_000);
}

export async function getSoftExamLiveInfo(region: string): Promise<SoftExamLiveInfo> {
  const name = String(region || '').trim();
  const officialUrl = REGION_SOURCES[name];
  if (!officialUrl) throw new Error('未知软考地区');
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [national, local] = await Promise.allSettled([
    fetchHtml(NATIONAL_SOURCE),
    fetchHtml(officialUrl),
  ]);
  const notices = [
    ...(national.status === 'fulfilled' ? parseNotices(national.value, NATIONAL_SOURCE, '全国') : []),
    ...(local.status === 'fulfilled' ? parseNotices(local.value, officialUrl, '地区') : []),
  ];
  const unique = [...new Map(notices.map((notice) => [`${notice.title}|${notice.url}`, notice])).values()].slice(0, 16);
  const status: SoftExamLiveInfo['status'] = unique.length
    ? (national.status === 'fulfilled' || local.status === 'fulfilled' ? 'live' : 'fallback')
    : (national.status === 'fulfilled' || local.status === 'fulfilled' ? 'partial' : 'fallback');
  const value: SoftExamLiveInfo = {
    region: name,
    registrationUrl: REGISTRATION_URL,
    officialUrl,
    nationalUrl: NATIONAL_SOURCE,
    fetchedAt: Date.now(),
    status,
    notices: unique,
  };
  cache.set(name, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
