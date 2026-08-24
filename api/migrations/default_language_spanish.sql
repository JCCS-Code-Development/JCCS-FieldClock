-- Migration: make Spanish the default preferred_language for new users
-- Matches the frontend's new default (src/i18n.js) — a brand-new employee
-- account, which has no way to pick a language at creation time, should
-- land in Spanish after login instead of snapping back to English.
-- Does NOT touch any existing user's already-stored preference.
-- Run in phpMyAdmin on production after deploying the frontend change.

ALTER TABLE `users`
  MODIFY COLUMN `preferred_language` ENUM('en','es') NOT NULL DEFAULT 'es';
