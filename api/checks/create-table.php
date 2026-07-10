<?php
// One-time migration runner — DELETE THIS FILE after running.
require_once __DIR__ . '/../config/db.php';

$pdo = getPDO();

$sql = "
CREATE TABLE IF NOT EXISTS check_registry (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  check_number       VARCHAR(20) NOT NULL,
  payee_name         VARCHAR(150) NOT NULL,
  user_id            INT NULL,
  amount             DECIMAL(10,2) NOT NULL DEFAULT 0,
  pay_period_start   DATE NOT NULL,
  pay_period_end     DATE NOT NULL,
  issued_date        DATE NOT NULL,
  status             ENUM('issued','voided','processed_online','processed_in_person') NOT NULL DEFAULT 'issued',
  status_updated_at  TIMESTAMP NULL,
  status_updated_by  INT NULL,
  notes              TEXT,
  created_by         INT NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_check_number (check_number),
  KEY idx_status       (status),
  KEY idx_issued_date  (issued_date),
  KEY idx_user_id      (user_id),
  CONSTRAINT fk_cr_user    FOREIGN KEY (user_id)           REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_updated FOREIGN KEY (status_updated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_created FOREIGN KEY (created_by)        REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
";

try {
    $pdo->exec($sql);
    echo '<b style="color:green">✓ check_registry table created (or already exists).</b><br>DELETE this file from the server now.';
} catch (PDOException $e) {
    http_response_code(500);
    echo '<b style="color:red">✗ Error: ' . htmlspecialchars($e->getMessage()) . '</b>';
}
