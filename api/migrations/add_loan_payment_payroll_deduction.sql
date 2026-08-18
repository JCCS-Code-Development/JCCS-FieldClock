-- Migration: 1099 employees' loan repayments are withheld automatically from
-- their next 1099 check (see Payroll.jsx's net-pay calc, which subtracts
-- getPeriodLoanTotals() from the check amount) — there's no separate cash/
-- check/transfer event to prove, unlike W-2 loans, which can't be deducted
-- from a check at all (W-2 base pay runs through ADP, outside this app) and
-- so genuinely need a receipt documenting how the employee paid it back.
--
-- Adds 'payroll_deduction' as a fourth payment_method so recording a 1099
-- loan payment doesn't ask for a method/receipt it has no way to produce.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `loan_payments`
  MODIFY COLUMN `payment_method` ENUM('cash','check','transfer','payroll_deduction') NOT NULL DEFAULT 'transfer';

-- Backfill: every existing payment against a 1099 employee's loan was forced
-- through the old cash/check/transfer picker (defaulting to 'transfer') even
-- though nothing was actually transferred — it was withheld from their 1099
-- check. Reclassify those, and clear the reference number/receipt fields
-- that were only ever filled in to satisfy the old (incorrect) requirement.
-- Note: this does not delete the actual receipt files under
-- api/uploads/loan-receipts/<loan_id>/ on disk — they're just orphaned now,
-- safe to remove by hand if you want to reclaim the space, not required.
UPDATE `loan_payments` lp
JOIN `employee_loans` l ON l.id = lp.loan_id
JOIN `users` u ON u.id = l.user_id
SET lp.payment_method = 'payroll_deduction',
    lp.reference_number = NULL,
    lp.receipt_file_path = NULL,
    lp.receipt_file_original_name = NULL
WHERE u.pay_type <> 'w2';
