-- Migration: quick-add log for the extra places an employee stops by during
-- a shift (a specific suite, room, or a whole separate site) that are too
-- minor/specific to be worth registering as a real Job. Purely a record —
-- entirely separate from time_entries, so it can never affect pay/billing.
-- No approval workflow: nothing here needs admin review.
-- Run in phpMyAdmin on production after deploying the API + frontend files.

CREATE TABLE `visit_stops` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NOT NULL,
  `visit_date`  DATE         NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `note`        VARCHAR(255) NULL DEFAULT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vs_user_date` (`user_id`, `visit_date`),
  CONSTRAINT `fk_vs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
