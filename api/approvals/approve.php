<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$body = jsonBody(); requireFields($body, ['entry_ids']);
$pdo  = getPDO();

$ids = array_filter(array_map('intval', (array)$body['entry_ids']));
if (!$ids) { echo json_encode(['message' => 'Nothing to approve']); exit; }

$placeholders = implode(',', array_fill(0, count($ids), '?'));
$params = array_merge([$auth['user_id']], $ids);
$pdo->prepare(
    "UPDATE time_entries SET approval_status='approved', approved_by=?, approved_at=NOW()
     WHERE id IN ($placeholders) AND approval_status='pending'"
)->execute($params);

echo json_encode(['message' => 'Approved', 'count' => count($ids)]);
