-- Migration: add a second meal break ("Dinner") alongside Lunch. Same rules
-- as Lunch (paid, capped at 1 continuous hour, auto clocked-out + locked if
-- exceeded, one per day) but only available once an employee has worked over
-- 10 hours today — see api/timeclock/_helper.php (getWorkedMinutesToday,
-- DINNER_UNLOCK_MINUTES) and api/timeclock/dinner.php.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `time_entries`
  MODIFY COLUMN `status_label`  ENUM('working','lunch','dinner','material_run','waiting','done') NULL,
  MODIFY COLUMN `cost_category` ENUM('direct_labor','paid_lunch','paid_dinner','material_pickup','waiting_time','admin_photos','rework','day_end') NULL;
