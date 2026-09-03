-- ─────────────────────────────────────────────────────────────────────────────
-- Unified check production — Phase 1 (schema + backfill)
-- Run once in phpMyAdmin on the fieldclock production DB.
--
-- check_registry becomes the single table for every check we cut (payroll,
-- contractor payouts, vendors, one-offs). misc_checks and vendor_checks are
-- folded in here and retired in a later phase.
--
-- Status lifecycle: draft -> printed -> cleared -> voided
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New columns on check_registry ------------------------------------------------
ALTER TABLE `check_registry`
  ADD COLUMN `payee_type`    ENUM('employee','contractor','vendor','other') NOT NULL DEFAULT 'employee' AFTER `check_number`,
  ADD COLUMN `vendor_id`     INT UNSIGNED NULL AFTER `user_id`,
  ADD COLUMN `payee_address` VARCHAR(255) NULL AFTER `payee_name`,
  ADD COLUMN `memo`          VARCHAR(255) NULL AFTER `amount`,
  ADD COLUMN `source`        ENUM('payroll','contractor','vendor','donation','misc','manual') NOT NULL DEFAULT 'payroll' AFTER `status`,
  ADD COLUMN `void_reason`   TEXT NULL AFTER `source`;

ALTER TABLE `check_registry`
  ADD CONSTRAINT `fk_cr_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL;

-- check_number is blank until a check is actually printed
ALTER TABLE `check_registry`
  MODIFY COLUMN `check_number` VARCHAR(20) NULL;

-- period only applies to payroll / contractor checks
ALTER TABLE `check_registry`
  MODIFY COLUMN `pay_period_start` DATE NULL,
  MODIFY COLUMN `pay_period_end`   DATE NULL;

-- 2. Status enum: widen, remap, narrow ------------------------------------------
ALTER TABLE `check_registry`
  MODIFY COLUMN `status`
    ENUM('issued','voided','processed_online','processed_in_person','draft','printed','cleared')
    NOT NULL DEFAULT 'draft';

UPDATE `check_registry` SET `status` = 'printed' WHERE `status` = 'issued';
UPDATE `check_registry` SET `status` = 'cleared' WHERE `status` IN ('processed_online','processed_in_person');

ALTER TABLE `check_registry`
  MODIFY COLUMN `status`
    ENUM('draft','printed','cleared','voided') NOT NULL DEFAULT 'draft';

-- 3. Classify the rows already there (all were payroll) -----------------------
UPDATE `check_registry`
  SET `payee_type` = IF(`user_id` IS NOT NULL, 'employee', 'other'),
      `source`     = 'payroll';

-- 4. Fold in misc_checks -----------------------------------------------------------
INSERT INTO `check_registry`
  (`check_number`, `payee_type`, `user_id`, `vendor_id`, `payee_name`, `payee_address`,
   `amount`, `memo`, `pay_period_start`, `pay_period_end`, `issued_date`,
   `status`, `source`, `notes`, `created_by`, `created_at`)
SELECT
  NULL,
  mc.`payee_type`,
  mc.`user_id`,
  mc.`vendor_id`,
  mc.`payee_name`,
  mc.`payee_address`,
  mc.`amount`,
  mc.`reason`,
  NULL, NULL,
  mc.`check_date`,
  IF(mc.`status` = 'issued', 'printed', 'draft'),
  'misc',
  NULL,
  mc.`created_by`,
  mc.`created_at`
FROM `misc_checks` mc;

-- 5. Fold in vendor_checks -------------------------------------------------------
INSERT INTO `check_registry`
  (`check_number`, `payee_type`, `user_id`, `vendor_id`, `payee_name`, `payee_address`,
   `amount`, `memo`, `pay_period_start`, `pay_period_end`, `issued_date`,
   `status`, `source`, `notes`, `created_by`, `created_at`)
SELECT
  NULL,
  'vendor',
  NULL,
  vc.`vendor_id`,
  v.`name`,
  v.`address`,
  vc.`amount`,
  NULLIF(TRIM(CONCAT_WS(' — ', vc.`memo`, vc.`period_label`)), ''),
  NULL, NULL,
  vc.`check_date`,
  IF(vc.`status` = 'issued', 'printed', 'draft'),
  'vendor',
  NULL,
  vc.`created_by`,
  vc.`created_at`
FROM `vendor_checks` vc
JOIN `vendors` v ON v.`id` = vc.`vendor_id`;

-- 6. Link contractor invoices to the check that pays them ----------------------
ALTER TABLE `contractor_invoices`
  ADD COLUMN `check_id` INT UNSIGNED NULL AFTER `amount`,
  ADD CONSTRAINT `fk_ci_check` FOREIGN KEY (`check_id`) REFERENCES `check_registry` (`id`) ON DELETE SET NULL;
