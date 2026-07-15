<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['user_id', 'password']);

$userId   = (int)$body['user_id'];
$password = $body['password'];

if (strlen($password) < 6) {
    http_response_code(422);
    exit(json_encode(['error' => 'Password must be at least 6 characters']));
}

$pdo  = getPDO();

// Only allowed when password_hash is still NULL (first-time setup only)
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1 AND password_hash IS NULL');
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(403);
    exit(json_encode(['error' => 'Setup not allowed. Use the password reset option instead.']));
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $userId]);

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
