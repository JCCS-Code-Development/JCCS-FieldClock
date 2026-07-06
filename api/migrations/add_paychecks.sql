CREATE TABLE IF NOT EXISTS paychecks (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NOT NULL,
  period_start DATE         NOT NULL,
  period_end   DATE         NOT NULL,
  amount       DECIMAL(10,2) NULL,
  status       ENUM('processing','available','picked_up') NOT NULL DEFAULT 'processing',
  notes        TEXT         NULL,
  created_by   INT          NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  available_at TIMESTAMP    NULL,
  picked_up_at TIMESTAMP    NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
