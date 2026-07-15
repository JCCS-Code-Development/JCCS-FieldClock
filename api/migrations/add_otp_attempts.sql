-- Migration: add attempts column to otp_codes, to rate-limit code-guessing
-- Run in phpMyAdmin on production

ALTER TABLE `otp_codes`
  ADD COLUMN `attempts` INT UNSIGNED NOT NULL DEFAULT 0
  AFTER `code`;
