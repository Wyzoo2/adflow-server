-- 迁移：backend_supplement
-- 对应前端接口补充需求：
--   R4  报表格式与文件大小
--   R6  人群维度按日存储
--   R7  计划补齐日预算、出价方式、关联合同
--   R8  计划详情补齐提交/结束/结案时间
--
-- 说明：结构变更只执行一次；已有 dim_stat 为计划级聚合数据，
--       升级时统一归到计划结束日期，之后的新数据按日写入。

ALTER TABLE campaign
  ADD COLUMN bid_type VARCHAR(8) NOT NULL DEFAULT 'cpm' COMMENT 'cpm/cpc' AFTER objective,
  ADD COLUMN daily_budget DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '日预算' AFTER budget,
  ADD COLUMN contract_no VARCHAR(32) DEFAULT NULL COMMENT '关联合同号' AFTER remark,
  ADD COLUMN submitted_at DATETIME DEFAULT NULL COMMENT '提交审核时间',
  ADD COLUMN finished_at DATETIME DEFAULT NULL COMMENT '结束投放时间',
  ADD COLUMN closed_at DATETIME DEFAULT NULL COMMENT '结案时间';

ALTER TABLE dim_stat
  ADD COLUMN stat_date DATE NULL COMMENT '统计日期' AFTER campaign_id;

UPDATE dim_stat ds
  LEFT JOIN campaign c ON c.id = ds.campaign_id
   SET ds.stat_date = COALESCE(c.end_date, CURDATE())
 WHERE ds.stat_date IS NULL;

DELETE FROM dim_stat WHERE stat_date IS NULL;

ALTER TABLE dim_stat
  MODIFY COLUMN stat_date DATE NOT NULL COMMENT '统计日期',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (campaign_id, stat_date, dim_type, dim_value),
  ADD KEY idx_dim_date (stat_date);

ALTER TABLE report_task
  ADD COLUMN format VARCHAR(8) NOT NULL DEFAULT 'xlsx' COMMENT 'xlsx/pdf' AFTER type,
  ADD COLUMN file_size INT UNSIGNED DEFAULT NULL COMMENT '文件大小(字节)' AFTER file_name;
