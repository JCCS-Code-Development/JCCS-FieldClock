-- Migration: capture the estimate # and job/location exactly as typed on
-- the invoice, separately from estimate_id (which only gets set when that
-- typed number actually resolves to an existing job_estimates row).
--
-- Why both a raw text field and a relational FK: admins fill these in by
-- typing the estimate # first — if it matches a known estimate, the job/
-- location autofills (still editable) and estimate_id links properly so
-- the invoice shows up in that project's tracking on the Jobs page. If it
-- doesn't match anything yet (new estimate not entered into the system),
-- there's nothing to link to, but the invoice still needs to remember
-- what was actually typed.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `contractor_invoices`
  ADD COLUMN `estimate_number` VARCHAR(50)  NULL DEFAULT NULL AFTER `estimate_id`,
  ADD COLUMN `job_location`    VARCHAR(255) NULL DEFAULT NULL AFTER `estimate_number`;
