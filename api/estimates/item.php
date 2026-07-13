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
    $body = jsonBody();
    $sets = []; $params = [];

    if (array_key_exists('estimate_number', $body)) {
        $sets[] = 'estimate_number = ?'; $params[] = sanitizeString($body['estimate_number']);
    }
    if (array_key_exists('description', $body)) {
        $sets[] = 'description = ?';
        $params[] = $body['description'] !== '' && $body['description'] !== null ? sanitizeString($body['description']) : null;
    }
    if (array_key_exists('is_active', $body)) {
        $sets[] = 'is_active = ?'; $params[] = $body['is_active'] ? 1 : 0;
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }

    $params[] = $id;
    $pdo->prepare('UPDATE job_estimates SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $used = $pdo->prepare('SELECT COUNT(*) FROM time_entries WHERE estimate_id = ?');
    $used->execute([$id]);
    if ((int)$used->fetchColumn() > 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Cannot delete an estimate that has been used on a time entry. Deactivate it instead.']));
    }
    $pdo->prepare('DELETE FROM job_estimates WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);

} else {
    http_response_code(405);
}
