// 模拟数据生成器：曲线权重、可复现随机、人群拆分。

import { eachDay } from '../../utils/date.js';

export const DEFAULT_DIM_RATIO = {
  region: { 江苏省: 1 },
  gender: { 男: 0.67, 女: 0.33 },
  age: { '18-24': 0.2, '25-29': 0.21, '30-39': 0.22, '40-49': 0.21, '50+': 0.16 },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 最大余数法，保证拆分后合计精确等于 total */
export function splitExact(total, weights) {
  const value = Number(total) || 0;
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (value * w) / sum);
  const base = raw.map((v) => Math.floor(v));
  const rest = value - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rest; k += 1) base[order[k % order.length].i] += 1;
  return base;
}

export function buildWeights(days, curve) {
  return days.map((date, index) => {
    const ratio = days.length > 1 ? index / (days.length - 1) : 0.5;
    switch (curve) {
      case 'front_load':
        return 1.3 - 0.6 * ratio;
      case 'back_load':
        return 0.7 + 0.6 * ratio;
      case 'weekend': {
        const dow = new Date(`${date}T00:00:00+08:00`).getDay();
        return dow === 0 || dow === 6 ? 1.3 : 1;
      }
      case 'uniform':
      default:
        return 1;
    }
  });
}

/**
 * 生成计划的分日数据与人群维度数据。
 * 返回 { daily: [...], dims: [...], totals }
 */
export function generateSeries({ campaign, profile, from, to }) {
  const start = from || campaign.startDate;
  const end = to || campaign.endDate;
  const days = eachDay(start, end);
  if (!days.length) throw new Error('投放排期为空');

  const seed = Number(profile?.seed || 20261101) >>> 0;
  const rand = mulberry32(seed);
  const baseWeights = buildWeights(days, profile?.curveType || 'uniform');
  const jittered = baseWeights.map((w) => w * (0.85 + 0.3 * rand()));
  const total = Number(profile?.totalImpressions || campaign.targetImpressions || 0);
  const impressions = splitExact(total, jittered);

  const frequency = Math.max(1, Number(profile?.frequency || 65));
  const ctr = Math.min(0.2, Math.max(0, Number(profile?.ctr ?? 0.01)));
  const cpm = Math.max(0, Number(profile?.cpm ?? 12));

  const daily = days.map((date, i) => {
    const imp = impressions[i];
    const reach = Math.max(1, Math.round(imp / frequency));
    const clicks = Math.max(0, Math.round(reach * ctr));
    const cost = Number(((imp / 1000) * cpm).toFixed(2));
    return { statDate: date, impressions: imp, reach, clicks, cost };
  });

  const ratio = profile?.dimRatio || DEFAULT_DIM_RATIO;
  const dims = [];
  // 维度按日拆分，保证每个日期三组维度合计都等于当日曝光
  for (const day of daily) {
    for (const [dimType, mapping] of Object.entries(ratio)) {
      const values = Object.keys(mapping);
      const weights = Object.values(mapping).map(Number);
      const impSplit = splitExact(day.impressions, weights);
      const reachSplit = splitExact(day.reach, weights);
      const clickSplit = splitExact(day.clicks, weights);
      values.forEach((value, i) => {
        dims.push({
          statDate: day.statDate,
          dimType,
          dimValue: value,
          impressions: impSplit[i],
          reach: reachSplit[i],
          clicks: clickSplit[i],
        });
      });
    }
  }

  return {
    daily,
    dims,
    totals: {
      impressions: total,
      reach: daily.reduce((a, b) => a + b.reach, 0),
      clicks: daily.reduce((a, b) => a + b.clicks, 0),
      cost: Number(daily.reduce((a, b) => a + b.cost, 0).toFixed(2)),
    },
  };
}
