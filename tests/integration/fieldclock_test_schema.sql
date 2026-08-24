SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE users (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(100) NOT NULL,
  email                 VARCHAR(180) NULL,
  phone                 VARCHAR(20) NULL,
  role                  ENUM('employee','admin','contractor') NOT NULL DEFAULT 'employee',
  pay_type              ENUM('w2','1099') NOT NULL DEFAULT 'w2',
  pay_rate              DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  pay_structure         ENUM('hourly','salary') NOT NULL DEFAULT 'hourly',
  preferred_language    ENUM('en','es') NOT NULL DEFAULT 'en',
  overtime_rate         DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  gas_weekly_allowance  DECIMAL(6,2) NULL,
  default_job_id        INT UNSIGNED NULL,
  password_hash         VARCHAR(255) NULL,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  login_locked_until    TIMESTAMP NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  deactivated_at        TIMESTAMP NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE refresh_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE jobs (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                   VARCHAR(150) NOT NULL,
  client_name            VARCHAR(150) NOT NULL,
  company                VARCHAR(150) NULL,
  address                TEXT NOT NULL,
  latitude               DECIMAL(10,7) NULL,
  longitude              DECIMAL(10,7) NULL,
  clock_in_radius_meters INT NOT NULL DEFAULT 300,
  status                 ENUM('active','on_hold','completed','cancelled','pending_review') NOT NULL DEFAULT 'active',
  notes                  TEXT NULL,
  registered_by          INT UNSIGNED NULL,
  is_recurring_maintenance TINYINT(1) NOT NULL DEFAULT 0,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jobs_status (status),
  CONSTRAINT fk_jobs_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
  ADD CONSTRAINT fk_users_default_job FOREIGN KEY (default_job_id) REFERENCES jobs(id) ON DELETE SET NULL;

CREATE TABLE job_assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id      INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_job_user (job_id, user_id),
  CONSTRAINT fk_ja_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ja_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE job_estimates (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id          INT UNSIGNED NOT NULL,
  estimate_number VARCHAR(50) NOT NULL,
  description     VARCHAR(255) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_je_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_je_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE time_entries (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED NOT NULL,
  created_by            INT UNSIGNED NULL,
  created_via           VARCHAR(40) NULL,
  job_id                INT UNSIGNED NULL,
  estimate_id           INT UNSIGNED NULL,
  visit_category        ENUM('work_order','estimate','regular','estimate_unknown','add_on','emergency','warranty') NULL,
  estimate_subtype      ENUM('regular','add_on','emergency','warranty') NULL,
  work_order_number     VARCHAR(50) NULL,
  engineer_name         VARCHAR(150) NULL,
  visit_description     TEXT NULL,
  status_label          ENUM('working','lunch','material_run','waiting','done') NULL,
  cost_category         ENUM('direct_labor','paid_lunch','material_pickup','waiting_time','admin_photos','rework','day_end') NULL,
  start_time            TIMESTAMP NOT NULL,
  end_time              TIMESTAMP NULL,
  start_lat             DECIMAL(10,7) NULL,
  start_lng             DECIMAL(10,7) NULL,
  end_lat               DECIMAL(10,7) NULL,
  end_lng               DECIMAL(10,7) NULL,
  gps_accuracy          FLOAT NULL,
  within_radius         TINYINT(1) NULL,
  approval_status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by           INT UNSIGNED NULL,
  approved_at           TIMESTAMP NULL,
  rejection_reason      TEXT NULL,
  notes                 TEXT NULL,
  last_edited_by        INT UNSIGNED NULL,
  last_edited_at        TIMESTAMP NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_te_user_time (user_id, start_time),
  KEY idx_te_open (user_id, end_time),
  CONSTRAINT fk_te_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_te_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
  CONSTRAINT fk_te_estimate FOREIGN KEY (estimate_id) REFERENCES job_estimates(id) ON DELETE SET NULL,
  CONSTRAINT fk_te_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE time_entry_history (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_id   INT UNSIGNED NOT NULL,
  action     ENUM('create','update','delete') NOT NULL,
  changed_by INT UNSIGNED NULL,
  source     VARCHAR(40) NOT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_teh_entry (entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE time_change_requests (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_id        INT UNSIGNED NOT NULL,
  requested_by    INT UNSIGNED NOT NULL,
  requested_start DATETIME NULL,
  requested_end   DATETIME NULL,
  reason          TEXT NOT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by     INT UNSIGNED NULL,
  reviewed_at     TIMESTAMP NULL,
  review_note     VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tcr_entry FOREIGN KEY (entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_tcr_user FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pay_adjustments (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  type         ENUM('bonus','gas_allowance','reimbursement','adjustment') NOT NULL,
  amount       DECIMAL(8,2) NOT NULL,
  description  VARCHAR(200) NULL,
  created_by   INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_padj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
