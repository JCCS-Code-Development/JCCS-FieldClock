-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor invoices — the AP inbox for vendors, mirroring contractor_invoices.
--
-- Register a vendor's bill, review it, mark it "check_ready", then pay one or
-- more of them with a single check from the Checks hub (source = 'vendor').
-- Paying links vendor_invoices.check_id -> check_registry.id and flips the
-- invoice to 'paid'; voiding that check releases it back to 'check_ready'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `vendor_invoices` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vendor_id`          INT UNSIGNED NOT NULL,
  `invoice_number`     VARCHAR(100) NULL,
  `memo`               VARCHAR(255) NULL,
  `invoice_date`       DATE NULL,
  `period_start`       DATE NULL,
  `period_end`         DATE NULL,
  `file_path`          VARCHAR(255) NULL,
  `file_original_name` VARCHAR(255) NULL,
  `file_type`          VARCHAR(20)  NULL,
  `amount`             DECIMAL(10,2) NULL,
  `check_id`           INT UNSIGNED NULL,
  `status`             ENUM('submitted','under_review','check_ready','paid') NOT NULL DEFAULT 'submitted',
  `admin_note`         VARCHAR(255) NULL,
  `created_by`         INT UNSIGNED NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vi_status` (`status`),
  KEY `idx_vi_vendor` (`vendor_id`),
  KEY `idx_vi_check`  (`check_id`),
  CONSTRAINT `fk_vi_vendor`  FOREIGN KEY (`vendor_id`)  REFERENCES `vendors` (`id`)        ON DELETE CASCADE,
  CONSTRAINT `fk_vi_check`   FOREIGN KEY (`check_id`)   REFERENCES `check_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vi_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
