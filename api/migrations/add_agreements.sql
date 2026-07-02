-- Run in phpMyAdmin on production DB: fieldclock

CREATE TABLE IF NOT EXISTS employee_agreements (
  id             INT            AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  agreement_type VARCHAR(40)    NOT NULL,
  form_data      JSON           NULL,
  signature_data MEDIUMTEXT     NULL,
  signed_at      TIMESTAMP      NULL,
  ip_address     VARCHAR(45)    NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_type (user_id, agreement_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
