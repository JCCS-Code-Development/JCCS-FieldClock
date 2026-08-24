-- Migration: remove the deprecated "traveling" employee status
-- The employee-facing traveling/arrival clock-in flow was already replaced
-- by GPS within_radius flagging (see day-start.php / ClockPanel.jsx). This
-- drops the now-dead 'traveling'/'travel' enum values and the unused
-- travel_reminder_sent_at reminder column left over from that old flow.
-- Run in phpMyAdmin on production after deploying API + frontend files.

UPDATE `time_entries`
  SET `status_label` = 'working', `cost_category` = 'direct_labor'
  WHERE `status_label` = 'traveling' OR `cost_category` = 'travel';

ALTER TABLE `time_entries`
  MODIFY COLUMN `status_label`  ENUM('working','lunch','material_run','waiting','done') NULL,
  MODIFY COLUMN `cost_category` ENUM('direct_labor','paid_lunch','material_pickup','waiting_time','admin_photos','rework','day_end') NULL,
  DROP COLUMN `travel_reminder_sent_at`;
