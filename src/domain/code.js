// 投放单号生成：DC + 日期 + 四位计划 ID。

export function buildCampaignCode(id, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `DC${y}${m}${d}-${String(id).padStart(4, '0')}`;
}
