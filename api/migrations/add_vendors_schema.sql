-- Migration: `vendors` and `vendor_checks` predate this repo's migration
-- history — like contractor_invoices before it, they were only ever
-- reverse-engineered from the PHP that reads/writes them
-- (api/vendors/*.php, api/vendor-checks/*.php), never captured in a
-- migration file. CREATE TABLE IF NOT EXISTS is a no-op on production,
-- where both already exist, and brings any environment missing them (like
-- a fresh local dev DB) up to the same shape. Needed here specifically so
-- add_misc_checks.sql's FK to `vendors` has something to reference.
--
-- Run in phpMyAdmin on production after deploying API files (should be a
-- no-op there, but run it anyway in case production's shape has drifted).

CREATE TABLE IF NOT EXISTS `vendors` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(150)  NOT NULL,
  `type`         ENUM('supplier','provider') NOT NULL,
  `contact_name` VARCHAR(150)  NULL DEFAULT NULL,
  `email`        VARCHAR(150)  NULL DEFAULT NULL,
  `phone`        VARCHAR(30)   NULL DEFAULT NULL,
  `address`      VARCHAR(255)  NULL DEFAULT NULL,
  `tax_id`       VARCHAR(30)   NULL DEFAULT NULL,
  `notes`        TEXT          NULL DEFAULT NULL,
  `is_active`    TINYINT(1)    NOT NULL DEFAULT 1,
  `created_by`   INT UNSIGNED  NULL DEFAULT NULL,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_v_active` (`is_active`),
  CONSTRAINT `fk_v_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vendor_checks` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `vendor_id`    INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL,
  `memo`         VARCHAR(255)  NULL DEFAULT NULL,
  `check_date`   DATE          NOT NULL,
  `period_label` VARCHAR(100)  NULL DEFAULT NULL,
  `status`       ENUM('pending','issued') NOT NULL DEFAULT 'pending',
  `created_by`   INT UNSIGNED  NOT NULL,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vc_vendor` (`vendor_id`),
  KEY `idx_vc_status` (`status`),
  CONSTRAINT `fk_vc_vendor`  FOREIGN KEY (`vendor_id`)  REFERENCES `vendors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vc_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
