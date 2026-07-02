<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth();
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$lat  = isset($body['lat']) ? (float)$body['lat'] : null;
$lng  = isset($body['lng']) ? (float)$body['lng'] : null;
$acc  = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$pdo  = getPDO();

$pdo->beginTransaction();
try {
    closeOpenEntry($pdo, $auth['user_id'], $lat, $lng);
    $result = openEntry($pdo, $auth['user_id'], null, 'done', 'day_end', $lat, $lng, $acc);
    $pdo->commit();
    echo json_encode($result);
} catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    exit(json_encode(['error' => 'Clock-out failed. You are still clocked in.']));
}
