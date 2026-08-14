-- Migration: track the planned weekly deduction amount and the date
-- deductions should start for each loan (separate from created_at, the
-- loan may be issued before deductions actually begin).
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `employee_loans`
  ADD COLUMN `weekly_deduction`     DECIMAL(10,2) NULL DEFAULT NULL AFTER `amount`,
  ADD COLUMN `deduction_start_date` DATE          NULL DEFAULT NULL AFTER `weekly_deduction`;
