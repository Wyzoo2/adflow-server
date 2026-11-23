// 静态字典：渠道、年龄段、兴趣、指标口径，供 /dicts 与报表/看板复用
export const DICT_VERSION = '2026-11-23';

export const CHANNELS = [
  { code: 'douyin', name: '抖音', enabled: true, bidType: 'cpm' },
  { code: 'wechat', name: '微信朋友圈', enabled: true, bidType: 'cpm' },
  { code: 'xiaohongshu', name: '小红书', enabled: true, bidType: 'cpc' },
  { code: 'kuaishou', name: '快手', enabled: true, bidType: 'cpm' },
  { code: 'baidu', name: '百度', enabled: true, bidType: 'cpc' },
  { code: 'other', name: '其他', enabled: true, bidType: 'cpm' },
];

export const AGES = [
  { code: '18-24', name: '18-24 岁' },
  { code: '25-29', name: '25-29 岁' },
  { code: '30-39', name: '30-39 岁' },
  { code: '40-49', name: '40-49 岁' },
  { code: '50+', name: '50 岁以上' },
];

export const INTERESTS = [
  { code: 'digital', name: '数码家电' },
  { code: 'beauty', name: '美妆个护' },
  { code: 'baby', name: '母婴亲子' },
  { code: 'auto', name: '汽车' },
  { code: 'home', name: '房产家居' },
  { code: 'finance', name: '金融' },
  { code: 'education', name: '教育' },
  { code: 'game', name: '游戏' },
];

export const METRICS = [
  { code: 'impressions', name: '曝光量', formula: 'SUM(impressions)', decimals: 0 },
  { code: 'reach', name: '曝光人数', formula: 'SUM(reach)', decimals: 0 },
  { code: 'clicks', name: '点击人数', formula: 'SUM(clicks)', decimals: 0 },
  { code: 'ctr', name: '点击率', formula: 'clicks / reach', decimals: 4 },
  { code: 'completionRate', name: '曝光完成率', formula: 'impressions / target_impressions', decimals: 4 },
  { code: 'cpm', name: '千人曝光成本', formula: 'cost / impressions * 1000', decimals: 2 },
];

const NAME_MAP = new Map(CHANNELS.map((c) => [c.code, c.name]));

export function channelName(code) {
  return NAME_MAP.get(code) || code;
}

export function getDicts(channels = CHANNELS, version = DICT_VERSION) {
  return {
    version,
    channels: channels.map((c) => ({
      code: c.code,
      name: c.name,
      enabled: c.status === undefined ? Boolean(c.enabled) : Number(c.status) === 1,
      bidType: c.bidType || 'cpm',
    })),
    ages: AGES,
    interests: INTERESTS,
    metrics: METRICS,
  };
}
