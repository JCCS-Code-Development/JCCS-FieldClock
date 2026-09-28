-- Migration: lock an employee out of clocking back in once a paid lunch runs
-- past the 1-hour cap, until an admin clears it. Paired with application-level
-- enforcement in api/timeclock/_helper.php (enforceLunchCutoff).
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `users`
  ADD COLUMN `lunch_locked_at`       TIMESTAMP    NULL DEFAULT NULL AFTER `login_locked_until`,
  ADD COLUMN `lunch_locked_entry_id` INT UNSIGNED NULL DEFAULT NULL AFTER `lunch_locked_at`;
