-- Migration: add preferred_language to users + travel_reminder_sent_at to time_entries
-- Run in phpMyAdmin on production after deploying API files

ALTER TABLE `users`
  ADD COLUMN `preferred_language` ENUM('en','es') NOT NULL DEFAULT 'en' AFTER `pay_structure`;

ALTER TABLE `time_entries`
  ADD COLUMN `travel_reminder_sent_at` TIMESTAMP NULL DEFAULT NULL AFTER `within_radius`;
