-- Migration: admin-driven contractor invoice management.
--
-- contractor_invoices predates this repo's migration history (it was never
-- captured in a migration file, only reverse-engineered from the PHP that
-- reads/writes it) — CREATE TABLE IF NOT EXISTS is a no-op on production,
-- where it already exists, and brings any environment missing it (like a
-- fresh local dev DB) up to the same shape before the ALTER below runs.
--
-- Run in phpMyAdmin on production after deploying API files.

CREATE TABLE IF NOT EXISTS `contractor_invoices` (
  `id`                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`             INT UNSIGNED  NOT NULL,
  `period_start`        DATE          NULL DEFAULT NULL,
  `period_end`          DATE          NULL DEFAULT NULL,
  `file_path`           VARCHAR(255)  NOT NULL,
  `file_original_name`  VARCHAR(255)  NOT NULL,
  `file_type`           VARCHAR(20)   NOT NULL,
  `amount`              DECIMAL(10,2) NULL DEFAULT NULL,
  `status`              ENUM('submitted','under_review','check_ready','paid') NOT NULL DEFAULT 'submitted',
  `admin_note`          VARCHAR(255)  NULL DEFAULT NULL,
  `reviewed_by`         INT UNSIGNED  NULL DEFAULT NULL,
  `reviewed_at`         TIMESTAMP     NULL DEFAULT NULL,
  `created_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ci_user`   (`user_id`),
  KEY `idx_ci_status` (`status`),
  CONSTRAINT `fk_ci_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ci_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Now the two admin-management fields this migration actually adds: which
-- project estimate the invoice is being paid against, and the contractor's
-- own invoice number as written on their submitted document (if they used
-- one — not every picture/receipt has one).
ALTER TABLE `contractor_invoices`
  ADD COLUMN `estimate_id`    INT UNSIGNED NULL DEFAULT NULL AFTER `user_id`,
  ADD COLUMN `invoice_number` VARCHAR(100) NULL DEFAULT NULL AFTER `estimate_id`,
  ADD CONSTRAINT `fk_ci_estimate` FOREIGN KEY (`estimate_id`) REFERENCES `job_estimates` (`id`) ON DELETE SET NULL;
