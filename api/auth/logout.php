<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
if (!empty($body['refreshToken'])) {
    $pdo = getPDO();
    $pdo->prepare('DELETE FROM refresh_tokens WHERE token_hash = SHA2(?,256)')->execute([$body['refreshToken']]);
}
echo json_encode(['message' => 'Logged out']);
