<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body       = jsonBody();
requireFields($body, ['identifier', 'code']);
$identifier = sanitizeString($body['identifier']);
$code       = sanitizeString($body['code']);

$pdo = getPDO();

$user = $pdo->prepare('SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1');
$user->execute([$identifier, $identifier]);
$user = $user->fetch();
if (!$user) { http_response_code(404); exit(json_encode(['error' => 'User not found'])); }

// The most recent outstanding (unexpired, unused) code for this user — attempts are
// tracked per-code so a fresh code (via send-otp.php) always gets a fresh allowance.
$current = $pdo->prepare(
    'SELECT id, code, attempts FROM otp_codes WHERE user_id = ? AND expires_at > NOW() AND used_at IS NULL ORDER BY id DESC LIMIT 1'
);
$current->execute([$user['id']]);
$current = $current->fetch();

if (!$current) {
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid or expired code']));
}

if ($current['attempts'] >= OTP_MAX_ATTEMPTS) {
    // Lock this code out entirely so it can't keep being guessed against.
    $pdo->prepare('UPDATE otp_codes SET used_at = NOW() WHERE id = ?')->execute([$current['id']]);
    http_response_code(429);
    exit(json_encode(['error' => 'Too many incorrect attempts. Request a new code.']));
}

if (!hash_equals($current['code'], $code)) {
    $pdo->prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$current['id']]);
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid or expired code']));
}

$otp = $current;

$pdo->prepare('UPDATE otp_codes SET used_at = NOW() WHERE id = ?')->execute([$otp['id']]);

$token        = jwt_encode(['user_id' => $user['id'], 'role' => $user['role']]);
$refreshToken = bin2hex(random_bytes(32));
$stmt         = $pdo->prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, SHA2(?,256), NOW() + INTERVAL ? SECOND)');
$stmt->execute([$user['id'], $refreshToken, JWT_REFRESH_EXPIRY]);

echo json_encode([
    'token'        => $token,
    'refreshToken' => $refreshToken,
    'user'          => [
        'id'            => $user['id'],
        'name'          => $user['name'],
        'email'         => $user['email'],
        'phone'         => $user['phone'],
        'role'               => $user['role'],
        'pay_type'           => $user['pay_type'],
        'pay_structure'      => $user['pay_structure'] ?? 'hourly',
        'default_job_id'     => $user['default_job_id'],
        'preferred_language' => $user['preferred_language'] ?? 'en',
    ],
]);
exit;
