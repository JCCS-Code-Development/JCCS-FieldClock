<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$lat   = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng   = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc   = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$jobId = isset($body['job_id'])   ? (int)$body['job_id']     : null;
$notes = isset($body['notes'])    ? trim($body['notes'])      : null;

$pdo = getPDO();

// Verify job exists and is active if provided
if ($jobId) {
    $j = $pdo->prepare('SELECT id FROM jobs WHERE id = ? AND status = ?');
    $j->execute([$jobId, 'active']);
    if (!$j->fetch()) $jobId = null;
}

// Block only if there is an active (non-day_end) open entry today
$open = $pdo->prepare('SELECT id FROM time_entries WHERE user_id = ? AND end_time IS NULL AND cost_category != ? AND DATE(start_time) = CURDATE()');
$open->execute([$auth['user_id'], 'day_end']);
if ($open->fetch()) {
    http_response_code(409);
    exit(json_encode(['error' => 'Day already started']));
}

$result = openEntry($pdo, $auth['user_id'], $jobId, 'working', 'direct_labor', $lat, $lng, $acc, null, $notes);
echo json_encode($result);
