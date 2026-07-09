<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth  = requireAuth();
$pdo   = getPDO();
$id    = isset($_GET['id']) ? (int)$_GET['id'] : (int)(jsonBody()['id'] ?? 0);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
    $stmt->execute([$id]);
    $job = $stmt->fetch();
    if (!$job) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    echo json_encode($job);

} elseif ($method === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $pdo->prepare(
        'UPDATE jobs SET name=?, client_name=?, address=?, latitude=?, longitude=?, clock_in_radius_meters=?, status=?, notes=?, updated_at=NOW() WHERE id=?'
    )->execute([
        sanitizeString($body['name'] ?? ''),
        sanitizeString($body['client_name'] ?? ''),
        sanitizeString($body['address'] ?? ''),
        $body['latitude']  ?? null,
        $body['longitude'] ?? null,
        (int)($body['clock_in_radius_meters'] ?? 300),
        sanitizeString($body['status'] ?? 'active'),
        sanitizeString($body['notes']  ?? ''),
        $id,
    ]);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    requireAdmin($auth);
    $pdo->prepare('UPDATE jobs SET status="cancelled" WHERE id=?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);
} else {
    http_response_code(405);
}
