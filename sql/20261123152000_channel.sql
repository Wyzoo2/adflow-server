-- 迁移：channel
-- 投放渠道改为管理员维护的主数据，不再写死在代码里。
-- 迁移时写入 6 个常用渠道，管理员可在「渠道管理」中改名、停用或删除。

CREATE TABLE IF NOT EXISTS channel (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(32)  NOT NULL COMMENT '渠道编码，计划表引用该值',
  name       VARCHAR(64)  NOT NULL COMMENT '渠道名称',
  bid_type   VARCHAR(8)   NOT NULL DEFAULT 'cpm' COMMENT '默认出价方式 cpm/cpc',
  status     TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  sort_no    INT          NOT NULL DEFAULT 0,
  remark     VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_status (status, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投放渠道';

INSERT IGNORE INTO channel (code, name, bid_type, status, sort_no) VALUES
  ('douyin', '抖音', 'cpm', 1, 1),
  ('wechat', '微信朋友圈', 'cpm', 1, 2),
  ('xiaohongshu', '小红书', 'cpc', 1, 3),
  ('kuaishou', '快手', 'cpm', 1, 4),
  ('baidu', '百度', 'cpc', 1, 5),
  ('other', '其他', 'cpm', 1, 6);
