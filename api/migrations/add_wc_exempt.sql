-- Migration: workers' comp exemption flag.
-- People with wc_exempt = 1 are not asked to fill out the "Workers'
-- Compensation Coverage" form (no orange banner, not counted in My Docs or
-- HR Compliance). Toggle per person in Admin → Employees → Edit.
--
-- RUN THIS IN phpMyAdmin (fieldclock DB) BEFORE deploying the matching code —
-- the new code reads users.wc_exempt and the Employees page would fail
-- without the column.

ALTER TABLE `users`
  ADD COLUMN `wc_exempt` TINYINT(1) NOT NULL DEFAULT 0 AFTER `pay_type`;

-- Initial exemptions (owners/family/office). Matched on first + last name
-- because the stored name can carry accents or a middle name.
UPDATE `users` SET `wc_exempt` = 1 WHERE
     (name LIKE '%Juliana%'   AND name LIKE '%Restrepo%')
  OR (name LIKE '%Laura%'     AND name LIKE '%Garc%a%')
  OR (name LIKE '%Camilo%'    AND name LIKE '%Calle%' AND name NOT LIKE '%Julianna%')
  OR (name LIKE '%Santiago%'  AND name LIKE '%Calle%')
  OR (name LIKE '%Felipe%'    AND name LIKE '%Calle%')
  OR (name LIKE '%Luz%'       AND name LIKE '%Hern%ndez%')
  OR (name LIKE '%Julianna%')
  OR (name LIKE '%Valentina%' AND name LIKE '%Valencia%');

-- Check the result: should be exactly these 8 people. Anyone missing (name
-- stored differently) → tick "Exempt from workers' comp form" on their
-- Employees record instead.
SELECT id, name, email, wc_exempt FROM `users` WHERE wc_exempt = 1 ORDER BY name;
