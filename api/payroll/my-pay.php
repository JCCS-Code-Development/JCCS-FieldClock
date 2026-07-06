<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth();

$start = $_GET['start'] ?? date('Y-m-d', strtotime('monday this week'));
$end   = $_GET['end']   ?? date('Y-m-d');
$pdo   = getPDO();
$uid   = $auth['user_id'];

$user = $pdo->prepare('SELECT id, name, pay_type, pay_rate, overtime_rate, pay_structure, gas_weekly_allowance FROM users WHERE id = ?');
$user->execute([$uid]);
$u = $user->fetch();

$entries = $pdo->prepare(
    "SELECT cost_category, start_time, end_time,
            TIMESTAMPDIFF(MINUTE, start_time, IFNULL(end_time, NOW())) as minutes,
            YEARWEEK(start_time, 3) as iso_week,
            approval_status
     FROM time_entries
     WHERE user_id = :uid
       AND DATE(start_time) BETWEEN :start AND :end
       AND cost_category != 'day_end'"
);
$entries->execute([':uid' => $uid, ':start' => $start, ':end' => $end]);
$rows = $entries->fetchAll();

$weeks = []; $categoryHours = []; $pendingMinutes = 0; $approvedMinutes = 0; $todayMinutes = 0;
$today = date('Y-m-d');
foreach ($rows as $r) {
    $weeks[$r['iso_week']] = true;
    $cat = $r['cost_category'];
    $categoryHours[$cat] = ($categoryHours[$cat] ?? 0) + $r['minutes'] / 60;
    if ($r['approval_status'] === 'approved') $approvedMinutes += $r['minutes'];
    else $pendingMinutes += $r['minutes'];
    if (date('Y-m-d', strtotime($r['start_time'])) === $today) $todayMinutes += $r['minutes'];
}
$weeksWorked = count($weeks);
$totalApproved = $approvedMinutes / 60;
$totalPending  = $pendingMinutes / 60;

$regHours = 0; $otHours = 0;
if ($u['pay_type'] === 'w2') {
    // Recalculate by week for OT
    $weekMins = [];
    foreach ($rows as $r) {
        if ($r['approval_status'] === 'approved') {
            $weekMins[$r['iso_week']] = ($weekMins[$r['iso_week']] ?? 0) + $r['minutes'];
        }
    }
    foreach ($weekMins as $m) {
        $h = $m / 60; $regHours += min($h, 40); $otHours += max(0, $h - 40);
    }
    $rate      = (float)($u['pay_rate'] ?? 0);
    $otRate    = (float)($u['overtime_rate'] ?? $rate * 1.5);
    $baseGross = ($regHours * $rate) + ($otHours * $otRate);
} else {
    $rate      = (float)($u['pay_rate'] ?? 0);
    $regHours  = $totalApproved;
    $baseGross = $totalApproved * $rate;
}

$gasTotal = $u['gas_weekly_allowance'] !== null ? ($u['gas_weekly_allowance'] * $weeksWorked) : 0;

$adj = $pdo->prepare(
    "SELECT type, amount, description FROM pay_adjustments WHERE user_id = :uid AND period_start >= :start AND period_end <= :end"
);
$adj->execute([':uid' => $uid, ':start' => $start, ':end' => $end]);
$adjustments = $adj->fetchAll();
$adjTotal = array_sum(array_column($adjustments, 'amount'));

echo json_encode([
    'user'              => $u,
    'start'             => $start,
    'end'               => $end,
    'approved_hours'    => round($totalApproved, 2),
    'pending_hours'     => round($totalPending, 2),
    'regular_hours'     => round($regHours, 2),
    'overtime_hours'    => round($otHours, 2),
    'base_gross'        => round($baseGross, 2),
    'gas_total'         => round($gasTotal, 2),
    'gas_weekly_allowance' => $u['gas_weekly_allowance'],
    'adjustments'       => $adjustments,
    'adjustments_total' => round($adjTotal, 2),
    'estimated_total'   => round($baseGross + $gasTotal + $adjTotal, 2),
    'category_hours'    => array_map(fn($h) => round($h, 2), $categoryHours),
    'weeks_worked'      => $weeksWorked,
    'today_hours'       => round($todayMinutes / 60, 2),
    'pay_structure'     => $u['pay_structure'] ?? 'hourly',
]);
