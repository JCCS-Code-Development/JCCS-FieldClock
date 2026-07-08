<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body   = jsonBody();
    $status = sanitizeString($body['status'] ?? '');
    if (!in_array($status, ['pending', 'issued'])) {
        http_response_code(422); exit(json_encode(['error' => 'Status must be pending or issued']));
    }
    $pdo->prepare('UPDATE vendor_checks SET status = ? WHERE id = ?')->execute([$status, $id]);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM vendor_checks WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);

} else { http_response_code(405); }
