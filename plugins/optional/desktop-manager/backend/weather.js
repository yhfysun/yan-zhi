// 天气取数（Open-Meteo，无需 key）：城市名 → 经纬度 → 当前天气 + 未来几天
// 缓存：城市 24h、天气 10 分钟（同一城市反复渲染不至于每次打网络）
import { composeWeather, pickPlace, describeWeatherCode } from '../shared/weather.js';

const GEO_TTL = 24 * 3600 * 1000;
const WX_TTL = 10 * 60 * 1000;
const geoCache = new Map();
const wxCache = new Map();

async function fetchJson(url, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'yan-zhi/desktop-manager' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 城市名 → { name, lat, lon } | null（GeoIP 兜底不在这里做，没城市就报错让用户去设置页填） */
export async function geocode(city) {
  const key = String(city || '').trim();
  if (!key) return null;
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.place;
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&format=json&name='
    + encodeURIComponent(key);
  const data = await fetchJson(url);
  const place = pickPlace(data);
  geoCache.set(key, { at: Date.now(), place });
  return place;
}

/** 当前天气（含未来 3 天） */
export async function currentWeather(city, nowMs = Date.now()) {
  const name = String(city || '').trim();
  if (!name) throw new Error('未设置城市（设置页「天气城市」里填一个，如：成都）');
  const place = await geocode(name);
  if (!place) throw new Error(`找不到城市：${name}`);

  const ck = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = wxCache.get(ck);
  if (hit && Date.now() - hit.at < WX_TTL) return { ...hit.data, updatedAt: hit.data.updatedAt };

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.lat}&longitude=${place.lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=auto&forecast_days=3';
  const data = await fetchJson(url);
  const out = composeWeather(data, place, nowMs);
  wxCache.set(ck, { at: Date.now(), data: out });
  return out;
}

/** 测试/排查用 */
export function clearWeatherCaches() {
  geoCache.clear();
  wxCache.clear();
}

export { describeWeatherCode };
