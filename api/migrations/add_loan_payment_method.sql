-- Migration: track how each loan payment was made (cash/check/transfer),
-- an optional reference number, and a receipt image for check/transfer
-- payments (Zelle transfers etc. — W-2 employees typically don't pay loan
-- deductions in cash the way 1099 workers might).
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `loan_payments`
  ADD COLUMN `payment_method`              ENUM('cash','check','transfer') NOT NULL DEFAULT 'transfer' AFTER `amount`,
  ADD COLUMN `reference_number`            VARCHAR(100) NULL DEFAULT NULL AFTER `payment_method`,
  ADD COLUMN `receipt_file_path`           VARCHAR(255) NULL DEFAULT NULL AFTER `reference_number`,
  ADD COLUMN `receipt_file_original_name`  VARCHAR(255) NULL DEFAULT NULL AFTER `receipt_file_path`;
