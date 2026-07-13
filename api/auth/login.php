<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

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

if (!$password || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    exit(json_encode(['error' => 'Incorrect password']));
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
        'preferred_language' => $user['preferred_language'] ?? 'en',
    ],
]);
