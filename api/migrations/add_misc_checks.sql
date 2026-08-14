-- Migration: one-off adjustment/compensation checks that aren't tied to a
-- regular pay period (W-2/1099 payroll) or a contractor invoice — e.g. a
-- one-time bonus for a provider, a corrective payment to a 1099 employee,
-- or an extra compensation check for a contractor outside their normal
-- invoice cycle.
--
-- payee_type picks which of the three payee models this check belongs to;
-- exactly one of vendor_id/user_id is set to match (vendor_id for
-- 'vendor', user_id for 'employee' or 'contractor' — both of those are
-- `users` rows, payee_type just tells the UI/print stub which label and
-- picker to use). payee_name/payee_address are snapshotted at creation —
-- same convention as check_registry.payee_name — so a later vendor/user
-- rename or deactivation never changes what a historical check shows.
--
-- Run in phpMyAdmin on production after deploying API files.

CREATE TABLE IF NOT EXISTS `misc_checks` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `payee_type`    ENUM('vendor','employee','contractor') NOT NULL,
  `vendor_id`     INT UNSIGNED  NULL DEFAULT NULL,
  `user_id`       INT UNSIGNED  NULL DEFAULT NULL,
  `payee_name`    VARCHAR(150)  NOT NULL,
  `payee_address` VARCHAR(255)  NULL DEFAULT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `reason`        VARCHAR(255)  NOT NULL,
  `check_date`    DATE          NOT NULL,
  `status`        ENUM('pending','issued') NOT NULL DEFAULT 'pending',
  `created_by`    INT UNSIGNED  NOT NULL,
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mc_payee_type` (`payee_type`),
  KEY `idx_mc_status` (`status`),
  CONSTRAINT `fk_mc_vendor`  FOREIGN KEY (`vendor_id`)  REFERENCES `vendors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mc_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mc_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
