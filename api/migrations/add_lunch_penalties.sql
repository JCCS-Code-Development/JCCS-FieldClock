-- Migration: admin-applied "no lunch registered" penalty — deducts paid time
-- (1 hour) from a single work day. Suggested on the admin Timesheets page for
-- any day with 6+ hours worked and no Lunch entry; only ever applied by an
-- admin clicking Apply, never automatically. Subtracted from paid hours in
-- api/payroll/summary.php, my-pay.php and annual-summary.php.
-- Run in phpMyAdmin on production after deploying API files.

CREATE TABLE `lunch_penalties` (
  `id`         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED      NOT NULL,
  `work_date`  DATE              NOT NULL,
  `minutes`    SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `created_by` INT UNSIGNED      NULL,
  `created_at` TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lpen_user_date` (`user_id`, `work_date`),
  CONSTRAINT `fk_lpen_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
