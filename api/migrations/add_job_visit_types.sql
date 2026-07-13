-- Migration: add job_estimates table + visit_type/estimate_id on time_entries
-- Run in phpMyAdmin on production after deploying API files

CREATE TABLE IF NOT EXISTS `job_estimates` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id`          INT UNSIGNED NOT NULL,
  `estimate_number` VARCHAR(50)  NOT NULL,
  `description`     VARCHAR(255) NULL DEFAULT NULL,
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`      INT UNSIGNED NOT NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_je_job` (`job_id`),
  CONSTRAINT `fk_je_job`     FOREIGN KEY (`job_id`)     REFERENCES `jobs`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_je_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `time_entries`
  ADD COLUMN `visit_type`  ENUM('estimate','emergency','new_work_order','warranty','other') NULL DEFAULT NULL AFTER `job_id`,
  ADD COLUMN `estimate_id` INT UNSIGNED NULL DEFAULT NULL AFTER `visit_type`,
  ADD KEY `idx_te_visit_type` (`visit_type`),
  ADD CONSTRAINT `fk_te_estimate` FOREIGN KEY (`estimate_id`) REFERENCES `job_estimates` (`id`) ON DELETE SET NULL;
