-- Migration: existing-vs-new job location + Work Order/Estimate visit categories
-- Replaces the old visit_type picker (kept for history, no longer written to).
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `jobs`
  MODIFY COLUMN `status` ENUM('active','on_hold','completed','cancelled','pending_review') NOT NULL DEFAULT 'active',
  ADD COLUMN `registered_by` INT UNSIGNED NULL DEFAULT NULL AFTER `notes`,
  ADD COLUMN `is_recurring_maintenance` TINYINT(1) NOT NULL DEFAULT 0 AFTER `registered_by`,
  ADD CONSTRAINT `fk_jobs_registered_by` FOREIGN KEY (`registered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

ALTER TABLE `time_entries`
  ADD COLUMN `visit_category`    ENUM('work_order','estimate','regular','estimate_unknown','add_on','emergency','warranty') NULL DEFAULT NULL AFTER `estimate_id`,
  ADD COLUMN `estimate_subtype`  ENUM('regular','add_on','emergency','warranty') NULL DEFAULT NULL AFTER `visit_category`,
  ADD COLUMN `work_order_number` VARCHAR(50)  NULL DEFAULT NULL AFTER `estimate_subtype`,
  ADD COLUMN `engineer_name`     VARCHAR(150) NULL DEFAULT NULL AFTER `work_order_number`,
  ADD COLUMN `visit_description` TEXT         NULL DEFAULT NULL AFTER `engineer_name`;
