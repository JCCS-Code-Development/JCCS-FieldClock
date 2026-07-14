-- Adds a per-employee default job site (auto-selected at clock-in, still
-- overridable), and sets it to "Oficina" for the two office-based staff who
-- requested this. Also retroactively corrects their past time entries to
-- Oficina, since they've always actually clocked in from the office.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `users`
  ADD COLUMN `default_job_id` INT UNSIGNED NULL DEFAULT NULL AFTER `gas_weekly_allowance`,
  ADD CONSTRAINT `fk_users_default_job` FOREIGN KEY (`default_job_id`) REFERENCES `jobs` (`id`) ON DELETE SET NULL;

UPDATE `users`
SET `default_job_id` = (SELECT id FROM `jobs` WHERE name = 'Oficina' LIMIT 1)
WHERE name IN ('Juliana Restrepo', 'Julianna Camila Calle');

UPDATE `time_entries` te
JOIN `users` u ON u.id = te.user_id
SET te.job_id = (SELECT id FROM `jobs` WHERE name = 'Oficina' LIMIT 1)
WHERE u.name IN ('Juliana Restrepo', 'Julianna Camila Calle');
