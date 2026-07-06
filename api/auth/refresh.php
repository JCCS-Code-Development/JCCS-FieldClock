<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['refreshToken']);
$rt = sanitizeString($body['refreshToken']);

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT rt.user_id, u.role FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = SHA2(?,256) AND rt.expires_at > NOW() AND u.is_active = 1');
$stmt->execute([$rt]);
$row = $stmt->fetch();
if (!$row) { http_response_code(401); exit(json_encode(['error' => 'Invalid or expired refresh token'])); }

// Rotate: delete the used token and issue a new one
$pdo->prepare('DELETE FROM refresh_tokens WHERE token_hash = SHA2(?,256)')->execute([$rt]);
$newRefreshToken = bin2hex(random_bytes(32));
$pdo->prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, SHA2(?,256), NOW() + INTERVAL ? SECOND)')
    ->execute([$row['user_id'], $newRefreshToken, JWT_REFRESH_EXPIRY]);

$token = jwt_encode(['user_id' => $row['user_id'], 'role' => $row['role']]);
echo json_encode(['token' => $token, 'refreshToken' => $newRefreshToken]);
exit;
