-- Migration: link paychecks to their printed check + add a voided state
-- Run in phpMyAdmin on production after deploying API files

ALTER TABLE `paychecks`
  MODIFY COLUMN `status` ENUM('processing','available','picked_up','voided') NOT NULL DEFAULT 'processing';

ALTER TABLE `paychecks`
  ADD COLUMN `check_registry_id` INT UNSIGNED NULL DEFAULT NULL AFTER `amount`,
  ADD CONSTRAINT `fk_pc_check` FOREIGN KEY (`check_registry_id`) REFERENCES `check_registry` (`id`) ON DELETE SET NULL;

ALTER TABLE `paychecks`
  ADD COLUMN `void_reason` TEXT NULL DEFAULT NULL AFTER `status`;
