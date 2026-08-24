-- Migration: remove the deprecated "traveling" employee status
-- The employee-facing traveling/arrival clock-in flow was already replaced
-- by GPS within_radius flagging (see day-start.php / ClockPanel.jsx). This
-- drops the now-dead 'traveling'/'travel' enum values.
-- Run in phpMyAdmin on production after deploying API + frontend files.
--
-- Note: this originally also dropped a travel_reminder_sent_at column, but
-- that column (from add_language_and_reminders.sql) was never actually
-- applied on production, so there was nothing to drop — removed here to
-- match what was actually run. If your DB does have that column (e.g. a
-- fresh local setup that ran every migration in order), dropping it is
-- still fine to do by hand; it's unused either way.

UPDATE `time_entries`
  SET `status_label` = 'working', `cost_category` = 'direct_labor'
  WHERE `status_label` = 'traveling' OR `cost_category` = 'travel';

ALTER TABLE `time_entries`
  MODIFY COLUMN `status_label`  ENUM('working','lunch','material_run','waiting','done') NULL,
  MODIFY COLUMN `cost_category` ENUM('direct_labor','paid_lunch','material_pickup','waiting_time','admin_photos','rework','day_end') NULL;
