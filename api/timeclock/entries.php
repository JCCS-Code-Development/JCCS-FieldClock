<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth();
$pdo  = getPDO();

$userId = $auth['role'] === 'admin' && isset($_GET['user_id']) ? (int)$_GET['user_id'] : $auth['user_id'];
$start  = $_GET['start'] ?? date('Y-m-d', strtotime('-7 days'));
$end    = $_GET['end']   ?? date('Y-m-d');

$sql = 'SELECT te.*, u.name as user_name, j.name as job_name
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN jobs j ON j.id = te.job_id
        WHERE te.user_id = :uid
          AND DATE(te.start_time) BETWEEN :start AND :end
        ORDER BY te.start_time DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute([':uid' => $userId, ':start' => $start, ':end' => $end]);
$entries = $stmt->fetchAll();

echo json_encode(['entries' => $entries]);
