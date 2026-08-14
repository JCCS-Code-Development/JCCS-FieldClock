-- Migration: mailing address per user — used for printing contractor checks
-- (name/address shows through a windowed envelope), but available to any
-- role.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `users`
  ADD COLUMN `address` VARCHAR(255) NULL DEFAULT NULL AFTER `phone`;
