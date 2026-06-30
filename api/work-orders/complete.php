<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth();
$body = jsonBody(); requireFields($body, ['id']);
$pdo  = getPDO();

$pdo->prepare(
    'UPDATE work_orders SET status="completed", completed_at=NOW(), completion_notes=? WHERE id=?'
)->execute([sanitizeString($body['notes'] ?? ''), (int)$body['id']]);
echo json_encode(['message' => 'Completed']);
