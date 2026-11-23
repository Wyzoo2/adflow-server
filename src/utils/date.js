// 日期工具：格式化、按天展开。

const pad = (n) => String(n).padStart(2, '0');

export function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(value) {
  if (value instanceof Date) return value;
  const d = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** 含头含尾的日期序列 */
export function eachDay(start, end) {
  const out = [];
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || s > e) return out;
  const cur = new Date(s);
  while (cur <= e) {
    out.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function today() {
  return formatDate(new Date());
}

export function daysBetween(start, end) {
  return eachDay(start, end).length;
}

/** 日期加减天数，返回 YYYY-MM-DD */
export function addDays(value, delta) {
  const d = parseDate(value);
  if (!d) return null;
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

/** 所在周的周一（用于周报聚合） */
export function weekStart(value) {
  const d = parseDate(value);
  if (!d) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}
