<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$lat  = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng  = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc  = isset($body['accuracy']) ? (float)$body['accuracy'] : null;

$pdo = getPDO();

// Check no open entry already
$open = $pdo->prepare('SELECT id FROM time_entries WHERE user_id = ? AND end_time IS NULL');
$open->execute([$auth['user_id']]);
if ($open->fetch()) {
    http_response_code(409);
    exit(json_encode(['error' => 'Day already started']));
}

$result = openEntry($pdo, $auth['user_id'], null, 'working', 'direct_labor', $lat, $lng, $acc);
echo json_encode($result);
