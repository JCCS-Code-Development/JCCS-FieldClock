-- One-off fix: flip currently-open "traveling" entries to "working".
-- Standalone from remove_traveling_status.sql — this does NOT touch the
-- status_label/cost_category ENUM or drop travel_reminder_sent_at, so it's
-- safe to run on its own before the full migration.
-- Run in phpMyAdmin on production.

-- 1) Check first — review who this affects before updating.
SELECT te.id, u.name, te.status_label, te.cost_category, te.start_time
FROM time_entries te
JOIN users u ON u.id = te.user_id
WHERE te.end_time IS NULL AND te.status_label = 'traveling';

-- 2) Once you've confirmed the rows above look right, run this to fix them.
UPDATE time_entries
  SET status_label = 'working', cost_category = 'direct_labor'
  WHERE end_time IS NULL AND status_label = 'traveling';
