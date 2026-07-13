<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = jsonBody();
requireFields($body, ['language']);

$language = sanitizeString($body['language']);
if (!in_array($language, ['en', 'es'])) {
    http_response_code(422);
    exit(json_encode(['error' => 'language must be en or es']));
}

$pdo = getPDO();
$pdo->prepare('UPDATE users SET preferred_language = ? WHERE id = ?')->execute([$language, $auth['user_id']]);
echo json_encode(['message' => 'Language updated']);
