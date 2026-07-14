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
$lat  = isset($body['lat']) ? (float)$body['lat'] : null;
$lng  = isset($body['lng']) ? (float)$body['lng'] : null;
$acc  = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$pdo  = getPDO();
requireHourly($auth, $pdo);
$last = $pdo->prepare(
    'SELECT job_id, estimate_id, visit_category, estimate_subtype, work_order_number, engineer_name, visit_description
     FROM time_entries WHERE user_id = ? ORDER BY start_time DESC LIMIT 1'
);
$last->execute([$auth['user_id']]);
$prev             = $last->fetch();
$jobId            = $prev['job_id']            ?? null;
$estimateId       = $prev['estimate_id']       ?? null;
$visitCategory    = $prev['visit_category']    ?? null;
$estimateSubtype  = $prev['estimate_subtype']  ?? null;
$workOrderNumber  = $prev['work_order_number'] ?? null;
$engineerName     = $prev['engineer_name']     ?? null;
$visitDescription = $prev['visit_description'] ?? null;
closeOpenEntry($pdo, $auth['user_id'], $lat, $lng);
echo json_encode(openEntry(
    $pdo, $auth['user_id'], $jobId, 'material_run', 'material_pickup', $lat, $lng, $acc, null, null,
    $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription
));
