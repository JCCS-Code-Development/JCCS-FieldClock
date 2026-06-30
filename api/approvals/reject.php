<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$body = jsonBody(); requireFields($body, ['entry_id', 'reason']);
$pdo  = getPDO();

$pdo->prepare(
    "UPDATE time_entries SET approval_status='rejected', approved_by=?, approved_at=NOW(), rejection_reason=? WHERE id=?"
)->execute([$auth['user_id'], sanitizeString($body['reason']), (int)$body['entry_id']]);

echo json_encode(['message' => 'Rejected']);
