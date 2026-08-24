<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';

// Step 1 of the two-step login: given just an identifier, tells the
// frontend whether to show a password field (existing account) or send the
// user to set-password (first-time login) — before any password has been
// typed. Deliberately read-only: unlike login.php, this never touches
// failed_login_attempts, since a normal login always calls this first and
// counting it as a failed attempt would lock out legitimate users who
// never once mistyped their password.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body       = jsonBody();
$identifier = isset($body['identifier']) ? trim($body['identifier']) : '';

if (!$identifier) {
    http_response_code(422);
    exit(json_encode(['error' => 'Email or phone number is required']));
}

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT id, role, password_hash FROM users WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1');
$stmt->execute([$identifier, $identifier]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    exit(json_encode(['error' => 'No account found. Contact your administrator.']));
}

if ($user['role'] === 'contractor') {
    http_response_code(403);
    exit(json_encode(['error' => 'This account does not have access to the app. Contact your administrator.']));
}

echo json_encode([
    'user_id'      => $user['id'],
    'has_password' => (bool)$user['password_hash'],
]);
