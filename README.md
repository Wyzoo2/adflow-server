# 投流统计平台 · 后端服务

Node.js + MySQL 实现的投流统计后端，面向前端联调与验收演示。覆盖投放计划全流程、厂商多选管理、投放数据自动变化与人工调节、看板聚合、报表导出、审计日志与权限隔离。

- 分层结构：`routes → services → repositories → db`，领域规则单独放在 `domain/`
- 跨域：默认允许全部来源，可用 `CORS_ORIGIN` 配置白名单
- 监听 `0.0.0.0`，支持通过局域网 IP 访问接口与文档
- 接口文档：`/api-docs`，按业务分类展示全部接口，支持在线调试

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 运行时 | Node.js 22+（已在 24 验证） |
| Web 框架 | Fastify 5 |
| 数据库 | MySQL 8.4+（已在 26.7 验证） |
| 驱动 | mysql2（连接池、预处理、大整数字符串） |
| 认证 | jsonwebtoken + bcryptjs |
| 文档 | @fastify/swagger + @fastify/swagger-ui |
| 导入导出 | exceljs + @fastify/multipart |

## 目录结构

```
adflow-server/
├── sql/schema.sql           # 基线建表脚本
├── scripts/
│   ├── migrate.js           # 建库建表
│   ├── seed.js              # 初始化管理员账号（--force 重置）
│   └── smoke.js             # 端到端冒烟测试
├── src/
│   ├── server.js            # 启动入口、监听与地址输出
│   ├── app.js               # Fastify 实例、CORS、鉴权、错误处理、路由挂载
│   ├── config/              # 环境变量
│   ├── db/                  # 连接池、事务封装
│   ├── plugins/             # 鉴权、错误处理、Swagger
│   ├── schemas/             # 公共 JSON Schema
│   ├── routes/              # 路由层：参数校验、响应封装
│   ├── services/            # 业务层：事务、规则编排
│   ├── repositories/        # 数据层：SQL 与字段映射
│   ├── domain/              # 状态机、单号、指标口径
│   ├── adapters/media/      # 数据生成器（预留真实媒体适配）
│   └── utils/               # 响应体、错误、分页、日期
└── storage/reports/         # 导出的 Excel
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置数据库（复制后修改账号密码）
copy .env.example .env

# 3. 首次运行：建库建表 + 初始化管理员账号（只需执行一次）
npm run setup

# 4. 每次启动
npm start
```

日常开发只需 `npm start`（或 `npm run dev` 自动重启）。

### 三条命令分别做什么

| 命令 | 作用 | 何时执行 |
| --- | --- | --- |
| `npm run setup` | 依次执行 migrate 与 seed | 首次部署 |
| `npm run migrate` | 建库建表，按 `schema_migrations` 记录跳过已执行脚本 | 首次部署、结构升级 |
| `npm run seed` | 只创建管理员账号，不写入项目、厂商、计划等业务数据；已存在时跳过 | 首次部署 |
| `npm run auto:tick` | 手动执行一次投放数据自动更新，用于联调或验证 | 按需 |
| `npm run auto:publish` | 手动执行一次排期自动发布检查 | 按需 |
| `npm start` | 启动 HTTP 服务，监听 0.0.0.0，同时开启自动更新与自动发布定时器 | 每次启动 |

拆分的原因：建表与初始化属于部署动作，只应执行一次；启动服务是日常动作。三者分开后，生产环境启动时不会误写测试数据，结构变更也能单独控制。`migrate` 本身幂等，重复执行只会跳过；`seed` 检测到管理员已存在会直接退出，需要重置时用 `npm run seed:force`（清空业务数据并恢复默认管理员密码）。

`sql/` 下 `schema.sql` 固定最先执行，其余脚本按文件名排序；新增结构变更使用时间戳前缀（如 `20261201103000_create_material.sql`），执行记录保存在 `schema_migrations` 表。

启动后控制台会打印本机与局域网访问地址：

```
本机文档： http://localhost:3000/api-docs
局域网：   http://192.168.x.x:3000/api-docs
```

### 默认账号

| 身份 | 账号 | 密码 | 数据范围 |
| --- | --- | --- | --- |
| 管理员 | root | root | 全部数据与配置 |

系统初始只创建这一个管理员账号；普通用户由管理员在「用户管理」中新增，或通过 `POST /api/v1/auth/register` 自行注册，登录后只能看到本人创建的计划与数据。注册入口只创建普通用户，不能注册管理员。

修改密码、管理员重置密码、停用账号都会递增该用户的 `token_version`，之前签发的令牌立即失效，接口返回 401，需要重新登录。修改密码接口的返回中带 `relogin: true`，前端应清理本地令牌并跳转登录页。

投放渠道完全由管理员在「渠道管理」中创建；`npm run setup` 只建表并创建 `root` 管理员，不写入任何渠道、项目、计划等业务数据。

## 新增表与结构变更

`schema.sql` 是基线脚本，一旦在某个环境执行过，就不要再改它——迁移器按文件名记录执行状态，改了也不会重跑。后续新增表或改字段，按“一个变更一个文件”的方式：

```bash
npm run migrate:new -- create_material
# 已创建迁移文件：sql/20261201103000_create_material.sql
```

在生成的文件里写 DDL：

```sql
CREATE TABLE IF NOT EXISTS material (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

执行：

```bash
npm run migrate
```

`sql/` 下的文件按文件名排序执行，执行过的记录在 `schema_migrations`，重复执行自动跳过。约定：

- `schema.sql` 固定最先执行，其余文件按时间戳排序，保证先建表再变更；
- 一个文件只做一件事，失败时容易定位；
- 仅含注释的文件不会执行、也不会写入执行记录；
- 本地要从零重建，删库后执行 `npm run setup` 即可（会清空数据）。

## 接口文档

- 文档页：`http://<服务器IP>:3000/api-docs`
- OpenAPI JSON：`http://<服务器IP>:3000/api-docs/json`
- 健康检查：`http://<服务器IP>:3000/health`

文档已按 13 个业务分类分组，包含请求参数与在线调试：

认证、用户管理、厂商管理、渠道管理、项目管理、投放计划、数据回收、数据生成、数据看板、报表中心、字典、系统日志、健康检查。

建议使用顺序：先调 `POST /api/v1/auth/login` 登录，复制返回的 token，点击文档右上角 **Authorize** 填入后即可调试需要登录的接口。

## 跨域与 IP 访问

- 服务监听 `HOST=0.0.0.0`，同一局域网内可直接用 IP 访问。
- CORS 默认反射任意来源（`CORS_ORIGIN=*`），允许 `Authorization`、`Content-Type` 等请求头，并暴露 `Content-Disposition` 供前端读取下载文件名。
- 生产环境建议在 `.env` 中设置白名单：

```ini
CORS_ORIGIN=http://192.168.9.10:5173,http://localhost:5173
```

- Windows 首次对外访问需放行端口：

```powershell
netsh advfirewall firewall add rule name="adflow-3000" dir=in action=allow protocol=TCP localport=3000
```

## 主要接口

| 分类 | 方法与路径 | 说明 |
| --- | --- | --- |
| 认证 | POST `/api/v1/auth/register` | 注册普通用户，返回令牌 |
| 认证 | POST `/api/v1/auth/login` | 登录获取 JWT |
| 认证 | GET `/api/v1/auth/profile` | 当前用户 |
| 认证 | PATCH `/api/v1/auth/profile` | 修改昵称 |
| 认证 | PUT `/api/v1/auth/password` | 修改密码，旧令牌全部失效 |
| 认证 | POST `/api/v1/auth/refresh` | 续期令牌 |
| 用户 | GET/POST `/api/v1/users` | 用户列表、新增（管理员） |
| 厂商 | GET `/api/v1/vendors` | 厂商分页列表 |
| 厂商 | GET `/api/v1/vendors/active` | 启用厂商（发布向导用） |
| 厂商 | POST/PUT/DELETE `/api/v1/vendors` | 厂商维护（管理员） |
| 渠道 | GET/POST `/api/v1/channels` | 渠道列表、新增（管理员） |
| 渠道 | GET `/api/v1/channels/active` | 启用渠道（发布向导用） |
| 渠道 | PUT/DELETE `/api/v1/channels/{id}` | 修改、删除渠道（管理员） |
| 计划 | GET/POST `/api/v1/campaigns` | 计划分页、创建草稿 |
| 计划 | POST `/api/v1/campaigns/{id}/submit` | 提交审核 |
| 计划 | POST `/api/v1/campaigns/{id}/approve` | 审核通过（管理员） |
| 计划 | POST `/api/v1/campaigns/{id}/publish` | 按排期发布：未来保持已排期，到点生成单号（管理员） |
| 计划 | POST `/api/v1/campaigns/{id}/pause` | 暂停 / 恢复 / 结束 |
| 计划 | PUT `/api/v1/campaigns/{id}/vendors` | 设置计划厂商（多选覆盖） |
| 数据 | GET `/api/v1/campaigns/{id}/stats` | 分日数据与合计 |
| 数据 | POST `/api/v1/campaigns/{id}/stats` | 手工录入（可带人群维度） |
| 数据 | PATCH `/api/v1/campaigns/{id}/stats/{date}` | 单日调节（管理员） |
| 数据 | DELETE `/api/v1/campaigns/{id}/stats` | 清空计划数据（管理员） |
| 数据 | POST `/api/v1/stats/import` | Excel 导入 |
| 数据 | GET `/api/v1/stats/import/template` | 下载导入模板 |
| 数据生成 | GET/PUT `/api/v1/campaigns/{id}/data-profile` | 数据参数 |
| 数据生成 | POST `/api/v1/campaigns/{id}/data/generate` | 生成投放数据（管理员） |
| 看板 | GET `/api/v1/dashboard/summary` | 汇总指标 |
| 看板 | GET `/api/v1/dashboard/trend` | 按日趋势 |
| 看板 | GET `/api/v1/dashboard/dimensions` | 地域/性别/年龄分布 |
| 报表 | POST `/api/v1/reports` | 日报/周报/结案/明细，xlsx 或 pdf |
| 报表 | GET `/api/v1/reports/{id}/download` | 下载报表 |
| 字典 | GET `/api/v1/dicts` | 渠道、年龄段、兴趣、指标口径 |
| 日志 | GET `/api/v1/logs` | 审计日志（管理员） |

完整清单以 `/api-docs` 为准。

## 关键设计

- **状态机**：`draft → pending → scheduled → running → paused → finished → closed`，未定义迁移直接返回 409；开始日期未到的计划停在 `scheduled`，到开始日期由后台自动发布。
- **投放单号**：发布时生成 `DCYYYYMMDD-XXXX`，唯一索引兜底，前端可直接用于对账。
- **项目预算**：项目下所有未删除计划的预算合计不能超过项目总预算；超出时发布返回 2003，自动发布也会暂停，计划保持已排期，调整预算后下一轮自动发布。
- **幂等入库**：分日数据以 `(campaign_id, stat_date)` 为主键，`INSERT ... AS new ON DUPLICATE KEY UPDATE` 覆盖写入，重复导入不累加。
- **投放数据**：按目标曝光、曲线、点击率、千人成本、频次、人群比例与随机种子生成；默认前重后轻（前几天份额更大），固定种子结果可复现，人群维度用最大余数法保证合计精确。
- **自动变化**：投放中的计划由后台定时器滚动更新，按当天已过时间生成当天数据，累计曝光最终落在发布目标的 90%–110%；只有“投放中”状态更新，暂停/结束/结案即停止。
- **人工优先**：手工录入、Excel 导入的数据标记为 `manual`/`excel`，自动更新会跳过这些日期；管理员仍可通过“数据参数/生成”整体覆盖。
- **数据权限**：管理员全量；普通用户按 `created_by` 过滤，读写他人计划返回 404。
- **审计**：登录、状态迁移、数据调节、厂商变更等写入 `audit_log`，记录前后值与操作人。

## 投放数据自动变化

服务启动后会开启一个后台定时器，默认每 60 秒检查一次“投放中”的计划：

- 按当天已过去的时间比例生成当天数据，越晚数据越多；发布当天按当日份额的 0.1% 保底，约 1 分半后开始持续增长；
- 开始日期之前的日期不生成，历史日期自动补齐，重启后会补跑；
- 每个计划的最终累计曝光由计划 ID 稳定映射到目标的 90%–110%，不会无限增长；
- 暂停、结束、结案后停止更新；
- 手工录入（`manual`）和 Excel 导入（`excel`）的日期不会被自动覆盖；
- 多实例部署时使用 MySQL `GET_LOCK` 互斥，只有一个实例执行。

管理员也可以调用 `POST /api/v1/campaigns/{id}/sync` 手动同步一次：只按当前时间补齐应产生的数据，不额外增加；重复点击不会加速增长。

相关配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AUTO_DATA_ENABLED` | `true` | 是否开启自动更新 |
| `AUTO_TICK_INTERVAL_MS` | `60000` | 执行间隔，毫秒 |

需要立即触发一次可执行：

```bash
npm run auto:tick
```

## 排期自动发布

创建计划时如果开始日期还没到，审核通过后停在 `scheduled`，不生成投放单号；后台定时任务默认每 60 秒检查一次，到达开始日期后自动：

- 生成 `DCYYYYMMDD-XXXX` 投放单号；
- 状态改为 `running`；
- 写入发布时间；
- 写审计日志 `auto_publish`，操作人显示为「系统」。

发布接口同样遵守这个规则：未来计划手动发布仍保持 `scheduled`，不生成单号；开始日期已到或就是今天才真正进入投放。已投放中的计划重复发布不会重复生成单号。项目下所有计划预算合计超过项目总预算时，手动发布返回 2003，自动发布暂停并保持 `scheduled`。

排期已经整体结束、但仍停留在 `scheduled` 的历史计划，会被自动标记为 `finished` 并记录 `auto_finish_expired`。

相关配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AUTO_PUBLISH_ENABLED` | `true` | 是否开启排期自动发布 |
| `AUTO_PUBLISH_INTERVAL_MS` | `60000` | 检查间隔，毫秒 |

手动执行一次：

```bash
npm run auto:publish
```

## 初始化数据

`npm run seed` 只做一件事：创建管理员账号 `root / root`，不写入任何项目、厂商、计划与投放数据。

首次登录后按以下顺序录入基础数据：

1. 在「项目管理」创建项目；
2. 在「厂商管理」新增投流厂商；
3. 在「投放计划」创建计划并选择厂商；
4. 管理员审核、发布后，系统会按时间自动生成投放数据，无需手动操作；需要覆盖时再用「数据参数」生成，或手工录入 / Excel 导入。

重置数据（清空业务数据、删除普通用户并恢复默认管理员密码）：

```bash
npm run seed:force
```

## 验证

```bash
# 服务启动后执行，覆盖 R1-R15 补充需求、渠道/厂商管理、注册与账号资料、计划全流程、排期自动发布、数据生成、Excel 导入、四类报表、权限与跨域（99 项）
npm run smoke
```

冒烟测试会自行创建测试项目、计划与普通用户，不依赖初始化数据；跑完后执行 `npm run seed:force` 即可清空。

## 部署建议

- Windows：用 `nssm` 或计划任务把 `node src/server.js` 注册为服务，工作目录设为项目根目录。
- Linux：`pm2 start src/server.js --name adflow`，或 systemd 托管。
- 反向代理：Nginx 将 `/api/` 转发到 `127.0.0.1:3000`，同时保留 `/api-docs`。
- 备份：每日 `mysqldump adflow`，报表目录 `storage/reports` 定期清理。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 连接被拒绝，端口 5432 | 机器上存在同名环境变量 `DB_PORT`（PostgreSQL），项目已用 `dotenv override` 覆盖，确认 `.env` 生效 |
| 文档页空白 | 检查 `/api-docs/json` 是否返回 200；反向代理需放行 `/api-docs` 静态资源 |
| 跨域失败 | 确认响应头 `access-control-allow-origin`；白名单模式下把前端地址加入 `CORS_ORIGIN` |
| 局域网访问超时 | 放行 3000 端口，确认服务监听在 `0.0.0.0` 而非 `127.0.0.1` |
| 启动报 `EADDRINUSE` | 端口已被占用（多数是之前启动的服务没关）。`netstat -ano \| findstr :3000` 查 PID，`taskkill /PID <PID> /F` 结束，或把 `.env` 的 `PORT` 改成 3001 |
| 导入报“缺少必填列” | 使用 `/api/v1/stats/import/template` 下载模板，表头保持中文原名 |
