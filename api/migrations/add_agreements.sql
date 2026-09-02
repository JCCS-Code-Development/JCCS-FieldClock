-- Run in phpMyAdmin on production DB: fieldclock
-- Backs the document-signing feature (At-Will, non-solicitation, I-9, W-4,
-- emergency contact, etc.). Without this table, Sign & Submit fails with
-- "Table 'fieldclock.employee_agreements' doesn't exist".
--
-- user_id / id are INT UNSIGNED to match users.id — a plain INT here makes
-- the foreign key fail with "Referencing column ... are incompatible".

CREATE TABLE IF NOT EXISTS employee_agreements (
  id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED   NOT NULL,
  agreement_type VARCHAR(40)    NOT NULL,
  form_data      JSON           NULL,
  signature_data MEDIUMTEXT     NULL,
  signed_at      TIMESTAMP      NULL,
  ip_address     VARCHAR(45)    NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_type (user_id, agreement_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
