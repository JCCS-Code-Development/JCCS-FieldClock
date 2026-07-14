-- Migration: track when an employee was deactivated
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `users`
  ADD COLUMN `deactivated_at` TIMESTAMP NULL DEFAULT NULL AFTER `is_active`;
