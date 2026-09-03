-- ─────────────────────────────────────────────────────────────────────────────
-- Unified check production — Phase 4 (drop the retired tables)
--
-- Run ONLY after add_unified_checks.sql has run and you've confirmed the
-- folded-in rows look right in the Checks hub (/admin/checks). This is
-- destructive: misc_checks and vendor_checks are removed for good.
--
-- Their data already lives in check_registry (source = 'misc' / 'vendor').
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS `misc_checks`;
DROP TABLE IF EXISTS `vendor_checks`;
