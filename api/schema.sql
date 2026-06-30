-- ─────────────────────────────────────────────────
-- JCCS FieldClock — schema.sql
-- MySQL 8.0+ / MariaDB 10.4+
-- ─────────────────────────────────────────────────

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `users` (
  `id`                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`                 VARCHAR(100)  NOT NULL,
  `email`                VARCHAR(180)  NULL DEFAULT NULL,
  `phone`                VARCHAR(20)   NULL DEFAULT NULL,
  `role`                 ENUM('employee','admin') NOT NULL DEFAULT 'employee',
  `pay_type`             ENUM('w2','1099') NOT NULL DEFAULT 'w2',
  `pay_rate`             DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  `overtime_rate`        DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  `gas_weekly_allowance` DECIMAL(6,2)  NULL DEFAULT NULL,
  `password_hash`        VARCHAR(255)  NULL DEFAULT NULL,
  `is_active`            TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`),
  UNIQUE KEY `uq_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `otp_codes` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `code`       VARCHAR(6)   NOT NULL,
  `expires_at` TIMESTAMP    NOT NULL,
  `used_at`    TIMESTAMP    NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otp` (`user_id`, `expires_at`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `refresh_tokens` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(64)  NOT NULL,
  `expires_at` TIMESTAMP    NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token_hash` (`token_hash`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `jobs` (
  `id`                     INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`                   VARCHAR(150)    NOT NULL,
  `client_name`            VARCHAR(150)    NOT NULL,
  `address`                TEXT            NOT NULL,
  `latitude`               DECIMAL(10,7)   NULL,
  `longitude`              DECIMAL(10,7)   NULL,
  `clock_in_radius_meters` INT             NOT NULL DEFAULT 300,
  `status`                 ENUM('active','completed','on_hold','cancelled') NOT NULL DEFAULT 'active',
  `notes`                  TEXT            NULL,
  `created_at`             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jobs_status`    (`status`),
  KEY `idx_jobs_location`  (`latitude`, `longitude`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `job_assignments` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id`      INT UNSIGNED NOT NULL,
  `user_id`     INT UNSIGNED NOT NULL,
  `assigned_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_user` (`job_id`, `user_id`),
  CONSTRAINT `fk_ja_job`  FOREIGN KEY (`job_id`)  REFERENCES `jobs`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ja_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `work_orders` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id`            INT UNSIGNED NOT NULL,
  `title`             VARCHAR(200) NOT NULL,
  `area`              VARCHAR(100) NULL,
  `description`       TEXT         NULL,
  `notes`             TEXT         NULL,
  `assigned_user_id`  INT UNSIGNED NULL,
  `status`            ENUM('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  `source`            ENUM('office','field') NOT NULL DEFAULT 'office',
  `review_status`     ENUM('approved','pending_review','rejected') NOT NULL DEFAULT 'approved',
  `completed_at`      TIMESTAMP    NULL,
  `completion_notes`  TEXT         NULL,
  `created_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wo_job`    (`job_id`),
  KEY `idx_wo_user`   (`assigned_user_id`),
  KEY `idx_wo_review` (`review_status`),
  CONSTRAINT `fk_wo_job`  FOREIGN KEY (`job_id`)           REFERENCES `jobs`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wo_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `work_order_photos` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `work_order_id`  INT UNSIGNED  NOT NULL,
  `file_path`      VARCHAR(500)  NOT NULL,
  `caption`        VARCHAR(200)  NULL,
  `uploaded_by`    INT UNSIGNED  NULL,
  `uploaded_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_wop_wo`   FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wop_user` FOREIGN KEY (`uploaded_by`)   REFERENCES `users`       (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `time_entries` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`          INT UNSIGNED  NOT NULL,
  `job_id`           INT UNSIGNED  NULL,
  `work_order_id`    INT UNSIGNED  NULL,
  `status_label`     ENUM('traveling','working','lunch','material_run','waiting','done') NULL,
  `cost_category`    ENUM('travel','direct_labor','paid_lunch','material_pickup','waiting_time','admin_photos','rework','day_end') NULL,
  `start_time`       TIMESTAMP     NOT NULL,
  `end_time`         TIMESTAMP     NULL,
  `start_lat`        DECIMAL(10,7) NULL,
  `start_lng`        DECIMAL(10,7) NULL,
  `end_lat`          DECIMAL(10,7) NULL,
  `end_lng`          DECIMAL(10,7) NULL,
  `gps_accuracy`     FLOAT         NULL,
  `within_radius`    TINYINT(1)    NULL,
  `approval_status`  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approved_by`      INT UNSIGNED  NULL,
  `approved_at`      TIMESTAMP     NULL,
  `rejection_reason` TEXT          NULL,
  `notes`            TEXT          NULL,
  `created_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_te_user_time` (`user_id`, `start_time`),
  KEY `idx_te_job`       (`job_id`),
  KEY `idx_te_open`      (`user_id`, `end_time`),
  KEY `idx_te_approval`  (`approval_status`),
  CONSTRAINT `fk_te_user`     FOREIGN KEY (`user_id`)       REFERENCES `users`       (`id`),
  CONSTRAINT `fk_te_job`      FOREIGN KEY (`job_id`)        REFERENCES `jobs`        (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_te_wo`       FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_te_approver` FOREIGN KEY (`approved_by`)   REFERENCES `users`       (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pay_periods` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `start_date` DATE         NOT NULL,
  `end_date`   DATE         NOT NULL,
  `status`     ENUM('open','closed','processed') NOT NULL DEFAULT 'open',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pp_dates` (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pay_adjustments` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NOT NULL,
  `period_start` DATE        NOT NULL,
  `period_end`   DATE        NOT NULL,
  `type`        ENUM('bonus','gas_allowance','reimbursement','adjustment') NOT NULL,
  `amount`      DECIMAL(8,2) NOT NULL,
  `description` VARCHAR(200) NULL,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_padj_user` (`user_id`, `period_start`),
  CONSTRAINT `fk_padj_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_padj_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `invoices` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `job_id`         INT UNSIGNED   NOT NULL,
  `work_order_id`  INT UNSIGNED   NULL,
  `invoice_number` VARCHAR(50)    NOT NULL,
  `amount`         DECIMAL(10,2)  NOT NULL,
  `due_date`       DATE           NULL,
  `status`         ENUM('draft','sent','paid','voided') NOT NULL DEFAULT 'draft',
  `notes`          TEXT           NULL,
  `created_at`     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_number` (`invoice_number`),
  CONSTRAINT `fk_inv_job` FOREIGN KEY (`job_id`)        REFERENCES `jobs`        (`id`),
  CONSTRAINT `fk_inv_wo`  FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- Seed: first admin account (update phone/name before importing)
INSERT INTO `users` (`name`, `phone`, `role`, `pay_type`, `pay_rate`)
VALUES ('Admin', '+15550000000', 'admin', 'w2', 0.00);
