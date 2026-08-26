-- Migration: add push_subscriptions table for Web Push notifications
-- Run in phpMyAdmin on production
--
-- Referenced by api/push/subscribe.php and api/push/push-helper.php, but the
-- CREATE TABLE was missing from every schema/migration file in the repo —
-- this table appears to have never actually been created, which is why
-- push_to_user() was throwing "Table ... doesn't exist" and crashing the
-- paycheck status-update endpoints before they could return their response
-- (see api/paychecks/item.php and api/paychecks/mark-available-bulk.php).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  endpoint   VARCHAR(512) NOT NULL,
  p256dh     VARCHAR(255) NOT NULL,
  auth_key   VARCHAR(255) NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_endpoint (endpoint(255)),
  KEY idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
