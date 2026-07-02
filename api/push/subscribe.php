<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();
    if (empty($body['endpoint']) || empty($body['p256dh']) || empty($body['auth'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'endpoint, p256dh and auth are required']));
    }

    // Upsert subscription (one per endpoint)
    $pdo->prepare(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth_key = VALUES(auth_key)'
    )->execute([
        $auth['user_id'],
        sanitizeString($body['endpoint']),
        sanitizeString($body['p256dh']),
        sanitizeString($body['auth']),
    ]);

    echo json_encode(['success' => true]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $body = jsonBody();
    if (!empty($body['endpoint'])) {
        $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
            ->execute([$body['endpoint'], $auth['user_id']]);
    }
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
