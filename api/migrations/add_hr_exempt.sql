-- Migration: "exempt from all HR documents" flag.
-- People with hr_exempt = 1 are not asked to sign ANY onboarding document
-- (At-Will, Non-Solicitation, Conflict of Interest, Emergency Contact, I-9,
-- W-4, Workers' Comp): no orange banner, nothing pending in My Docs, shown as
-- "HR exempt" in HR Compliance. Loan pagarés are unaffected. Toggle per person
-- in Admin → Employees → Edit.
--
-- RUN IN phpMyAdmin (fieldclock DB) AFTER add_wc_exempt.sql and BEFORE
-- deploying the matching code.

ALTER TABLE `users`
  ADD COLUMN `hr_exempt` TINYINT(1) NOT NULL DEFAULT 0 AFTER `wc_exempt`;

UPDATE `users` SET `hr_exempt` = 1 WHERE
     (name LIKE '%Laura%'    AND name LIKE '%Garc%a%')
  OR (name LIKE '%Camilo%'   AND name LIKE '%Calle%')
  OR (name LIKE '%Santiago%' AND name LIKE '%Calle%');

-- Check: should be exactly Laura Garcia, Camilo Calle, Santiago Calle. Anyone
-- missing → tick "Exempt from all HR documents" on their Employees record.
SELECT id, name, email, hr_exempt FROM `users` WHERE hr_exempt = 1 ORDER BY name;
