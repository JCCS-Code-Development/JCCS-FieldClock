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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth();
$pdo  = getPDO();

$userId = $auth['role'] === 'admin' && isset($_GET['user_id']) ? (int)$_GET['user_id'] : $auth['user_id'];
$start  = $_GET['start'] ?? date('Y-m-d', strtotime('-7 days'));
$end    = $_GET['end']   ?? date('Y-m-d');

$sql = 'SELECT te.*, u.name as user_name, j.name as job_name, j.latitude as job_latitude, j.longitude as job_longitude, je.estimate_number
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN jobs j ON j.id = te.job_id
        LEFT JOIN job_estimates je ON je.id = te.estimate_id
        WHERE te.user_id = :uid
          AND DATE(te.start_time) BETWEEN :start AND :end
        ORDER BY te.start_time DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute([':uid' => $userId, ':start' => $start, ':end' => $end]);
$entries = $stmt->fetchAll();

// Normalize within_radius to a real bool/null, and attach the distance
// (computed from the stored GPS points, not persisted separately) whenever
// the clock-in was flagged as off-site — powers the "away from job site"
// warning badge in place of the old traveling/arrival flow.
foreach ($entries as &$row) {
    $row['within_radius'] = $row['within_radius'] === null ? null : (bool)(int)$row['within_radius'];
    $row['distance_meters'] = null;
    if ($row['within_radius'] === false && $row['start_lat'] !== null && $row['start_lng'] !== null
        && $row['job_latitude'] !== null && $row['job_longitude'] !== null) {
        $row['distance_meters'] = (int)round(haversineMeters(
            (float)$row['job_latitude'], (float)$row['job_longitude'],
            (float)$row['start_lat'], (float)$row['start_lng']
        ));
    }
    unset($row['job_latitude'], $row['job_longitude']);
}
unset($row);

echo json_encode(['entries' => $entries]);
