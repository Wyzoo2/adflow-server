// Swagger 文档装配：分类标签、Bearer 鉴权与文档页 CSP。

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const TAGS = [
  { name: '认证', description: '登录、当前用户信息、退出' },
  { name: '用户管理', description: '账号新增、启停、身份与密码（管理员）' },
  { name: '厂商管理', description: '投流厂商的新增、修改、停用与删除' },
  { name: '渠道管理', description: '投放渠道的新增、修改、启停与删除' },
  { name: '项目管理', description: '项目信息维护' },
  { name: '投放计划', description: '计划的创建、审核、发布、暂停与结案' },
  { name: '数据回收', description: '分日数据、人群维度、Excel 导入与同步' },
  { name: '数据生成', description: '投放数据参数与数据生成（管理员）' },
  { name: '数据看板', description: '汇总指标、趋势、人群分布与渠道占比' },
  { name: '报表中心', description: '报表生成与下载' },
  { name: '字典', description: '渠道、年龄段、兴趣与指标口径' },
  { name: '系统日志', description: '审计日志与同步记录' },
  { name: '健康检查', description: '服务与数据库连通性' },
];

export default async function swaggerPlugin(app) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: '投流统计平台 API',
        version: '1.0.0',
        description: [
          'Node.js + MySQL 后端接口文档，按业务分类展示。',
          '',
          '**认证方式**：先调用 `POST /api/v1/auth/login` 获取 token，再点击右上角 Authorize 填入。',
          '',
          '**默认账号**：管理员 `root / root`。系统只有管理员与普通用户两类身份，普通用户由管理员在用户管理中创建。',
          '',
          '**数据范围**：管理员可见全部数据；普通用户仅可见本人创建的计划及其数据。',
        ].join('\n'),
      },
      servers: [{ url: '/' }],
      tags: TAGS,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api-docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      filter: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    staticCSP: true,
    // 内网 http 访问时按需放宽 CSP：
    // 1) 去掉 upgrade-insecure-requests，避免静态资源被强制升级为 https；
    // 2) style-src 追加 'unsafe-inline'，Swagger UI 会写入内联样式，否则页面错位。
    transformStaticCSP: (header) =>
      header
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && part.toLowerCase() !== 'upgrade-insecure-requests')
        .map((part) => {
          const lower = part.toLowerCase();
          if (lower.startsWith('style-src') && !lower.includes("'unsafe-inline'")) {
            return `${part} 'unsafe-inline'`;
          }
          return part;
        })
        .join('; '),
  });
}
