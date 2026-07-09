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
$pdo  = getPDO();

$stmt = $pdo->query(
    'SELECT te.*, u.name as user_name, u.pay_type, j.name as job_name
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     LEFT JOIN jobs j ON j.id = te.job_id
     WHERE te.approval_status = "pending" AND te.end_time IS NOT NULL
     ORDER BY te.start_time DESC'
);
echo json_encode(['entries' => $stmt->fetchAll()]);
