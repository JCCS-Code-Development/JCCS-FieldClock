-- Migration: add failed-login tracking to users, to rate-limit password guessing
-- Run in phpMyAdmin on production

ALTER TABLE `users`
  ADD COLUMN `failed_login_attempts` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `password_hash`,
  ADD COLUMN `login_locked_until` TIMESTAMP NULL AFTER `failed_login_attempts`;
