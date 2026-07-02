-- Migration: add loan management tables
-- Run in phpMyAdmin on production after deploying API files

CREATE TABLE IF NOT EXISTS `employee_loans` (
  `id`          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED   NOT NULL,
  `amount`      DECIMAL(10,2)  NOT NULL,
  `description` VARCHAR(255)   NULL DEFAULT NULL,
  `status`      ENUM('active','paid_off') NOT NULL DEFAULT 'active',
  `created_by`  INT UNSIGNED   NOT NULL,
  `created_at`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `fk_loan_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_loan_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loan_payments` (
  `id`           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `loan_id`      INT UNSIGNED   NOT NULL,
  `amount`       DECIMAL(10,2)  NOT NULL,
  `period_start` DATE           NULL DEFAULT NULL,
  `period_end`   DATE           NULL DEFAULT NULL,
  `notes`        VARCHAR(255)   NULL DEFAULT NULL,
  `created_by`   INT UNSIGNED   NOT NULL,
  `created_at`   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `loan_id` (`loan_id`),
  CONSTRAINT `fk_lp_loan`    FOREIGN KEY (`loan_id`)    REFERENCES `employee_loans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lp_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
