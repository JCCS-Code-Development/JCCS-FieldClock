-- Migration: separate "Company" (the hospital/business the job belongs to, used
-- for grouping) from "Client Name" (the contact/client on file for that job).
-- Run in phpMyAdmin on production after deploying API files.

ALTER TABLE `jobs`
  ADD COLUMN `company` VARCHAR(150) NULL DEFAULT NULL AFTER `client_name`;
