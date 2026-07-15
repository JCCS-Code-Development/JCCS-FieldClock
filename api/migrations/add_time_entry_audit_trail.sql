-- Migration: audit trail for time_entries — who/what created or changed each
-- clock entry, and the prior + new values on every create/update/delete.
-- Run in phpMyAdmin on production.

ALTER TABLE `time_entries`
  ADD COLUMN `created_by`     INT UNSIGNED NULL AFTER `user_id`,
  ADD COLUMN `created_via`    VARCHAR(40)  NULL AFTER `created_by`,
  ADD COLUMN `last_edited_by` INT UNSIGNED NULL AFTER `notes`,
  ADD COLUMN `last_edited_at` TIMESTAMP    NULL AFTER `last_edited_by`;

-- No FK on entry_id (on purpose) — history must survive even if the entry
-- itself is later deleted, so a deletion's audit record is never lost.
CREATE TABLE `time_entry_history` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entry_id`   INT UNSIGNED NOT NULL,
  `action`     ENUM('create','update','delete') NOT NULL,
  `changed_by` INT UNSIGNED NULL,
  `source`     VARCHAR(40) NOT NULL,
  `old_values` JSON NULL,
  `new_values` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_teh_entry` (`entry_id`),
  KEY `idx_teh_changed_by` (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
