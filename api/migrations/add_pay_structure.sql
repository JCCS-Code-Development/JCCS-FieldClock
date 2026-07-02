-- Migration: add pay_structure column to users
-- Run in phpMyAdmin on production

ALTER TABLE `users`
  ADD COLUMN `pay_structure` ENUM('hourly','salary') NOT NULL DEFAULT 'hourly'
  AFTER `pay_rate`;
