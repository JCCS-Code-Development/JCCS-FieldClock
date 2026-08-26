<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Bulk "catch up" for a whole pay period's worth of checks that were
// already physically handed out but never updated in the app (e.g. a
// backlog left over from before checks got marked available at all).
// Deliberately does NOT call push_to_user() — unlike mark-available-bulk,
// these checks are old news to the employee by the time an admin runs
// this, and firing a "your check is ready" push for something they were
// handed weeks ago would be confusing, not helpful.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
requireAdmin($auth);
$body = jsonBody();
requireFields($body, ['period_start', 'period_end']);

$periodStart = sanitizeString($body['period_start']);
$periodEnd   = sanitizeString($body['period_end']);

$pdo = getPDO();

// Covers both 'processing' (never even marked available) and 'available'
// (marked ready but never confirmed picked up) — both cases legitimately
// mean "picked up" once we know the check was actually handed out.
$stmt = $pdo->prepare(
    "SELECT id FROM paychecks WHERE period_start = ? AND period_end = ? AND status IN ('processing', 'available')"
);
$stmt->execute([$periodStart, $periodEnd]);
$rows = $stmt->fetchAll();

if ($rows) {
    $ids = array_column($rows, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare(
        "UPDATE paychecks
         SET status = 'picked_up',
             available_at = COALESCE(available_at, NOW()),
             picked_up_at = NOW()
         WHERE id IN ($placeholders)"
    )->execute($ids);
}

echo json_encode(['success' => true, 'updated' => count($rows)]);
