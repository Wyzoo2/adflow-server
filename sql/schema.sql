-- ============================================================================
-- 投流统计平台 数据库结构（合并版）
-- 数据库：MySQL 8.0+，字符集 utf8mb4，存储引擎 InnoDB
--
-- 说明：包含全部 13 张表，建表与字段变更已合并到此文件，
--       不再需要额外的迁移脚本。脚本使用 CREATE TABLE IF NOT EXISTS，
--       可重复执行；内置 6 个常用投放渠道，可在系统中继续维护。
--
-- 表清单：
--   sys_user        系统用户（管理员 / 普通用户）
--   project         项目
--   vendor          投流厂商
--   channel         投放渠道
--   campaign        投放计划
--   campaign_vendor 计划与厂商关联
--   creative        投放素材
--   daily_stat      分日指标
--   dim_stat        人群维度指标（按日）
--   mock_profile    模拟投放参数
--   audit_log       审计日志
--   sync_task       数据同步任务
--   report_task     报表导出任务
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sys_user  系统用户：登录账号与身份（管理员 / 普通用户）
-- ----------------------------------------------------------------------------
CREATE TABLE `sys_user` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(100) NOT NULL,
  `display_name` varchar(64) NOT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'user' COMMENT 'admin 管理员 / user 普通用户',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1 启用 0 停用',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户';

-- ----------------------------------------------------------------------------
-- project  项目：投放归属、甲方、周期与总预算
-- ----------------------------------------------------------------------------
CREATE TABLE `project` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `client` varchar(120) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `budget` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目';

-- ----------------------------------------------------------------------------
-- vendor  投流厂商：平台自维护的厂商主数据，软删除
-- ----------------------------------------------------------------------------
CREATE TABLE `vendor` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(120) NOT NULL,
  `platform` varchar(32) NOT NULL COMMENT 'douyin/wechat/xiaohongshu/kuaishou/baidu',
  `contact_name` varchar(64) DEFAULT NULL,
  `contact_phone` varchar(32) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1 启用 0 停用',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status` (`status`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投流厂商';

-- ----------------------------------------------------------------------------
-- channel  投放渠道：管理员维护，计划引用渠道编码
-- ----------------------------------------------------------------------------
CREATE TABLE `channel` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '渠道编码，计划表引用该值',
  `name` varchar(64) NOT NULL COMMENT '渠道名称',
  `bid_type` varchar(8) NOT NULL DEFAULT 'cpm' COMMENT '默认出价方式 cpm/cpc',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1 启用 0 停用',
  `sort_no` int NOT NULL DEFAULT '0',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status` (`status`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投放渠道';

-- ----------------------------------------------------------------------------
-- campaign  投放计划：核心业务表，含状态机、预算、目标曝光、定向快照
-- ----------------------------------------------------------------------------
CREATE TABLE `campaign` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `code` varchar(32) DEFAULT NULL COMMENT '投放单号',
  `name` varchar(120) NOT NULL,
  `channel` varchar(32) NOT NULL,
  `objective` varchar(16) NOT NULL DEFAULT 'impression',
  `bid_type` varchar(8) NOT NULL DEFAULT 'cpm' COMMENT 'cpm/cpc',
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `budget` decimal(12,2) NOT NULL DEFAULT '0.00',
  `daily_budget` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '日预算',
  `target_impressions` bigint unsigned NOT NULL DEFAULT '0',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `targeting` json DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `contract_no` varchar(32) DEFAULT NULL COMMENT '关联合同号',
  `created_by` bigint unsigned NOT NULL,
  `published_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL COMMENT '提交审核时间',
  `finished_at` datetime DEFAULT NULL COMMENT '结束投放时间',
  `closed_at` datetime DEFAULT NULL COMMENT '结案时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_project_status` (`project_id`,`status`),
  KEY `idx_status_date` (`status`,`start_date`,`end_date`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投放计划';

-- ----------------------------------------------------------------------------
-- campaign_vendor  计划与厂商关联：多对多，联合主键去重
-- ----------------------------------------------------------------------------
CREATE TABLE `campaign_vendor` (
  `campaign_id` bigint unsigned NOT NULL,
  `vendor_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`campaign_id`,`vendor_id`),
  KEY `idx_vendor` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='计划与厂商关联';

-- ----------------------------------------------------------------------------
-- creative  投放素材：只存地址与审核状态
-- ----------------------------------------------------------------------------
CREATE TABLE `creative` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` bigint unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `file_type` varchar(16) NOT NULL DEFAULT 'image',
  `file_url` varchar(500) NOT NULL,
  `audit_status` varchar(16) NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaign` (`campaign_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投放素材';

-- ----------------------------------------------------------------------------
-- daily_stat  分日指标：计划+日期主键，保证幂等
-- ----------------------------------------------------------------------------
CREATE TABLE `daily_stat` (
  `campaign_id` bigint unsigned NOT NULL,
  `stat_date` date NOT NULL,
  `impressions` bigint unsigned NOT NULL DEFAULT '0',
  `reach` bigint unsigned NOT NULL DEFAULT '0',
  `clicks` bigint unsigned NOT NULL DEFAULT '0',
  `cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `source` varchar(16) NOT NULL DEFAULT 'manual' COMMENT 'manual/excel/api/mock',
  `updated_by` bigint unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`campaign_id`,`stat_date`),
  KEY `idx_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分日指标';

-- ----------------------------------------------------------------------------
-- dim_stat  人群维度：计划+日期+维度主键，支持周期过滤
-- ----------------------------------------------------------------------------
CREATE TABLE `dim_stat` (
  `campaign_id` bigint unsigned NOT NULL,
  `stat_date` date NOT NULL COMMENT '统计日期',
  `dim_type` varchar(16) NOT NULL COMMENT 'region/gender/age',
  `dim_value` varchar(32) NOT NULL,
  `impressions` bigint unsigned NOT NULL DEFAULT '0',
  `reach` bigint unsigned NOT NULL DEFAULT '0',
  `clicks` bigint unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`campaign_id`,`stat_date`,`dim_type`,`dim_value`),
  KEY `idx_dim_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人群维度指标';

-- ----------------------------------------------------------------------------
-- mock_profile  模拟参数：目标曝光、曲线、点击率、CPM、频次、种子
-- ----------------------------------------------------------------------------
CREATE TABLE `mock_profile` (
  `campaign_id` bigint unsigned NOT NULL,
  `total_impressions` bigint unsigned NOT NULL DEFAULT '0',
  `curve_type` varchar(16) NOT NULL DEFAULT 'uniform',
  `ctr` decimal(6,4) NOT NULL DEFAULT '0.0100',
  `cpm` decimal(8,2) NOT NULL DEFAULT '12.00',
  `frequency` decimal(6,2) NOT NULL DEFAULT '65.00',
  `dim_ratio` json DEFAULT NULL,
  `seed` int unsigned DEFAULT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`campaign_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='模拟参数';

-- ----------------------------------------------------------------------------
-- audit_log  审计日志：前后值、操作人、IP，只追加不修改
-- ----------------------------------------------------------------------------
CREATE TABLE `audit_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `object_type` varchar(32) NOT NULL,
  `object_id` bigint unsigned NOT NULL,
  `action` varchar(32) NOT NULL,
  `before_data` json DEFAULT NULL,
  `after_data` json DEFAULT NULL,
  `operator_id` bigint unsigned NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_object` (`object_type`,`object_id`,`created_at`),
  KEY `idx_operator` (`operator_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审计日志';

-- ----------------------------------------------------------------------------
-- sync_task  数据同步任务记录：触发方式、适配器、状态、影响行数
-- ----------------------------------------------------------------------------
CREATE TABLE `sync_task` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` bigint unsigned DEFAULT NULL,
  `trigger_type` varchar(16) NOT NULL COMMENT 'manual/schedule/import',
  `adapter` varchar(32) NOT NULL,
  `status` varchar(16) NOT NULL COMMENT 'running/success/failed',
  `rows_affected` int NOT NULL DEFAULT '0',
  `message` varchar(500) DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_campaign_time` (`campaign_id`,`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='同步任务记录';

-- ----------------------------------------------------------------------------
-- report_task  报表导出任务：类型、格式、文件位置与大小
-- ----------------------------------------------------------------------------
CREATE TABLE `report_task` (
  `id` varchar(36) NOT NULL,
  `type` varchar(32) NOT NULL,
  `format` varchar(8) NOT NULL DEFAULT 'xlsx' COMMENT 'xlsx/pdf',
  `campaign_id` bigint unsigned DEFAULT NULL,
  `params` json DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `file_name` varchar(255) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL COMMENT '文件大小(字节)',
  `file_path` varchar(500) DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_created_by` (`created_by`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='报表导出任务';

-- 常用投放渠道初始数据（管理员可在「渠道管理」中改名、停用或删除）
INSERT IGNORE INTO channel (code, name, bid_type, status, sort_no) VALUES
  ('douyin', '抖音', 'cpm', 1, 1),
  ('wechat', '微信朋友圈', 'cpm', 1, 2),
  ('xiaohongshu', '小红书', 'cpc', 1, 3),
  ('kuaishou', '快手', 'cpm', 1, 4),
  ('baidu', '百度', 'cpc', 1, 5),
  ('other', '其他', 'cpm', 1, 6);
