<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);

$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
$start  = $_GET['start'] ?? date('Y-m-d', strtotime('-7 days'));
$end    = $_GET['end']   ?? date('Y-m-d');
$pdo    = getPDO();

$stmt = $pdo->prepare(
    "SELECT te.*, j.name as job_name,
            DATE(te.start_time) as work_date,
            ROUND(TIMESTAMPDIFF(SECOND, te.start_time, te.end_time) / 60) as minutes
     FROM time_entries te
     LEFT JOIN jobs j ON j.id = te.job_id
     WHERE te.user_id = :uid
       AND DATE(te.start_time) BETWEEN :start AND :end
       AND te.end_time IS NOT NULL
       AND te.cost_category != 'day_end'
     ORDER BY te.start_time"
);
$stmt->execute([':uid' => $userId, ':start' => $start, ':end' => $end]);
$entries = $stmt->fetchAll();

// Group by date
$byDate = [];
foreach ($entries as $e) {
    $byDate[$e['work_date']][] = $e;
}

echo json_encode(['breakdown' => $byDate, 'user_id' => $userId, 'start' => $start, 'end' => $end]);
