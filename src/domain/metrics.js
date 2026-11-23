// 指标口径：完成率、点击率、CPM 等派生指标。

export function toNum(value) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function completionRate(actual, target) {
  const t = toNum(target);
  if (!t) return null;
  return Number((toNum(actual) / t).toFixed(4));
}

export function clickRate(clicks, reach) {
  const r = toNum(reach);
  if (!r) return null;
  return Number((toNum(clicks) / r).toFixed(4));
}

export function costPerMille(cost, impressions) {
  const i = toNum(impressions);
  if (!i) return null;
  return Number(((toNum(cost) / i) * 1000).toFixed(2));
}

export function percent(rate) {
  if (rate === null || rate === undefined) return null;
  return `${(Number(rate) * 100).toFixed(2)}%`;
}
