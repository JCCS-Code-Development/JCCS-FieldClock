<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

// Not in config.php (gitignored, production secrets only) — plain constants here
// so this rate limit ships with the code on every deploy.
const LOGIN_MAX_ATTEMPTS    = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body       = jsonBody();
$identifier = isset($body['identifier']) ? trim($body['identifier']) : '';
$password   = $body['password'] ?? '';

if (!$identifier) {
    http_response_code(422);
    exit(json_encode(['error' => 'Email or phone number is required']));
}

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1');
$stmt->execute([$identifier, $identifier]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    exit(json_encode(['error' => 'No account found. Contact your administrator.']));
}

// First-time login: no password set yet — prompt to create one
if (!$user['password_hash']) {
    echo json_encode(['setup_required' => true, 'user_id' => $user['id']]);
    exit;
}

if (!empty($user['login_locked_until']) && strtotime($user['login_locked_until']) > time()) {
    http_response_code(429);
    exit(json_encode(['error' => 'Too many failed attempts. Try again in a few minutes.']));
}

if (!$password || !password_verify($password, $user['password_hash'])) {
    $attempts = (int)($user['failed_login_attempts'] ?? 0) + 1;
    if ($attempts >= LOGIN_MAX_ATTEMPTS) {
        $pdo->prepare('UPDATE users SET failed_login_attempts = 0, login_locked_until = NOW() + INTERVAL ? MINUTE WHERE id = ?')
            ->execute([LOGIN_LOCKOUT_MINUTES, $user['id']]);
    } else {
        $pdo->prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?')->execute([$attempts, $user['id']]);
    }
    http_response_code(401);
    exit(json_encode(['error' => 'Incorrect password']));
}

if (!empty($user['failed_login_attempts']) || !empty($user['login_locked_until'])) {
    $pdo->prepare('UPDATE users SET failed_login_attempts = 0, login_locked_until = NULL WHERE id = ?')->execute([$user['id']]);
}

$token        = jwt_encode(['user_id' => $user['id'], 'role' => $user['role']]);
$refreshToken = bin2hex(random_bytes(32));
$pdo->prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, SHA2(?,256), NOW() + INTERVAL ? SECOND)'
)->execute([$user['id'], $refreshToken, JWT_REFRESH_EXPIRY]);

echo json_encode([
    'token'        => $token,
    'refreshToken' => $refreshToken,
    'user'         => [
        'id'                 => $user['id'],
        'name'               => $user['name'],
        'email'              => $user['email'],
        'phone'              => $user['phone'],
        'role'               => $user['role'],
        'pay_type'           => $user['pay_type'],
        'pay_structure'      => $user['pay_structure'],
        'default_job_id'     => $user['default_job_id'],
        'preferred_language' => $user['preferred_language'] ?? 'en',
    ],
]);
