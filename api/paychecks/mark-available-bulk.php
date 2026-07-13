<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../push/push-helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
requireAdmin($auth);
$body = jsonBody();
requireFields($body, ['period_start', 'period_end']);

$periodStart = sanitizeString($body['period_start']);
$periodEnd   = sanitizeString($body['period_end']);

$pdo = getPDO();

$stmt = $pdo->prepare(
    "SELECT id, user_id FROM paychecks WHERE period_start = ? AND period_end = ? AND status = 'processing'"
);
$stmt->execute([$periodStart, $periodEnd]);
$rows = $stmt->fetchAll();

if ($rows) {
    $ids = array_column($rows, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("UPDATE paychecks SET status = 'available', available_at = NOW() WHERE id IN ($placeholders)")
        ->execute($ids);

    foreach ($rows as $row) {
        push_to_user($pdo, (int)$row['user_id'], 'paycheck');
    }
}

echo json_encode(['success' => true, 'updated' => count($rows)]);
