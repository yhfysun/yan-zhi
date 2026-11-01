// 天气整形（纯函数，不联网）：Open-Meteo 原始响应 → 组件可直接渲染的形状
//
// ★ 为什么单独抽：天气组件在桌面层常驻，拿到的 raw 字段缺失/顺序变化是常态。
//   整形一律**缺字段回落 null 且绝不抛**（抛了就是桌面组件白屏，用户只会看到"天气没了"）。

/** WMO weather_code → 中文 + 图标 */
const WMO = {
  0: ['晴', '☀️'],
  1: ['晴间多云', '🌤'],
  2: ['多云', '⛅'],
  3: ['阴', '☁️'],
  45: ['雾', '🌫'],
  48: ['雾凇', '🌫'],
  51: ['毛毛雨', '🌦'],
  53: ['小雨', '🌦'],
  55: ['细雨', '🌦'],
  56: ['冻毛毛雨', '🌧'],
  57: ['冻雨', '🌧'],
  61: ['小雨', '🌧'],
  63: ['中雨', '🌧'],
  65: ['大雨', '🌧'],
  66: ['冻雨', '🌧'],
  67: ['冻雨', '🌧'],
  71: ['小雪', '🌨'],
  73: ['中雪', '🌨'],
  75: ['大雪', '❄️'],
  77: ['米雪', '🌨'],
  80: ['阵雨', '🌦'],
  81: ['阵雨', '🌧'],
  82: ['暴雨', '⛈'],
  85: ['阵雪', '🌨'],
  86: ['阵雪', '❄️'],
  95: ['雷阵雨', '⛈'],
  96: ['雷阵雨伴冰雹', '⛈'],
  99: ['雷暴冰雹', '⛈'],
};

export function describeWeatherCode(code) {
  const hit = WMO[Number(code)];
  return hit ? { text: hit[0], icon: hit[1] } : { text: '未知', icon: '❓' };
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 本地日键（YYYY-MM-DD）：提醒去重、天气按天分组都用它 */
export function dayKey(ms) {
  const d = new Date(Number(ms) || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 日期串 → 今天 / 明天 / 后天 / 周几 */
export function dayLabel(dateStr, nowMs) {
  const now = new Date(Number(nowMs) || Date.now());
  const today = dayKey(now);
  if (dateStr === today) return '今天';
  const tmr = dayKey(now.getTime() + 86400000);
  if (dateStr === tmr) return '明天';
  const dat = dayKey(now.getTime() + 2 * 86400000);
  if (dateStr === dat) return '后天';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr || '');
  return WEEK[d.getDay()];
}

/** 地理编码结果 → 展示用地名（城市 · 省 · 国） */
export function pickPlace(geo) {
  const first = geo && Array.isArray(geo.results) ? geo.results[0] : null;
  if (!first) return null;
  const parts = [first.name, first.admin1, first.country].filter(Boolean);
  return {
    name: parts.join(' · '),
    lat: Number(first.latitude),
    lon: Number(first.longitude),
  };
}

function round1(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/**
 * 原始天气响应 → 组件形状。
 * @param {object} raw Open-Meteo 的 { current, daily }
 * @param {object} place pickPlace 的结果（至少要有 name）
 * @param {number} nowMs 用于算「今天/明天」
 */
export function composeWeather(raw, place, nowMs) {
  const cur = (raw && raw.current) || {};
  const daily = (raw && raw.daily) || {};
  const now = Number(nowMs) || Date.now();
  const code = Number.isFinite(Number(cur.weather_code)) ? describeWeatherCode(cur.weather_code) : { text: '未知', icon: '❓' };

  const times = Array.isArray(daily.time) ? daily.time : [];
  const days = times.map((t, i) => {
    const arr = (k) => (Array.isArray(daily[k]) ? daily[k][i] : undefined);
    const c = Number.isFinite(Number(arr('weather_code')))
      ? describeWeatherCode(arr('weather_code'))
      : { text: '未知', icon: '❓' };
    return {
      date: t,
      label: dayLabel(t, now),
      text: c.text,
      icon: c.icon,
      high: round1(arr('temperature_2m_max')),
      low: round1(arr('temperature_2m_min')),
      rain: Number.isFinite(Number(arr('precipitation_probability_max')))
        ? Math.round(Number(arr('precipitation_probability_max')))
        : null,
    };
  });

  return {
    city: (place && place.name) || '',
    temp: round1(cur.temperature_2m),
    feels: round1(cur.apparent_temperature),
    humidity: Number.isFinite(Number(cur.relative_humidity_2m)) ? Math.round(Number(cur.relative_humidity_2m)) : null,
    wind: round1(cur.wind_speed_10m),
    text: code.text,
    icon: code.icon,
    high: days.length ? days[0].high : null,
    low: days.length ? days[0].low : null,
    days,
  };
}
