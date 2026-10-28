-- Migration: signed loan pagarés (promissory notes). Every new loan starts
-- unsigned and only becomes 'active' once the borrower signs and an admin
-- countersigns in the app (api/loans/sign.php, countersign.php). The signed
-- text, both signatures and the audit trail live in loan_notes — one row per
-- document: the original note, a signed amendment (e.g. raising the weekly
-- amount), or a 're-paper' note for a loan that predates this feature.
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `employee_loans`
  MODIFY COLUMN `status` ENUM('pending_signature','pending_countersign','active','paid_off','void') NOT NULL DEFAULT 'pending_signature',
  ADD COLUMN `installments`          SMALLINT UNSIGNED NULL DEFAULT NULL AFTER `weekly_deduction`,
  ADD COLUMN `limit_override_reason` VARCHAR(255)      NULL DEFAULT NULL AFTER `description`,
  ADD COLUMN `limit_override_by`     INT UNSIGNED      NULL DEFAULT NULL AFTER `limit_override_reason`,
  ADD COLUMN `separated_at`          DATE              NULL DEFAULT NULL AFTER `limit_override_by`,
  ADD COLUMN `final_pay_deduction`   DECIMAL(10,2)     NULL DEFAULT NULL AFTER `separated_at`,
  ADD COLUMN `balance_due_date`      DATE              NULL DEFAULT NULL AFTER `final_pay_deduction`,
  ADD COLUMN `late_notice_at`        TIMESTAMP         NULL DEFAULT NULL AFTER `balance_due_date`,
  ADD COLUMN `demand_letter_at`      TIMESTAMP         NULL DEFAULT NULL AFTER `late_notice_at`;

-- No ON DELETE CASCADE (on purpose) — a signed note must survive even if
-- the loan row is ever removed. Keep signed notes 6 years after payoff.
CREATE TABLE `loan_notes` (
  `id`                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `loan_id`                INT UNSIGNED  NOT NULL,
  `kind`                   ENUM('original','amendment','repaper') NOT NULL DEFAULT 'original',
  `variant`                ENUM('w2','1099') NOT NULL,
  `language`               ENUM('en','es')   NOT NULL,
  `principal`              DECIMAL(10,2) NOT NULL,
  `weekly_amount`          DECIMAL(10,2) NOT NULL,
  `installments`           SMALLINT UNSIGNED NOT NULL,
  `first_due_date`         DATE          NOT NULL,
  `note_text_en`           MEDIUMTEXT    NOT NULL,
  `note_text_es`           MEDIUMTEXT    NOT NULL,
  `note_hash`              CHAR(64)      NOT NULL,
  `borrower_signature`     MEDIUMTEXT    NULL,
  `borrower_signed_at`     TIMESTAMP     NULL DEFAULT NULL,
  `borrower_ip`            VARCHAR(45)   NULL,
  `borrower_user_agent`    VARCHAR(255)  NULL,
  `esign_consent_at`       TIMESTAMP     NULL DEFAULT NULL,
  `company_signature`      MEDIUMTEXT    NULL,
  `company_signer_id`      INT UNSIGNED  NULL,
  `company_signed_at`      TIMESTAMP     NULL DEFAULT NULL,
  `emailed_at`             TIMESTAMP     NULL DEFAULT NULL,
  `created_by`             INT UNSIGNED  NOT NULL,
  `created_at`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ln_loan` (`loan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- An admin's saved signature, drawn once and reused for one-click
-- countersigning (api/loans/my-signature.php, countersign.php). Kept per
-- admin, not per company, so every countersigned note still records which
-- person signed for JCCS Services LLC.
ALTER TABLE `users`
  ADD COLUMN `saved_signature` MEDIUMTEXT NULL DEFAULT NULL;
