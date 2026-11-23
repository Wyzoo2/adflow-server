-- ============================================================================
-- 投流统计平台 数据库结构
-- 数据库：MySQL 8.0+，字符集 utf8mb4，存储引擎 InnoDB
--
-- 说明：这是基线建表脚本，包含 12 张表，按「用户 → 项目与厂商 → 投放计划
--       → 投放数据 → 模拟参数 → 日志与任务」的顺序创建。
--       脚本使用 CREATE TABLE IF NOT EXISTS，可重复执行。
--
-- 表清单：
--   sys_user        系统用户（管理员 / 普通用户）
--   project         项目
--   vendor          投流厂商（平台自维护的主数据）
--   campaign        投放计划（核心业务表）
--   campaign_vendor 计划与厂商关联（多对多）
--   creative        投放素材
--   daily_stat      分日指标（曝光、人数、点击、消耗）
--   dim_stat        人群维度指标（地域 / 性别 / 年龄）
--   mock_profile    模拟投放参数
--   audit_log       审计日志
--   sync_task       数据同步任务记录
--   report_task     报表导出任务
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. sys_user 系统用户表
--    用途：登录账号与身份。系统只有两类身份，不建角色表。
--    要点：username 全局唯一；password_hash 存 bcrypt 哈希；
--          role 取值 admin（管理员）/ user（普通用户）；
--          status 控制启停，停用后无法登录。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_user (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'user' COMMENT 'admin 管理员 / user 普通用户',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  last_login_at DATETIME     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户';

-- ----------------------------------------------------------------------------
-- 2. project 项目表
--    用途：投放计划所属的项目，记录甲方、周期与总预算。
--    要点：项目与计划是一对多；预算用于校验计划总预算是否超额。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  client     VARCHAR(120) DEFAULT NULL,
  start_date DATE DEFAULT NULL,
  end_date   DATE DEFAULT NULL,
  budget     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目';

-- ----------------------------------------------------------------------------
-- 3. vendor 投流厂商表
--    用途：平台自行维护的厂商主数据，不依赖媒体同步。
--    要点：code 全局唯一；platform 标记所属平台；
--          采用软删除（deleted_at），已被计划引用的厂商只能停用不能删除。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  platform      VARCHAR(32)  NOT NULL COMMENT 'douyin/wechat/xiaohongshu/kuaishou/baidu',
  contact_name  VARCHAR(64)  DEFAULT NULL,
  contact_phone VARCHAR(32)  DEFAULT NULL,
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  remark        VARCHAR(255) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_status (status, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流厂商';

-- ----------------------------------------------------------------------------
-- 4. campaign 投放计划表（核心业务表）
--    用途：一次可独立排期、独立核算的投放单元。
--    要点：status 走状态机 draft → pending → scheduled → running →
--          paused → finished → closed；code 在发布时生成并唯一；
--          targeting 保存发布时的定向快照；deleted_at 为软删除；
--          普通用户的数据范围按 created_by 过滤。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  code               VARCHAR(32)  DEFAULT NULL COMMENT '投放单号',
  name               VARCHAR(120) NOT NULL,
  channel            VARCHAR(32)  NOT NULL,
  objective          VARCHAR(16)  NOT NULL DEFAULT 'impression',
  status             VARCHAR(16)  NOT NULL DEFAULT 'draft',
  budget             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  target_impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  targeting          JSON DEFAULT NULL,
  remark             VARCHAR(255) DEFAULT NULL,
  created_by         BIGINT UNSIGNED NOT NULL,
  published_at       DATETIME DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_project_status (project_id, status),
  KEY idx_status_date (status, start_date, end_date),
  KEY idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投放计划';

-- ----------------------------------------------------------------------------
-- 5. campaign_vendor 计划与厂商关联表
--    用途：一个计划可多选厂商，多对多关系。
--    要点：联合主键天然去重；保存时整体覆盖（先删后插）；
--          vendor_id 建索引以支持按厂商反查计划。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_vendor (
  campaign_id BIGINT UNSIGNED NOT NULL,
  vendor_id   BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, vendor_id),
  KEY idx_vendor (vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='计划与厂商关联';

-- ----------------------------------------------------------------------------
-- 6. creative 投放素材表
--    用途：记录计划关联的素材信息。
--    要点：只保存素材地址与审核状态，不做转码与送审。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creative (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id  BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,
  file_type    VARCHAR(16)  NOT NULL DEFAULT 'image',
  file_url     VARCHAR(500) NOT NULL,
  audit_status VARCHAR(16)  NOT NULL DEFAULT 'pending',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投放素材';

-- ----------------------------------------------------------------------------
-- 7. daily_stat 分日指标表
--    用途：按「计划 + 日期」沉淀曝光、曝光人数、点击人数与消耗。
--    要点：主键 (campaign_id, stat_date) 保证幂等，重复导入/同步只覆盖不累加；
--          source 区分数据来源（manual / excel / api / mock）。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_stat (
  campaign_id BIGINT UNSIGNED NOT NULL,
  stat_date   DATE NOT NULL,
  impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reach       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  clicks      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cost        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  source      VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT 'manual/excel/api/mock',
  updated_by  BIGINT UNSIGNED DEFAULT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, stat_date),
  KEY idx_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分日指标';

-- ----------------------------------------------------------------------------
-- 8. dim_stat 人群维度指标表
--    用途：按地域、性别、年龄拆分计划数据，供看板人群分布使用。
--    要点：主键 (campaign_id, dim_type, dim_value)；
--          dim_type 取值 region / gender / age；
--          各维度合计应等于当日或计划总曝光。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_stat (
  campaign_id BIGINT UNSIGNED NOT NULL,
  dim_type    VARCHAR(16) NOT NULL COMMENT 'region/gender/age',
  dim_value   VARCHAR(32) NOT NULL,
  impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reach       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  clicks      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, dim_type, dim_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人群维度指标';

-- ----------------------------------------------------------------------------
-- 9. mock_profile 模拟参数表
--    用途：当前阶段为模拟投流，保存每个计划的模拟生成参数。
--    要点：与 campaign 一对一（campaign_id 即主键）；
--          curve_type 控制投放曲线（uniform / front_load / back_load / weekend）；
--          seed 固定后生成结果可复现；ctr、cpm、frequency 决定点击与消耗。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mock_profile (
  campaign_id       BIGINT UNSIGNED NOT NULL,
  total_impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  curve_type        VARCHAR(16) NOT NULL DEFAULT 'uniform',
  ctr               DECIMAL(6,4) NOT NULL DEFAULT 0.0100,
  cpm               DECIMAL(8,2) NOT NULL DEFAULT 12.00,
  frequency         DECIMAL(6,2) NOT NULL DEFAULT 65.00,
  dim_ratio         JSON DEFAULT NULL,
  seed              INT UNSIGNED DEFAULT NULL,
  updated_by        BIGINT UNSIGNED DEFAULT NULL,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模拟参数';

-- ----------------------------------------------------------------------------
-- 10. audit_log 审计日志表
--     用途：记录登录、状态迁移、数据调节、厂商变更等操作。
--     要点：通过 object_type + object_id 关联业务对象，不建外键；
--           before_data / after_data 保存变更前后关键字段；
--           按对象、操作人、时间建立索引，日志只追加不修改。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  object_type VARCHAR(32) NOT NULL,
  object_id   BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(32) NOT NULL,
  before_data JSON DEFAULT NULL,
  after_data  JSON DEFAULT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  ip          VARCHAR(45) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_object (object_type, object_id, created_at),
  KEY idx_operator (operator_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志';

-- ----------------------------------------------------------------------------
-- 11. sync_task 数据同步任务表
--     用途：记录每次数据同步/模拟生成的执行情况。
--     要点：trigger_type 区分手动、定时、导入；
--           status 为 running / success / failed；
--           rows_affected 与 message 便于排查与页面展示。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_task (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id   BIGINT UNSIGNED DEFAULT NULL,
  trigger_type  VARCHAR(16) NOT NULL COMMENT 'manual/schedule/import',
  adapter       VARCHAR(32) NOT NULL,
  status        VARCHAR(16) NOT NULL COMMENT 'running/success/failed',
  rows_affected INT NOT NULL DEFAULT 0,
  message       VARCHAR(500) DEFAULT NULL,
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_campaign_time (campaign_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='同步任务记录';

-- ----------------------------------------------------------------------------
-- 12. report_task 报表导出任务表
--     用途：记录报表生成任务与文件位置。
--     要点：id 为 UUID；文件落盘到 storage/reports；
--           status 为 pending / success / failed；
--           下载接口按 created_by 校验归属。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_task (
  id          VARCHAR(36) NOT NULL,
  type        VARCHAR(32) NOT NULL,
  campaign_id BIGINT UNSIGNED DEFAULT NULL,
  params      JSON DEFAULT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',
  file_name   VARCHAR(255) DEFAULT NULL,
  file_path   VARCHAR(500) DEFAULT NULL,
  created_by  BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_created_by (created_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报表导出任务';
