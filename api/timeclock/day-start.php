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

// Block if there is any active (non-day_end) open entry, even from a prior day —
// a forgotten clock-out that spans midnight must be resolved (by the employee
// finishing it, or an admin correcting it) rather than silently orphaned while a
// second entry opens and both accrue hours in payroll.
$open = $pdo->prepare('SELECT id, DATE(start_time) as start_date FROM time_entries WHERE user_id = ? AND end_time IS NULL AND cost_category != ?');
$open->execute([$auth['user_id'], 'day_end']);
if ($openRow = $open->fetch()) {
    http_response_code(409);
    $msg = $openRow['start_date'] === date('Y-m-d')
        ? 'Day already started'
        : "You have an entry open since {$openRow['start_date']} that was never clocked out. Contact your admin to fix it before starting a new day.";
    exit(json_encode(['error' => $msg]));
}

$result = openEntry(
    $pdo, $auth['user_id'], $jobId, 'working', 'direct_labor', $lat, $lng, $acc, null, $notes,
    $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription,
    source: 'day_start'
);
echo json_encode($result);
