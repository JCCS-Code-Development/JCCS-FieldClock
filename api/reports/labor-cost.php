<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);

$start   = $_GET['start']    ?? date('Y-m-d', strtotime('-30 days'));
$end     = $_GET['end']      ?? date('Y-m-d');
$groupBy = $_GET['group_by'] ?? 'job';
$pdo     = getPDO();

$selectCol = match($groupBy) {
    'employee'   => 'u.name as group_label, te.user_id as group_id',
    'visit_type' => 'COALESCE(te.visit_type, "unspecified") as group_label, te.visit_type as group_id',
    default      => 'COALESCE(j.name, "No Job") as group_label, te.job_id as group_id',
};

$sql = "SELECT $selectCol, te.cost_category,
               SUM(TIMESTAMPDIFF(MINUTE, te.start_time, te.end_time)) / 60.0 as hours,
               u.pay_rate, u.overtime_rate, u.pay_type
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN jobs j ON j.id = te.job_id
        WHERE DATE(te.start_time) BETWEEN :start AND :end
          AND te.approval_status = 'approved'
          AND te.end_time IS NOT NULL
          AND te.cost_category NOT IN ('day_end')
        GROUP BY group_id, group_label, te.cost_category, u.pay_rate, u.overtime_rate, u.pay_type
        ORDER BY group_label, te.cost_category";

$stmt = $pdo->prepare($sql);
$stmt->execute([':start' => $start, ':end' => $end]);
$rows = $stmt->fetchAll();

// Roll up into groups
$groups = [];
foreach ($rows as $r) {
    $gid   = $r['group_id'] ?? 'null';
    $label = $r['group_label'];
    $cat   = $r['cost_category'];
    $hrs   = (float)$r['hours'];
    $cost  = $hrs * (float)$r['pay_rate'];

    $groups[$gid]['label'] = $label;
    $groups[$gid]['categories'][$cat]['hours'] = ($groups[$gid]['categories'][$cat]['hours'] ?? 0) + $hrs;
    $groups[$gid]['categories'][$cat]['cost']  = ($groups[$gid]['categories'][$cat]['cost']  ?? 0) + $cost;
    $groups[$gid]['total_hours'] = ($groups[$gid]['total_hours'] ?? 0) + $hrs;
    $groups[$gid]['total_cost']  = ($groups[$gid]['total_cost']  ?? 0) + $cost;
}

echo json_encode(['report' => array_values($groups), 'start' => $start, 'end' => $end, 'group_by' => $groupBy]);
