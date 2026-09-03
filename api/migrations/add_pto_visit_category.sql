-- ─────────────────────────────────────────────────────────────────────────────
-- Add "PTO" (paid time off) as a timesheet visit category.
-- Shows amber in the admin timesheet, no job / engineer / description required.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `time_entries`
  MODIFY COLUMN `visit_category`
    ENUM('work_order','estimate','regular','estimate_unknown','add_on','emergency','warranty','pto')
    NULL DEFAULT NULL;
