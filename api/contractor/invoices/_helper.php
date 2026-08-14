<?php
// Shared between index.php and item.php.

// Resolves a free-typed estimate # to an existing job_estimates row, if one
// matches exactly (case-insensitive). Returns null when there's no match —
// the invoice still remembers what was typed either way (estimate_number/
// job_location columns on contractor_invoices), estimate_id just stays
// unset until a real estimate with that number exists.
function resolveEstimateId(PDO $pdo, ?string $estimateNumberText): ?int {
    if (!$estimateNumberText) return null;
    $stmt = $pdo->prepare('SELECT id FROM job_estimates WHERE LOWER(estimate_number) = LOWER(?) AND is_active = 1 LIMIT 1');
    $stmt->execute([$estimateNumberText]);
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : null;
}

const INVOICE_SELECT = 'SELECT ci.*, u.name AS contractor_name, u.address AS contractor_address,
                je.job_id AS estimate_job_id, je.estimate_number AS resolved_estimate_number,
                je.description AS estimate_description, j.name AS job_name, j.client_name AS job_client_name
         FROM contractor_invoices ci
         JOIN users u ON u.id = ci.user_id
         LEFT JOIN job_estimates je ON je.id = ci.estimate_id
         LEFT JOIN jobs j ON j.id = je.job_id';
