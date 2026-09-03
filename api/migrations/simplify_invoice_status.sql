-- ─────────────────────────────────────────────────────────────────────────────
-- Collapse contractor + vendor invoice status to draft / printed / voided.
--
--   draft   = unpaid (was submitted / under_review / check_ready)
--   printed = a check has been cut for it (was paid)
--   voided  = cancelled
--
-- Run after add_vendor_invoices.sql. Widen -> remap -> narrow, per table.
-- ─────────────────────────────────────────────────────────────────────────────

-- contractor_invoices ---------------------------------------------------------
ALTER TABLE `contractor_invoices`
  MODIFY COLUMN `status`
    ENUM('submitted','under_review','check_ready','paid','draft','printed','voided')
    NOT NULL DEFAULT 'draft';

UPDATE `contractor_invoices` SET `status` = 'printed' WHERE `status` = 'paid';
UPDATE `contractor_invoices` SET `status` = 'draft'
  WHERE `status` IN ('submitted','under_review','check_ready');

ALTER TABLE `contractor_invoices`
  MODIFY COLUMN `status` ENUM('draft','printed','voided') NOT NULL DEFAULT 'draft';

-- vendor_invoices -----------------------------------------------------------------
ALTER TABLE `vendor_invoices`
  MODIFY COLUMN `status`
    ENUM('submitted','under_review','check_ready','paid','draft','printed','voided')
    NOT NULL DEFAULT 'draft';

UPDATE `vendor_invoices` SET `status` = 'printed' WHERE `status` = 'paid';
UPDATE `vendor_invoices` SET `status` = 'draft'
  WHERE `status` IN ('submitted','under_review','check_ready');

ALTER TABLE `vendor_invoices`
  MODIFY COLUMN `status` ENUM('draft','printed','voided') NOT NULL DEFAULT 'draft';
