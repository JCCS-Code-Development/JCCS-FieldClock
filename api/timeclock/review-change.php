<?php
ini_set("display_errors", 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();
requireFields($body, ['request_id', 'action']); // action: approve | reject

$reqId  = (int)$body['request_id'];
$action = $body['action'] === 'approve' ? 'approved' : 'rejected';
$note   = isset($body['note']) ? sanitizeString($body['note']) : null;

$stmt = $pdo->prepare('SELECT * FROM time_change_requests WHERE id = ? AND status = ?');
$stmt->execute([$reqId, 'pending']);
$req = $stmt->fetch();
if (!$req) { http_response_code(404); exit(json_encode(['error' => 'Request not found or already reviewed'])); }

$pdo->prepare(
    'UPDATE time_change_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?'
)->execute([$action, $auth['user_id'], $note, $reqId]);

// If approved, apply the time corrections to the original entry
if ($action === 'approved') {
    $updates = [];
    $params  = [];
    if (!empty($req['requested_start'])) { $updates[] = 'start_time = ?'; $params[] = $req['requested_start']; }
    if (!empty($req['requested_end']))   { $updates[] = 'end_time = ?';   $params[] = $req['requested_end']; }
    if ($updates) {
        $params[] = (int)$req['entry_id'];
        $pdo->prepare('UPDATE time_entries SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
    }
}

echo json_encode(['message' => 'Request ' . $action]);
