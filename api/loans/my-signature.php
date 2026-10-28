<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_pagare.php';

// The calling admin's own saved signature, used for one-click
// countersigning of loan pagarés (countersign.php with use_saved).
// GET → { signature_data|null }   PUT {signature_data} → save/replace
// DELETE → clear
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare('SELECT saved_signature FROM users WHERE id = ?');
    $stmt->execute([$auth['user_id']]);
    echo json_encode(['signature_data' => $stmt->fetchColumn() ?: null]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $sig  = (string)($body['signature_data'] ?? '');
    if (strlen($sig) < 100 || !str_starts_with($sig, 'data:image/png;base64,')) jsonError(422, 'Signature is required.');
    $pdo->prepare('UPDATE users SET saved_signature = ? WHERE id = ?')->execute([$sig, $auth['user_id']]);
    echo json_encode(['success' => true]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $pdo->prepare('UPDATE users SET saved_signature = NULL WHERE id = ?')->execute([$auth['user_id']]);
    echo json_encode(['success' => true]);
} else {
    http_response_code(405);
}
