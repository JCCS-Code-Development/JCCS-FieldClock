<?php
ini_set("display_errors", 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
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
$jobId      = (int)$body['job_id'];
$lat        = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng        = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc              = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$visitCategory    = !empty($body['visit_category'])    ? trim((string)$body['visit_category'])    : null;
$estimateId       = !empty($body['estimate_id'])       ? (int)$body['estimate_id']                : null;
$estimateSubtype  = !empty($body['estimate_subtype'])  ? trim((string)$body['estimate_subtype'])  : null;
$workOrderNumber  = !empty($body['work_order_number']) ? trim((string)$body['work_order_number']) : null;
$engineerName     = !empty($body['engineer_name'])     ? trim((string)$body['engineer_name'])     : null;
$visitDescription = !empty($body['visit_description']) ? trim((string)$body['visit_description']) : null;

$pdo = getPDO();
requireHourly($auth, $pdo);

$job = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
$job->execute([$jobId]);
$job = $job->fetch();
if (!$job) { http_response_code(404); exit(json_encode(['error' => 'Job not found'])); }

validateVisitCategory($pdo, $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription, $jobId);

// GPS radius check
$withinRadius = null;
$distanceMeters = null;
if ($lat !== null && $lng !== null && $job['latitude'] && $job['longitude']) {
    $distanceMeters = haversineMeters((float)$job['latitude'], (float)$job['longitude'], $lat, $lng);
    $withinRadius   = $distanceMeters <= $job['clock_in_radius_meters'];
}

closeOpenEntry($pdo, $auth['user_id'], $lat, $lng);
$result = openEntry(
    $pdo, $auth['user_id'], $jobId, 'working', 'direct_labor', $lat, $lng, $acc, $withinRadius, null,
    $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription
);

echo json_encode([
    'timeclock'       => $result,
    'within_radius'   => $withinRadius,
    'distance_meters' => $distanceMeters !== null ? (int)round($distanceMeters) : null,
]);
