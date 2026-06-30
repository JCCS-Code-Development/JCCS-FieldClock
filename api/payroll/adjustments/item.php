<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth   = requireAuth(); requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$body   = $method !== 'GET' ? jsonBody() : [];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);

if ($method === 'PUT') {
    $pdo->prepare(
        'UPDATE pay_adjustments SET type=?, amount=?, description=?, period_start=?, period_end=? WHERE id=?'
    )->execute([
        sanitizeString($body['type'] ?? ''),
        (float)($body['amount'] ?? 0),
        sanitizeString($body['description'] ?? ''),
        $body['period_start'] ?? null,
        $body['period_end']   ?? null,
        $id,
    ]);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM pay_adjustments WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);
} else {
    http_response_code(405);
}
