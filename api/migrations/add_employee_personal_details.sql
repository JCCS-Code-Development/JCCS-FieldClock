-- Migration: employee personal details (Tax ID, birthdate, emergency
-- contact, direct-deposit info) — admin-managed, one row per user.
-- Kept in its own table rather than added to `users` so access to this
-- specifically sensitive data stays easy to isolate/reason about (see
-- api/employees/personal-details.php).
-- Run in phpMyAdmin on production after deploying the API + frontend files.

CREATE TABLE `employee_personal_details` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                  INT UNSIGNED NOT NULL,
  `tax_id`                   VARCHAR(20)  NULL DEFAULT NULL,
  `birth_date`               DATE         NULL DEFAULT NULL,
  `emergency_contact_name`   VARCHAR(150) NULL DEFAULT NULL,
  `emergency_contact_phone`  VARCHAR(20)  NULL DEFAULT NULL,
  `bank_routing_number`      VARCHAR(20)  NULL DEFAULT NULL,
  `bank_account_number`      VARCHAR(30)  NULL DEFAULT NULL,
  `updated_by`               INT UNSIGNED NULL DEFAULT NULL,
  `updated_at`               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at`                TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_epd_user` (`user_id`),
  CONSTRAINT `fk_epd_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_epd_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
