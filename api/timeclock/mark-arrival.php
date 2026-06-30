<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = jsonBody();
requireFields($body, ['job_id']);
$jobId = (int)$body['job_id'];
$lat   = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng   = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc   = isset($body['accuracy']) ? (float)$body['accuracy'] : null;

$pdo = getPDO();

$job = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
$job->execute([$jobId]);
$job = $job->fetch();
if (!$job) { http_response_code(404); exit(json_encode(['error' => 'Job not found'])); }

// GPS radius check
$withinRadius = null;
$distanceMeters = null;
if ($lat !== null && $lng !== null && $job['latitude'] && $job['longitude']) {
    $distanceMeters = haversineMeters((float)$job['latitude'], (float)$job['longitude'], $lat, $lng);
    $withinRadius   = $distanceMeters <= $job['clock_in_radius_meters'];
}

closeOpenEntry($pdo, $auth['user_id'], $lat, $lng);
$result = openEntry($pdo, $auth['user_id'], $jobId, 'working', 'direct_labor', $lat, $lng, $acc, $withinRadius);

echo json_encode([
    'timeclock'       => $result,
    'within_radius'   => $withinRadius,
    'distance_meters' => $distanceMeters !== null ? (int)round($distanceMeters) : null,
]);
