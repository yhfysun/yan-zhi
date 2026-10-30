// 天气整形纯函数单测（不联网）
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeatherCode, composeWeather, pickPlace, dayLabel } from './weather.js';

test('WMO 天气码 → 中文 + 图标', () => {
  assert.deepEqual(describeWeatherCode(0), { text: '晴', icon: '☀️' });
  assert.equal(describeWeatherCode(3).text, '阴');
  assert.equal(describeWeatherCode(61).text, '小雨');
  assert.equal(describeWeatherCode(95).text, '雷阵雨');
  assert.equal(describeWeatherCode(999).text, '未知', '未知码不崩');
});

test('dayLabel：今天 / 明天 / 后天 / 周几', () => {
  const base = new Date(2026, 9, 30, 12).getTime(); // 2026-10-30 周五
  assert.equal(dayLabel('2026-10-30', base), '今天');
  assert.equal(dayLabel('2026-10-31', base), '明天');
  assert.equal(dayLabel('2026-11-01', base), '后天');
  assert.equal(dayLabel('2026-11-03', base), '周二');
});

test('pickPlace：取第一条结果并拼出带省份的城市名', () => {
  const p = pickPlace({ results: [{ name: '成都', admin1: '四川省', country: '中国', latitude: 30.66, longitude: 104.06 }] });
  assert.equal(p.name, '成都 · 四川省 · 中国');
  assert.equal(p.lat, 30.66);
  assert.equal(pickPlace({ results: [] }), null);
  assert.equal(pickPlace(null), null);
});

test('composeWeather：整形当前天气 + 三天预报', () => {
  const raw = {
    current: {
      temperature_2m: 23.44, apparent_temperature: 25, relative_humidity_2m: 61,
      wind_speed_10m: 8.24, weather_code: 1,
    },
    daily: {
      time: ['2026-10-30', '2026-10-31', '2026-11-01'],
      weather_code: [1, 3, 61],
      temperature_2m_max: [26, 24, 20],
      temperature_2m_min: [16, 15, 13],
      precipitation_probability_max: [10, 20, 80],
    },
  };
  const now = new Date(2026, 9, 30, 12).getTime();
  const out = composeWeather(raw, { name: '成都' }, now);
  assert.equal(out.city, '成都');
  assert.equal(out.temp, 23.4);
  assert.equal(out.feels, 25);
  assert.equal(out.humidity, 61);
  assert.equal(out.wind, 8.2);
  assert.equal(out.text, '晴间多云');
  assert.equal(out.high, 26);
  assert.equal(out.low, 16);
  assert.equal(out.days.length, 3);
  assert.equal(out.days[0].label, '今天');
  assert.equal(out.days[1].label, '明天');
  assert.equal(out.days[2].rain, 80);
});

test('composeWeather：缺字段不抛，值回落 null', () => {
  const out = composeWeather({}, { name: 'x' }, Date.now());
  assert.equal(out.temp, null);
  assert.equal(out.text, '未知');
  assert.deepEqual(out.days, []);
});
