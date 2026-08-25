-- Migration: contractors should never be assigned to a location
-- Contractors invoice per job and never clock in, so a default job site or
-- a job_assignments row for one is always stale/incorrect data — this was
-- previously settable by mistake (no role check existed). Code now prevents
-- it going forward; this is a one-time cleanup of anything already set.
-- Run in phpMyAdmin on production after deploying the API + frontend files.

UPDATE `users`
  SET `default_job_id` = NULL
  WHERE `role` = 'contractor' AND `default_job_id` IS NOT NULL;

DELETE ja FROM `job_assignments` ja
  JOIN `users` u ON u.id = ja.user_id
  WHERE u.role = 'contractor';
