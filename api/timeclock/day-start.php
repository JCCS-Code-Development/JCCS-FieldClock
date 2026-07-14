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
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$lat   = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng   = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc   = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$jobId            = isset($body['job_id'])      ? (int)$body['job_id']              : null;
$notes            = isset($body['notes'])       ? trim($body['notes'])              : null;
$visitCategory    = !empty($body['visit_category'])    ? trim((string)$body['visit_category'])    : null;
$estimateId       = !empty($body['estimate_id'])       ? (int)$body['estimate_id']                : null;
$estimateSubtype  = !empty($body['estimate_subtype'])  ? trim((string)$body['estimate_subtype'])  : null;
$workOrderNumber  = !empty($body['work_order_number']) ? trim((string)$body['work_order_number']) : null;
$engineerName     = !empty($body['engineer_name'])     ? trim((string)$body['engineer_name'])     : null;
$visitDescription = !empty($body['visit_description']) ? trim((string)$body['visit_description']) : null;

$pdo = getPDO();
requireHourly($auth, $pdo);

// Verify job exists and is usable (active, or a pending-review location this
// same employee registered) if provided
if ($jobId) {
    $j = $pdo->prepare(
        "SELECT id FROM jobs WHERE id = ? AND (status = 'active' OR (status = 'pending_review' AND registered_by = ?))"
    );
    $j->execute([$jobId, $auth['user_id']]);
    if (!$j->fetch()) $jobId = null;
}

validateVisitCategory($pdo, $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription, $jobId);

// Block only if there is an active (non-day_end) open entry today
$open = $pdo->prepare('SELECT id FROM time_entries WHERE user_id = ? AND end_time IS NULL AND cost_category != ? AND DATE(start_time) = CURDATE()');
$open->execute([$auth['user_id'], 'day_end']);
if ($open->fetch()) {
    http_response_code(409);
    exit(json_encode(['error' => 'Day already started']));
}

$result = openEntry(
    $pdo, $auth['user_id'], $jobId, 'working', 'direct_labor', $lat, $lng, $acc, null, $notes,
    $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription
);
echo json_encode($result);
