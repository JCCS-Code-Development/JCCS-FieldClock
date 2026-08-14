-- Migration: track pay-rate changes over time (raises, structure changes)
-- Run in phpMyAdmin on production after deploying API files.
--
-- Model: one row per rate that ever took effect, keyed by the date it started
-- applying (effective_date). A given row's range runs from its effective_date
-- up to (but not including) the next row's effective_date for that user, or
-- through today if it's the most recent — computed at read time, not stored,
-- so there's no start/end pair to keep in sync.

CREATE TABLE IF NOT EXISTS `salary_history` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED  NOT NULL,
  `pay_rate`       DECIMAL(10,2) NOT NULL,
  `pay_structure`  ENUM('hourly','salary') NOT NULL,
  `effective_date` DATE          NOT NULL,
  `note`           VARCHAR(255)  NULL DEFAULT NULL,
  `created_by`     INT UNSIGNED  NULL DEFAULT NULL,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sh_user_effective` (`user_id`, `effective_date`),
  CONSTRAINT `fk_sh_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sh_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill: one entry per admin/employee's current rate (contractors are paid
-- via invoices, not pay_rate — excluded), dated to when their record was
-- created since that's the best approximation available for pre-existing
-- data. created_by is left NULL (system backfill, not a specific admin
-- action) and it's noted as such. Skips anyone who somehow already has a
-- history row, so this is safe to re-run.
INSERT INTO `salary_history` (`user_id`, `pay_rate`, `pay_structure`, `effective_date`, `note`, `created_by`)
SELECT u.id, u.pay_rate, u.pay_structure, DATE(u.created_at),
       'Backfilled: rate on file before Salary History tracking began', NULL
FROM `users` u
WHERE u.role IN ('admin', 'employee')
  AND u.pay_rate IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `salary_history` sh WHERE sh.user_id = u.id);
