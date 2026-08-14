-- Migration: track when the loan disbursement check (the check that hands
-- the employee the loan principal, separate from loan_payments which are
-- deductions coming back) was printed.
--
-- Nullable, set the first time "Print Check" is used on a loan — not a
-- pending/issued status pair, since re-printing (e.g. stock jammed) should
-- stay available without needing to "unmark" anything first.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `employee_loans`
  ADD COLUMN `check_printed_at` TIMESTAMP NULL DEFAULT NULL AFTER `deduction_start_date`;
