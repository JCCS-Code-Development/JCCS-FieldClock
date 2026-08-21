-- Migration: one-time cleanup for data corrupted by sanitizeString()'s old
-- behavior — it ran every stored string through htmlspecialchars(), so
-- "Smith & Sons" was stored as the literal text "Smith &amp; Sons" (same
-- for < > " '). That's now fixed at the source (api/middleware/validate.php
-- — sanitizeString() just trims now), but existing rows still have the
-- escaped-looking text baked in and need a one-time un-escape pass.
--
-- Each UPDATE only touches rows that actually contain one of the five
-- entities (WHERE ... LIKE '%&amp;%' OR ...), so this is a no-op everywhere
-- nothing was ever affected. The REPLACE nesting deliberately un-escapes
-- &amp; LAST (outermost) — doing it first could turn an entity that
-- appeared inside a longer escaped sequence into the wrong character.
-- Excluded on purpose: password_hash, token_hash, signature_data (base64
-- image data), otp_codes.code — none of these are human-typed text and
-- none should ever be touched by a bulk text replace.
--
-- Run in phpMyAdmin on production after deploying API files.

UPDATE `check_registry` SET
  `check_number` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`check_number`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `payee_name`   = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payee_name`,   '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `check_number` LIKE '%&amp;%' OR `check_number` LIKE '%&lt;%' OR `check_number` LIKE '%&gt;%' OR `check_number` LIKE '%&quot;%' OR `check_number` LIKE '%&#039;%'
   OR `payee_name`   LIKE '%&amp;%' OR `payee_name`   LIKE '%&lt;%' OR `payee_name`   LIKE '%&gt;%' OR `payee_name`   LIKE '%&quot;%' OR `payee_name`   LIKE '%&#039;%'
   OR `notes`        LIKE '%&amp;%' OR `notes`        LIKE '%&lt;%' OR `notes`        LIKE '%&gt;%' OR `notes`        LIKE '%&quot;%' OR `notes`        LIKE '%&#039;%';

UPDATE `contractor_invoices` SET
  `estimate_number`     = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`estimate_number`,     '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `job_location`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`job_location`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `invoice_number`      = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`invoice_number`,      '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `file_original_name`  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`file_original_name`,  '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `admin_note`          = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`admin_note`,          '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `estimate_number`    LIKE '%&amp;%' OR `estimate_number`    LIKE '%&lt;%' OR `estimate_number`    LIKE '%&gt;%' OR `estimate_number`    LIKE '%&quot;%' OR `estimate_number`    LIKE '%&#039;%'
   OR `job_location`       LIKE '%&amp;%' OR `job_location`       LIKE '%&lt;%' OR `job_location`       LIKE '%&gt;%' OR `job_location`       LIKE '%&quot;%' OR `job_location`       LIKE '%&#039;%'
   OR `invoice_number`     LIKE '%&amp;%' OR `invoice_number`     LIKE '%&lt;%' OR `invoice_number`     LIKE '%&gt;%' OR `invoice_number`     LIKE '%&quot;%' OR `invoice_number`     LIKE '%&#039;%'
   OR `file_original_name` LIKE '%&amp;%' OR `file_original_name` LIKE '%&lt;%' OR `file_original_name` LIKE '%&gt;%' OR `file_original_name` LIKE '%&quot;%' OR `file_original_name` LIKE '%&#039;%'
   OR `admin_note`         LIKE '%&amp;%' OR `admin_note`         LIKE '%&lt;%' OR `admin_note`         LIKE '%&gt;%' OR `admin_note`         LIKE '%&quot;%' OR `admin_note`         LIKE '%&#039;%';

UPDATE `employee_loans` SET
  `description` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`description`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `description` LIKE '%&amp;%' OR `description` LIKE '%&lt;%' OR `description` LIKE '%&gt;%' OR `description` LIKE '%&quot;%' OR `description` LIKE '%&#039;%';

UPDATE `invoices` SET
  `invoice_number` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`invoice_number`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`          = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,          '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `invoice_number` LIKE '%&amp;%' OR `invoice_number` LIKE '%&lt;%' OR `invoice_number` LIKE '%&gt;%' OR `invoice_number` LIKE '%&quot;%' OR `invoice_number` LIKE '%&#039;%'
   OR `notes`          LIKE '%&amp;%' OR `notes`          LIKE '%&lt;%' OR `notes`          LIKE '%&gt;%' OR `notes`          LIKE '%&quot;%' OR `notes`          LIKE '%&#039;%';

UPDATE `job_estimates` SET
  `estimate_number` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`estimate_number`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `description`     = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`description`,     '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `estimate_number` LIKE '%&amp;%' OR `estimate_number` LIKE '%&lt;%' OR `estimate_number` LIKE '%&gt;%' OR `estimate_number` LIKE '%&quot;%' OR `estimate_number` LIKE '%&#039;%'
   OR `description`     LIKE '%&amp;%' OR `description`     LIKE '%&lt;%' OR `description`     LIKE '%&gt;%' OR `description`     LIKE '%&quot;%' OR `description`     LIKE '%&#039;%';

UPDATE `jobs` SET
  `name`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`name`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `client_name` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`client_name`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `company`     = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`company`,     '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `address`     = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`address`,     '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,       '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `name`        LIKE '%&amp;%' OR `name`        LIKE '%&lt;%' OR `name`        LIKE '%&gt;%' OR `name`        LIKE '%&quot;%' OR `name`        LIKE '%&#039;%'
   OR `client_name` LIKE '%&amp;%' OR `client_name` LIKE '%&lt;%' OR `client_name` LIKE '%&gt;%' OR `client_name` LIKE '%&quot;%' OR `client_name` LIKE '%&#039;%'
   OR `company`     LIKE '%&amp;%' OR `company`     LIKE '%&lt;%' OR `company`     LIKE '%&gt;%' OR `company`     LIKE '%&quot;%' OR `company`     LIKE '%&#039;%'
   OR `address`     LIKE '%&amp;%' OR `address`     LIKE '%&lt;%' OR `address`     LIKE '%&gt;%' OR `address`     LIKE '%&quot;%' OR `address`     LIKE '%&#039;%'
   OR `notes`       LIKE '%&amp;%' OR `notes`       LIKE '%&lt;%' OR `notes`       LIKE '%&gt;%' OR `notes`       LIKE '%&quot;%' OR `notes`       LIKE '%&#039;%';

UPDATE `loan_payments` SET
  `reference_number`           = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`,           '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `receipt_file_original_name` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`receipt_file_original_name`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`                      = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,                      '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `reference_number`           LIKE '%&amp;%' OR `reference_number`           LIKE '%&lt;%' OR `reference_number`           LIKE '%&gt;%' OR `reference_number`           LIKE '%&quot;%' OR `reference_number`           LIKE '%&#039;%'
   OR `receipt_file_original_name` LIKE '%&amp;%' OR `receipt_file_original_name` LIKE '%&lt;%' OR `receipt_file_original_name` LIKE '%&gt;%' OR `receipt_file_original_name` LIKE '%&quot;%' OR `receipt_file_original_name` LIKE '%&#039;%'
   OR `notes`                      LIKE '%&amp;%' OR `notes`                      LIKE '%&lt;%' OR `notes`                      LIKE '%&gt;%' OR `notes`                      LIKE '%&quot;%' OR `notes`                      LIKE '%&#039;%';

UPDATE `misc_checks` SET
  `payee_name`    = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payee_name`,    '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `payee_address` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payee_address`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `reason`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reason`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `payee_name`    LIKE '%&amp;%' OR `payee_name`    LIKE '%&lt;%' OR `payee_name`    LIKE '%&gt;%' OR `payee_name`    LIKE '%&quot;%' OR `payee_name`    LIKE '%&#039;%'
   OR `payee_address` LIKE '%&amp;%' OR `payee_address` LIKE '%&lt;%' OR `payee_address` LIKE '%&gt;%' OR `payee_address` LIKE '%&quot;%' OR `payee_address` LIKE '%&#039;%'
   OR `reason`        LIKE '%&amp;%' OR `reason`        LIKE '%&lt;%' OR `reason`        LIKE '%&gt;%' OR `reason`        LIKE '%&quot;%' OR `reason`        LIKE '%&#039;%';

UPDATE `pay_adjustments` SET
  `description` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`description`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `description` LIKE '%&amp;%' OR `description` LIKE '%&lt;%' OR `description` LIKE '%&gt;%' OR `description` LIKE '%&quot;%' OR `description` LIKE '%&#039;%';

UPDATE `paychecks` SET
  `void_reason` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`void_reason`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,       '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `void_reason` LIKE '%&amp;%' OR `void_reason` LIKE '%&lt;%' OR `void_reason` LIKE '%&gt;%' OR `void_reason` LIKE '%&quot;%' OR `void_reason` LIKE '%&#039;%'
   OR `notes`       LIKE '%&amp;%' OR `notes`       LIKE '%&lt;%' OR `notes`       LIKE '%&gt;%' OR `notes`       LIKE '%&quot;%' OR `notes`       LIKE '%&#039;%';

UPDATE `salary_history` SET
  `note` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`note`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `note` LIKE '%&amp;%' OR `note` LIKE '%&lt;%' OR `note` LIKE '%&gt;%' OR `note` LIKE '%&quot;%' OR `note` LIKE '%&#039;%';

UPDATE `time_change_requests` SET
  `reason`      = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reason`,      '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `review_note` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`review_note`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `reason`      LIKE '%&amp;%' OR `reason`      LIKE '%&lt;%' OR `reason`      LIKE '%&gt;%' OR `reason`      LIKE '%&quot;%' OR `reason`      LIKE '%&#039;%'
   OR `review_note` LIKE '%&amp;%' OR `review_note` LIKE '%&lt;%' OR `review_note` LIKE '%&gt;%' OR `review_note` LIKE '%&quot;%' OR `review_note` LIKE '%&#039;%';

UPDATE `time_entries` SET
  `work_order_number`  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`work_order_number`,  '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `engineer_name`      = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`engineer_name`,      '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `visit_description`  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`visit_description`,  '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `rejection_reason`   = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`rejection_reason`,   '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`              = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,              '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `work_order_number` LIKE '%&amp;%' OR `work_order_number` LIKE '%&lt;%' OR `work_order_number` LIKE '%&gt;%' OR `work_order_number` LIKE '%&quot;%' OR `work_order_number` LIKE '%&#039;%'
   OR `engineer_name`     LIKE '%&amp;%' OR `engineer_name`     LIKE '%&lt;%' OR `engineer_name`     LIKE '%&gt;%' OR `engineer_name`     LIKE '%&quot;%' OR `engineer_name`     LIKE '%&#039;%'
   OR `visit_description` LIKE '%&amp;%' OR `visit_description` LIKE '%&lt;%' OR `visit_description` LIKE '%&gt;%' OR `visit_description` LIKE '%&quot;%' OR `visit_description` LIKE '%&#039;%'
   OR `rejection_reason`  LIKE '%&amp;%' OR `rejection_reason`  LIKE '%&lt;%' OR `rejection_reason`  LIKE '%&gt;%' OR `rejection_reason`  LIKE '%&quot;%' OR `rejection_reason`  LIKE '%&#039;%'
   OR `notes`             LIKE '%&amp;%' OR `notes`             LIKE '%&lt;%' OR `notes`             LIKE '%&gt;%' OR `notes`             LIKE '%&quot;%' OR `notes`             LIKE '%&#039;%';

UPDATE `users` SET
  `name`    = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`name`,    '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `email`   = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`email`,   '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `phone`   = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`phone`,   '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `address` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`address`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `name`    LIKE '%&amp;%' OR `name`    LIKE '%&lt;%' OR `name`    LIKE '%&gt;%' OR `name`    LIKE '%&quot;%' OR `name`    LIKE '%&#039;%'
   OR `email`   LIKE '%&amp;%' OR `email`   LIKE '%&lt;%' OR `email`   LIKE '%&gt;%' OR `email`   LIKE '%&quot;%' OR `email`   LIKE '%&#039;%'
   OR `phone`   LIKE '%&amp;%' OR `phone`   LIKE '%&lt;%' OR `phone`   LIKE '%&gt;%' OR `phone`   LIKE '%&quot;%' OR `phone`   LIKE '%&#039;%'
   OR `address` LIKE '%&amp;%' OR `address` LIKE '%&lt;%' OR `address` LIKE '%&gt;%' OR `address` LIKE '%&quot;%' OR `address` LIKE '%&#039;%';

UPDATE `vendor_checks` SET
  `memo`         = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`memo`,         '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `period_label` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`period_label`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `memo`         LIKE '%&amp;%' OR `memo`         LIKE '%&lt;%' OR `memo`         LIKE '%&gt;%' OR `memo`         LIKE '%&quot;%' OR `memo`         LIKE '%&#039;%'
   OR `period_label` LIKE '%&amp;%' OR `period_label` LIKE '%&lt;%' OR `period_label` LIKE '%&gt;%' OR `period_label` LIKE '%&quot;%' OR `period_label` LIKE '%&#039;%';

UPDATE `vendors` SET
  `name`         = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`name`,         '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `contact_name` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`contact_name`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `email`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`email`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `phone`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`phone`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `address`      = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`address`,      '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `tax_id`       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`tax_id`,       '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`        = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,        '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `name`         LIKE '%&amp;%' OR `name`         LIKE '%&lt;%' OR `name`         LIKE '%&gt;%' OR `name`         LIKE '%&quot;%' OR `name`         LIKE '%&#039;%'
   OR `contact_name` LIKE '%&amp;%' OR `contact_name` LIKE '%&lt;%' OR `contact_name` LIKE '%&gt;%' OR `contact_name` LIKE '%&quot;%' OR `contact_name` LIKE '%&#039;%'
   OR `email`        LIKE '%&amp;%' OR `email`        LIKE '%&lt;%' OR `email`        LIKE '%&gt;%' OR `email`        LIKE '%&quot;%' OR `email`        LIKE '%&#039;%'
   OR `phone`        LIKE '%&amp;%' OR `phone`        LIKE '%&lt;%' OR `phone`        LIKE '%&gt;%' OR `phone`        LIKE '%&quot;%' OR `phone`        LIKE '%&#039;%'
   OR `address`      LIKE '%&amp;%' OR `address`      LIKE '%&lt;%' OR `address`      LIKE '%&gt;%' OR `address`      LIKE '%&quot;%' OR `address`      LIKE '%&#039;%'
   OR `tax_id`       LIKE '%&amp;%' OR `tax_id`       LIKE '%&lt;%' OR `tax_id`       LIKE '%&gt;%' OR `tax_id`       LIKE '%&quot;%' OR `tax_id`       LIKE '%&#039;%'
   OR `notes`        LIKE '%&amp;%' OR `notes`        LIKE '%&lt;%' OR `notes`        LIKE '%&gt;%' OR `notes`        LIKE '%&quot;%' OR `notes`        LIKE '%&#039;%';

UPDATE `work_order_photos` SET
  `caption` = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`caption`, '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `caption` LIKE '%&amp;%' OR `caption` LIKE '%&lt;%' OR `caption` LIKE '%&gt;%' OR `caption` LIKE '%&quot;%' OR `caption` LIKE '%&#039;%';

UPDATE `work_orders` SET
  `title`             = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`title`,             '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `area`              = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`area`,              '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `description`       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`description`,       '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `notes`             = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`notes`,             '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&'),
  `completion_notes`  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`completion_notes`,  '&lt;','<'), '&gt;','>'), '&quot;','"'), '&#039;', "'"), '&amp;','&')
WHERE `title`            LIKE '%&amp;%' OR `title`            LIKE '%&lt;%' OR `title`            LIKE '%&gt;%' OR `title`            LIKE '%&quot;%' OR `title`            LIKE '%&#039;%'
   OR `area`             LIKE '%&amp;%' OR `area`             LIKE '%&lt;%' OR `area`             LIKE '%&gt;%' OR `area`             LIKE '%&quot;%' OR `area`             LIKE '%&#039;%'
   OR `description`      LIKE '%&amp;%' OR `description`      LIKE '%&lt;%' OR `description`      LIKE '%&gt;%' OR `description`      LIKE '%&quot;%' OR `description`      LIKE '%&#039;%'
   OR `notes`            LIKE '%&amp;%' OR `notes`            LIKE '%&lt;%' OR `notes`            LIKE '%&gt;%' OR `notes`            LIKE '%&quot;%' OR `notes`            LIKE '%&#039;%'
   OR `completion_notes` LIKE '%&amp;%' OR `completion_notes` LIKE '%&lt;%' OR `completion_notes` LIKE '%&gt;%' OR `completion_notes` LIKE '%&quot;%' OR `completion_notes` LIKE '%&#039;%';
