/**
 * 冒烟测试：不依赖演示数据，自行创建项目、计划、用户并跑通全流程。
 * 覆盖 R1-R15 补充需求、核心状态机、导入导出、权限与跨域。
 * 用法：node scripts/smoke.js [baseUrl]
 * 测试结束后可用 `npm run seed:force` 清理产生的数据。
 */
import os from 'node:os';
import ExcelJS from 'exceljs';

const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, form, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const type = res.headers.get('content-type') || '';
  const payload = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, payload, headers: res.headers };
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return null;
}

async function login(username, password) {
  return api('/api/v1/auth/login', { method: 'POST', body: { username, password } });
}

async function main() {
  console.log(`smoke test against ${BASE}`);
  const stamp = Date.now();

  const health = await api('/health');
  check('健康检查', health.status === 200 && health.payload.db === 'up');

  const adminLogin = await login('root', 'root');
  check('管理员登录', adminLogin.status === 200 && adminLogin.payload.data?.token);
  if (!adminLogin.payload.data?.token) {
    console.log('  提示：请先执行 npm run setup 初始化管理员账号');
    process.exit(1);
  }
  const admin = adminLogin.payload.data.token;

  // ---------- 注册 / 昵称 / 密码 ----------
  const regName = `smoke_reg${stamp}`;
  const registered = await api('/api/v1/auth/register', {
    method: 'POST',
    body: { username: regName, password: 'pass123', displayName: '注册用户' },
  });
  check(
    '注册接口',
    registered.status === 200 && Boolean(registered.payload.data?.token) && registered.payload.data?.user?.role === 'user'
  );
  const regToken = registered.payload.data?.token;
  const regDup = await api('/api/v1/auth/register', {
    method: 'POST',
    body: { username: regName, password: 'pass123' },
  });
  check('注册用户名唯一', regDup.status === 409);

  const profileUpdated = await api('/api/v1/auth/profile', {
    method: 'PATCH',
    token: regToken,
    body: { displayName: `昵称-${stamp}` },
  });
  check(
    '修改昵称',
    profileUpdated.status === 200 &&
      profileUpdated.payload.data?.user?.displayName === `昵称-${stamp}` &&
      Boolean(profileUpdated.payload.data?.token)
  );

  const badOld = await api('/api/v1/auth/password', {
    method: 'PUT',
    token: regToken,
    body: { oldPassword: 'wrong-pass', newPassword: 'pass456' },
  });
  check('修改密码校验原密码', badOld.status === 400);

  const changed = await api('/api/v1/auth/password', {
    method: 'PUT',
    token: regToken,
    body: { oldPassword: 'pass123', newPassword: 'pass456' },
  });
  check('修改密码', changed.status === 200 && changed.payload.data?.success === true);
  const staleToken = await api('/api/v1/auth/profile', { token: regToken });
  check('改密后旧令牌失效', staleToken.status === 401);

  const oldLogin = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { username: regName, password: 'pass123' },
  });
  check('旧密码失效', oldLogin.status === 401);
  const newLogin = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { username: regName, password: 'pass456' },
  });
  check('新密码可登录', newLogin.status === 200 && Boolean(newLogin.payload.data?.token));

  // ---------- 基础数据 ----------
  const project = await api('/api/v1/projects', {
    method: 'POST',
    token: admin,
    body: { name: `冒烟测试项目-${stamp}`, client: '测试', budget: 100000 },
  });
  check('创建项目', project.status === 200 && project.payload.data?.id);
  const projectId = project.payload.data.id;

  // ---------- 渠道管理 ----------
  const channelCode = `smokech${stamp}`;
  const channel = await api('/api/v1/channels', {
    method: 'POST',
    token: admin,
    body: { code: channelCode, name: `冒烟渠道-${stamp}`, bidType: 'cpc', sortNo: 99 },
  });
  check('创建渠道', channel.status === 200 && channel.payload.data?.id);

  const channelDup = await api('/api/v1/channels', {
    method: 'POST',
    token: admin,
    body: { code: channelCode, name: '重复编码' },
  });
  check('渠道编码唯一', channelDup.status === 409);

  const channelList = await api('/api/v1/channels?pageSize=50', { token: admin });
  check('渠道列表', channelList.payload.data?.items?.some((c) => c.code === channelCode));

  const created = await api('/api/v1/campaigns', {
    method: 'POST',
    token: admin,
    body: {
      projectId,
      name: `冒烟测试计划-${stamp}`,
      channel: channelCode,
      objective: 'impression',
      bidType: 'cpm',
      budget: 10000,
      dailyBudget: 2000,
      contractNo: 'HT-2026-001',
      targetImpressions: 500000,
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      targeting: { regions: ['江苏省'], gender: 'all' },
    },
  });
  check('创建计划', created.status === 200 && created.payload.data.id);
  const campaignId = created.payload.data.id;

  const detail0 = await api(`/api/v1/campaigns/${campaignId}`, { token: admin });
  check(
    'R7 计划字段落库',
    detail0.payload.data?.dailyBudget === '2000.00' &&
      detail0.payload.data?.bidType === 'cpm' &&
      detail0.payload.data?.contractNo === 'HT-2026-001'
  );
  check('R8 创建人字段', detail0.payload.data?.creatorName === '系统管理员', detail0.payload.data?.creatorName);
  check('渠道名称来自渠道表', detail0.payload.data?.channelName === `冒烟渠道-${stamp}`, detail0.payload.data?.channelName);

  // R13：无数据时完成率为 null
  const emptyDraft = await api('/api/v1/campaigns', {
    method: 'POST',
    token: admin,
    body: {
      projectId,
      name: `空草稿-${stamp}`,
      channel: channelCode,
      budget: 1000,
      targetImpressions: 10000,
      startDate: '2026-12-01',
      endDate: '2026-12-02',
    },
  });
  const emptyDetail = await api(`/api/v1/campaigns/${emptyDraft.payload.data.id}`, { token: admin });
  check('R13 无数据完成率为 null', emptyDetail.payload.data?.completionRate === null);

  const badDate = await api(`/api/v1/campaigns/${campaignId}`, {
    method: 'PUT',
    token: admin,
    body: { endDate: '2026-11-30' },
  });
  check('计划日期校验', badDate.status === 400);

  // ---------- 状态流转 ----------
  const submitted = await api(`/api/v1/campaigns/${campaignId}/submit`, { method: 'POST', token: admin });
  check('提交审核', submitted.payload.data?.status === 'pending');
  check('R8 提交时间', Boolean(submitted.payload.data?.submittedAt));

  const approved = await api(`/api/v1/campaigns/${campaignId}/approve`, { method: 'POST', token: admin });
  check('审核通过', approved.payload.data?.status === 'scheduled');

  const published = await api(`/api/v1/campaigns/${campaignId}/publish`, {
    method: 'POST',
    token: admin,
    body: { publishMode: 'schedule' },
  });
  const code = published.payload.data?.code;
  check('发布生成单号', /^DC\d{8}-\d{4}$/.test(code || ''), code);

  // ----------  数据 ----------
  const profile = await api(`/api/v1/campaigns/${campaignId}/data-profile`, {
    method: 'PUT',
    token: admin,
    body: { curveType: 'uniform', ctr: 0.01, cpm: 10, frequency: 65, totalImpressions: 500000, seed: 20261123 },
  });
  check('保存 参数', profile.status === 200);

  const generated = await api(`/api/v1/campaigns/${campaignId}/data/generate`, {
    method: 'POST',
    token: admin,
    body: {},
  });
  check('生成 数据', generated.payload.data?.days === 5, JSON.stringify(generated.payload.data));
  check('R9 同步返回新增天数', generated.payload.data?.added === 5, String(generated.payload.data?.added));

  const stats = await api(`/api/v1/campaigns/${campaignId}/stats`, { token: admin });
  check('分日数据写入', Number(stats.payload.data?.totals.impressions) === 500000);
  check(
    '分日数据不暴露来源字段',
    (stats.payload.data?.rows || []).every((row) => !('source' in row))
  );

  const detail = await api(`/api/v1/campaigns/${campaignId}`, { token: admin });
  check('计划详情含实际曝光', Number(detail.payload.data?.actualImpressions) === 500000);
  check('计划详情完成率', detail.payload.data?.completionRate === 1);
  check('R8 数据更新时间', Boolean(detail.payload.data?.dataUpdatedAt));

  // R3 趋势目标
  const trend = await api('/api/v1/dashboard/trend?from=2026-12-01&to=2026-12-05', { token: admin });
  const targetSum = (trend.payload.data || []).reduce((sum, row) => sum + Number(row.target), 0);
  check('R3 趋势包含每日目标', trend.payload.data?.length === 5 && targetSum >= 500000, String(targetSum));

  // R2 环比字段
  const summary = await api(
    '/api/v1/dashboard/summary?from=2026-12-01&to=2026-12-05&compare=previous',
    { token: admin }
  );
  check('R2 环比字段存在', summary.payload.data && 'compare' in summary.payload.data);

  // R5 项目预算
  const projectDetail = await api(`/api/v1/projects/${projectId}`, { token: admin });
  check(
    'R5 项目已用/剩余预算',
    projectDetail.payload.data?.usedBudget === '11000.00' &&
      projectDetail.payload.data?.remainingBudget === '89000.00',
    JSON.stringify(projectDetail.payload.data)
  );

  // ---------- R1 手工录入人群维度 ----------
  const dayRow = stats.payload.data.rows.find((r) => r.statDate === '2026-12-03');
  const dayImp = Number(dayRow.impressions);
  const badDims = await api(`/api/v1/campaigns/${campaignId}/stats`, {
    method: 'POST',
    token: admin,
    body: {
      statDate: '2026-12-03',
      impressions: dayImp,
      reach: Number(dayRow.reach),
      clicks: Number(dayRow.clicks),
      cost: Number(dayRow.cost),
      dims: { region: [{ key: 'jiangsu', name: '江苏省', impressions: dayImp - 1 }] },
    },
  });
  check('R1 维度合计校验', badDims.status === 400);

  const goodDims = await api(`/api/v1/campaigns/${campaignId}/stats`, {
    method: 'POST',
    token: admin,
    body: {
      statDate: '2026-12-03',
      impressions: dayImp,
      reach: Number(dayRow.reach),
      clicks: Number(dayRow.clicks),
      cost: Number(dayRow.cost),
      dims: {
        region: [{ key: 'jiangsu', name: '江苏省', impressions: dayImp }],
        gender: [
          { key: 'male', name: '男', impressions: Math.round(dayImp * 0.67) },
          { key: 'female', name: '女', impressions: dayImp - Math.round(dayImp * 0.67) },
        ],
      },
    },
  });
  check('R1 维度录入成功', goodDims.status === 200 && goodDims.payload.data?.dimsValid === true);

  const dimsDay = await api(
    `/api/v1/campaigns/${campaignId}/dimensions?type=region&from=2026-12-03&to=2026-12-03`,
    { token: admin }
  );
  check('R6 维度按日过滤', Number(dimsDay.payload.data?.totals?.region) === dayImp, JSON.stringify(dimsDay.payload.data?.totals));

  const dimsAll = await api(`/api/v1/campaigns/${campaignId}/dimensions?type=region`, { token: admin });
  const dimsRange = await api(
    `/api/v1/campaigns/${campaignId}/dimensions?type=region&from=2026-12-01&to=2026-12-02`,
    { token: admin }
  );
  check(
    'R6 维度周期合计',
    Number(dimsAll.payload.data?.totals?.region) === 500000 &&
      Number(dimsRange.payload.data?.totals?.region) < 500000
  );

  // ---------- R14 渠道名称 ----------
  const channels = await api('/api/v1/dashboard/channels', { token: admin });
  const channelRow = (channels.payload.data || []).find((c) => c.channel === channelCode);
  check('R14 渠道中文名', channelRow?.channelName === `冒烟渠道-${stamp}`, JSON.stringify(channelRow));

  // ---------- R9 同步记录 ----------
  const syncTasks = await api('/api/v1/sync-tasks', { token: admin });
  const task = syncTasks.payload.data?.items?.find((t) => t.campaignId === String(campaignId));
  check('R9 同步记录带计划名', Boolean(task?.campaignName), JSON.stringify(task));
  check('R9 同步记录不暴露适配器', task && !('adapter' in task));

  // ---------- R15 空 body ----------
  const pauseRes = await fetch(`${BASE}/api/v1/campaigns/${campaignId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: '',
  });
  check('R15 空 body 写接口', pauseRes.status === 200, String(pauseRes.status));
  await api(`/api/v1/campaigns/${campaignId}/resume`, { method: 'POST', token: admin, body: {} });

  // ---------- R11 字典 / R12 续期 ----------
  const dicts = await api('/api/v1/dicts', { token: admin });
  check('R11 字典接口', dicts.payload.data?.channels?.length >= 1 && Boolean(dicts.payload.data?.version));

  const refreshed = await api('/api/v1/auth/refresh', { method: 'POST', token: admin });
  check('R12 令牌续期', Boolean(refreshed.payload.data?.token));
  const profileWithNew = await api('/api/v1/auth/profile', { token: refreshed.payload.data.token });
  check('R12 新令牌可用', profileWithNew.payload.data?.username === 'root');

  // ---------- 导入 ----------
  const template = await api('/api/v1/stats/import/template', { token: admin });
  check('下载导入模板', template.status === 200 && template.payload.byteLength > 1000);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  sheet.addRow(['计划编号', '日期', '曝光量', '曝光人数', '点击人数', '消耗']);
  sheet.addRow([code, '2026-12-02', 120000, 2000, 30, 900]);
  const buffer = await workbook.xlsx.writeBuffer();
  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'import.xlsx'
  );
  const imported = await api('/api/v1/stats/import', { method: 'POST', token: admin, form });
  check('Excel 导入', imported.payload.data?.rows === 1, JSON.stringify(imported.payload));

  // ---------- R4 报表 ----------
  const reportCases = [
    ['campaign', 'xlsx', { campaignId }],
    ['campaign', 'pdf', { campaignId }],
    ['daily', 'xlsx', { from: '2026-12-01', to: '2026-12-05', campaignIds: [campaignId] }],
    ['daily', 'pdf', { from: '2026-12-01', to: '2026-12-05', campaignIds: [campaignId] }],
    ['weekly', 'xlsx', { from: '2026-12-01', to: '2026-12-05' }],
    ['weekly', 'pdf', { from: '2026-12-01', to: '2026-12-05' }],
    ['detail', 'xlsx', { from: '2026-12-01', to: '2026-12-05', campaignIds: [campaignId] }],
    ['detail', 'pdf', { from: '2026-12-01', to: '2026-12-05', campaignIds: [campaignId] }],
  ];
  for (const [type, format, extra] of reportCases) {
    const report = await api('/api/v1/reports', {
      method: 'POST',
      token: admin,
      body: { type, format, ...extra },
    });
    const data = report.payload.data;
    check(
      `R4 ${type}.${format} 生成`,
      report.status === 200 && data?.status === 'success' && data?.format === format,
      JSON.stringify(report.payload)
    );
    if (data?.id) {
      check(
        `R4 ${type}.${format} 文件名/大小`,
        data.fileName?.endsWith(`.${format}`) && data.fileSize > 0,
        JSON.stringify(data)
      );
      const download = await api(`/api/v1/reports/${data.id}/download`, { token: admin });
      const contentType = download.headers.get('content-type') || '';
      const typeOk = format === 'pdf' ? contentType.includes('pdf') : contentType.includes('spreadsheetml');
      check(
        `R4 ${type}.${format} 下载`,
        download.status === 200 && download.payload.byteLength > 1000 && typeOk
      );
    }
  }
  const reportList = await api('/api/v1/reports', { token: admin });
  const listed = reportList.payload.data?.items?.[0];
  check('R4 列表字段', Boolean(listed?.format) && Boolean(listed?.fileSize), JSON.stringify(listed));

  // ---------- R10 清空数据 ----------
  const cleared = await api(`/api/v1/campaigns/${campaignId}/stats`, { method: 'DELETE', token: admin });
  check('R10 清空计划数据', cleared.payload.data?.cleared === true && cleared.payload.data?.deletedDays === 5);
  const afterClear = await api(`/api/v1/campaigns/${campaignId}/stats`, { token: admin });
  check('R10 清空后无分日数据', afterClear.payload.data?.rows.length === 0);

  // ---------- 删除渠道 ----------
  const channelDeleted = await api(`/api/v1/channels/${channel.payload.data.id}`, {
    method: 'DELETE',
    token: admin,
  });
  check('删除渠道', channelDeleted.payload.data?.deleted === true);
  const channelActive = await api('/api/v1/channels/active', { token: admin });
  check('删除后不在启用列表', !channelActive.payload.data?.some((c) => c.code === channelCode));

  // ---------- 普通用户 ----------
  const user = await api('/api/v1/users', {
    method: 'POST',
    token: admin,
    body: { username: `smoke${stamp}`, password: 'smoke123', displayName: '冒烟用户', role: 'user' },
  });
  check('创建普通用户', user.status === 200 && user.payload.data?.id);

  const userLogin = await login(`smoke${stamp}`, 'smoke123');
  const normal = userLogin.payload.data?.token;
  check('普通用户登录', Boolean(normal));

  const forbidden = await api(`/api/v1/campaigns/${campaignId}/publish`, { method: 'POST', token: normal, body: {} });
  check('普通用户禁止发布', forbidden.status === 403);

  const ownList = await api('/api/v1/campaigns?pageSize=50', { token: normal });
  check('普通用户仅见本人计划', ownList.payload.data?.total === 0, String(ownList.payload.data?.total));

  const resetPwd = await api(`/api/v1/users/${user.payload.data.id}/reset-password`, {
    method: 'POST',
    token: admin,
    body: { password: 'reset123' },
  });
  check('管理员重置密码', resetPwd.status === 200);
  const staleAfterReset = await api('/api/v1/auth/profile', { token: normal });
  check('重置密码后旧令牌失效', staleAfterReset.status === 401);
  const relogin = await login(`smoke${stamp}`, 'reset123');
  check('重置后新密码登录', relogin.status === 200);
  const resetToken = relogin.payload.data?.token;

  const disabled = await api(`/api/v1/users/${user.payload.data.id}`, { method: 'DELETE', token: admin });
  check('停用普通用户', disabled.status === 200);
  const staleAfterDisable = await api('/api/v1/auth/profile', { token: resetToken });
  check('停用后旧令牌失效', staleAfterDisable.status === 401);
  const disabledLogin = await login(`smoke${stamp}`, 'reset123');
  check('停用后不能登录', disabledLogin.status === 403);

  // ---------- 跨域 / 文档 ----------
  const preflight = await fetch(`${BASE}/api/v1/campaigns`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://frontend.example.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  check(
    'CORS 预检',
    preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === 'http://frontend.example.com'
  );

  const ip = lanIp();
  if (ip) {
    const port = new URL(BASE).port || '3000';
    const viaIp = await fetch(`http://${ip}:${port}/health`).then((r) => r.json());
    check(`IP 访问 (${ip}:${port})`, viaIp.status === 'ok');
  }

  const docs = await fetch(`${BASE}/api-docs`);
  check('API 文档页', docs.status === 200 && (await docs.text()).includes('swagger'));
  const spec = await fetch(`${BASE}/api-docs/json`).then((r) => r.json());
  check('文档收录接口', Object.keys(spec.paths).length >= 40, String(Object.keys(spec.paths).length));

  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  if (passed) console.log('提示：测试产生的数据可用 npm run seed:force 清理');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
