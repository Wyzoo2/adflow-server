/**
 * 冒烟测试：不依赖任何演示数据，自行创建项目、计划、用户并跑通全流程。
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

async function api(path, { method = 'GET', token, body, form } = {}) {
  const opts = { method, headers: {} };
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

  const project = await api('/api/v1/projects', {
    method: 'POST',
    token: admin,
    body: { name: `冒烟测试项目-${stamp}`, client: '测试', budget: 100000 },
  });
  check('创建项目', project.status === 200 && project.payload.data?.id);
  const projectId = project.payload.data.id;

  const created = await api('/api/v1/campaigns', {
    method: 'POST',
    token: admin,
    body: {
      projectId,
      name: `冒烟测试计划-${stamp}`,
      channel: 'douyin',
      budget: 10000,
      targetImpressions: 500000,
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      targeting: { regions: ['江苏省'], gender: 'all' },
    },
  });
  check('创建计划', created.status === 200 && created.payload.data.id);
  const campaignId = created.payload.data.id;

  const badDate = await api(`/api/v1/campaigns/${campaignId}`, {
    method: 'PUT',
    token: admin,
    body: { endDate: '2026-11-30' },
  });
  check('计划日期校验', badDate.status === 400);

  const submitted = await api(`/api/v1/campaigns/${campaignId}/submit`, { method: 'POST', token: admin });
  check('提交审核', submitted.payload.data?.status === 'pending');

  const approved = await api(`/api/v1/campaigns/${campaignId}/approve`, { method: 'POST', token: admin });
  check('审核通过', approved.payload.data?.status === 'scheduled');

  const published = await api(`/api/v1/campaigns/${campaignId}/publish`, {
    method: 'POST',
    token: admin,
    body: { publishMode: 'schedule' },
  });
  const code = published.payload.data?.code;
  check('发布生成单号', /^DC\d{8}-\d{4}$/.test(code || ''), code);

  const profile = await api(`/api/v1/campaigns/${campaignId}/mock-profile`, {
    method: 'PUT',
    token: admin,
    body: { curveType: 'uniform', ctr: 0.01, cpm: 10, frequency: 65, totalImpressions: 500000, seed: 20261123 },
  });
  check('保存模拟参数', profile.status === 200);

  const generated = await api(`/api/v1/campaigns/${campaignId}/mock/generate`, {
    method: 'POST',
    token: admin,
    body: {},
  });
  check('生成模拟数据', generated.payload.data?.days === 5, JSON.stringify(generated.payload.data));

  const stats = await api(`/api/v1/campaigns/${campaignId}/stats`, { token: admin });
  check('分日数据写入', Number(stats.payload.data?.totals.impressions) === 500000);

  const detail = await api(`/api/v1/campaigns/${campaignId}`, { token: admin });
  check('计划详情含实际曝光', Number(detail.payload.data?.actualImpressions) === 500000);
  check('计划详情完成率', detail.payload.data?.completionRate === 1);

  const badRange = await api(`/api/v1/campaigns/${campaignId}/mock/generate`, {
    method: 'POST',
    token: admin,
    body: { from: '2026-12-10', to: '2026-12-01' },
  });
  check('模拟日期校验', badRange.status === 400);

  const dims = await api(`/api/v1/campaigns/${campaignId}/dimensions`, { token: admin });
  check('人群维度写入', dims.payload.data?.items.length > 0);

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

  const report = await api('/api/v1/reports', {
    method: 'POST',
    token: admin,
    body: { type: 'campaign', campaignId },
  });
  check('生成报表', report.status === 200 && report.payload.data?.status === 'success');
  const download = await api(`/api/v1/reports/${report.payload.data.id}/download`, { token: admin });
  check('下载报表', download.status === 200 && download.payload.byteLength > 2000);

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

  const summary = await api('/api/v1/dashboard/summary', { token: admin });
  check('看板汇总', Number(summary.payload.data?.impressions) >= 500000);

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
  check('文档收录接口', Object.keys(spec.paths).length >= 35, String(Object.keys(spec.paths).length));

  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  if (passed) console.log('提示：测试产生的数据可用 npm run seed:force 清理');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
