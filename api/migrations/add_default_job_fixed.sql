-- Splits the per-employee default job site into two flavors:
--   default_job_fixed = 0  → "suggested" home base (pre-selected, but the app
--                            still surfaces other nearby jobs; used by field
--                            staff who get pulled to emergency jobs elsewhere)
--   default_job_fixed = 1  → "fixed" home base (staff who never move, e.g.
--                            office staff at Oficina). Still overridable at
--                            clock-in for the rare emergency.
-- Existing rows keep default_job_id; the flag defaults to 0 (suggested).
-- Run in phpMyAdmin on production after deploying the API files.

ALTER TABLE `users`
  ADD COLUMN `default_job_fixed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `default_job_id`;

-- The office-based staff who requested a permanent location are "fixed".
UPDATE `users`
SET `default_job_fixed` = 1
WHERE `default_job_id` IS NOT NULL
  AND `name` IN ('Juliana Restrepo', 'Julianna Camila Calle', 'Valentina Valencia');
