// 投放状态机：事件到目标状态的唯一映射。

import { errors } from '../utils/errors.js';

export const CAMPAIGN_STATUS = {
  draft: '草稿',
  pending: '待审核',
  scheduled: '已排期',
  running: '投放中',
  paused: '已暂停',
  finished: '已结束',
  closed: '已结案',
};

/** 事件到目标状态的迁移表，未定义组合一律拒绝 */
const TRANSITIONS = {
  draft: { submit: 'pending' },
  pending: { approve: 'scheduled', reject: 'draft', withdraw: 'draft' },
  scheduled: { publish: 'running', pause: 'paused' },
  running: { pause: 'paused', finish: 'finished' },
  paused: { resume: 'running', finish: 'finished' },
  finished: { close: 'closed' },
  closed: {},
};

export function nextStatus(current, event) {
  const map = TRANSITIONS[current];
  if (!map || !map[event]) {
    throw errors.conflict(
      `状态「${CAMPAIGN_STATUS[current] || current}」不允许执行 ${event} 操作`
    );
  }
  return map[event];
}

export function canEdit(status) {
  return status === 'draft';
}

export function assertEditable(status) {
  if (!canEdit(status)) throw errors.conflict('只有草稿状态的计划可以修改');
}

export function canAcceptStats(status) {
  return status === 'running' || status === 'paused' || status === 'finished';
}
