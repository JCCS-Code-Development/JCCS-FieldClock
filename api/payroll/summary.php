<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);

$start = $_GET['start'] ?? date('Y-m-d', strtotime('monday this week -7 days'));
$end   = $_GET['end']   ?? date('Y-m-d');
$pdo   = getPDO();

// Fetch all approved, closed entries in range
$entries = $pdo->prepare(
    "SELECT te.user_id, te.cost_category, te.start_time, te.end_time,
            TIMESTAMPDIFF(MINUTE, te.start_time, te.end_time) as minutes,
            YEARWEEK(te.start_time, 3) as iso_week
     FROM time_entries te
     WHERE DATE(te.start_time) BETWEEN :start AND :end
       AND te.approval_status = 'approved'
       AND te.end_time IS NOT NULL
       AND te.cost_category != 'day_end'"
);
$entries->execute([':start' => $start, ':end' => $end]);
$rows = $entries->fetchAll();

// Group by user → iso_week → category
$byUser = [];
foreach ($rows as $r) {
    $uid = $r['user_id'];
    $wk  = $r['iso_week'];
    $cat = $r['cost_category'];
    $byUser[$uid]['weeks'][$wk][$cat] = ($byUser[$uid]['weeks'][$wk][$cat] ?? 0) + $r['minutes'];
}

// Adjustments
$adjRows = $pdo->prepare(
    "SELECT user_id, type, amount FROM pay_adjustments WHERE period_start >= :start AND period_end <= :end"
);
$adjRows->execute([':start' => $start, ':end' => $end]);
foreach ($adjRows->fetchAll() as $adj) {
    $byUser[$adj['user_id']]['adjustments'][] = $adj;
}

// User info
// Include all users — even deactivated ones may have entries in this period
$users = $pdo->query('SELECT id, name, pay_type, pay_rate, pay_structure, overtime_rate, gas_weekly_allowance FROM users')->fetchAll();
$userMap = [];
foreach ($users as $u) { $userMap[$u['id']] = $u; }

$summary = [];
foreach ($byUser as $uid => $data) {
    if (!isset($userMap[$uid])) continue;
    $u = $userMap[$uid];
    $weeks = $data['weeks'] ?? [];
    $weeksWorked = count($weeks);

    // Payable categories (exclude day_end — already filtered)
    $totalMinutes = 0;
    $categoryHours = [];
    foreach ($weeks as $weekData) {
        foreach ($weekData as $cat => $mins) {
            $totalMinutes += $mins;
            $categoryHours[$cat] = ($categoryHours[$cat] ?? 0) + $mins / 60;
        }
    }

    $regHours = 0; $otHours = 0;
    $isSalary = ($u['pay_structure'] ?? 'hourly') === 'salary';

    if ($isSalary) {
        // Fixed weekly salary — pay_rate is the weekly amount regardless of hours
        $totalHours = $totalMinutes / 60;
        $regHours   = $totalHours;
        $baseGross  = (float)($u['pay_rate'] ?? 0) * $weeksWorked;
    } elseif ($u['pay_type'] === 'w2') {
        foreach ($weeks as $weekData) {
            $weekMins = array_sum($weekData);
            $weekHrs  = $weekMins / 60;
            $regHours += min($weekHrs, 40);
            $otHours  += max(0, $weekHrs - 40);
        }
        $rate      = (float)($u['pay_rate'] ?? 0);
        $otRate    = (float)($u['overtime_rate'] ?? $rate * 1.5);
        $baseGross = ($regHours * $rate) + ($otHours * $otRate);
    } else {
        $rate       = (float)($u['pay_rate'] ?? 0);
        $totalHours = $totalMinutes / 60;
        $regHours   = $totalHours;
        $baseGross  = $totalHours * $rate;
    }

    $gasTotal = $u['gas_weekly_allowance'] !== null ? ($u['gas_weekly_allowance'] * $weeksWorked) : 0;
    $adjTotal = 0;
    foreach ($data['adjustments'] ?? [] as $adj) { $adjTotal += $adj['amount']; }

    $summary[] = [
        'user_id'         => $uid,
        'name'            => $u['name'],
        'pay_type'        => $u['pay_type'],
        'pay_rate'        => $u['pay_rate'],
        'pay_structure'   => $u['pay_structure'] ?? 'hourly',
        'overtime_rate'   => $u['overtime_rate'],
        'regular_hours'   => round($regHours, 2),
        'overtime_hours'  => round($otHours, 2),
        'base_gross'      => round($baseGross, 2),
        'gas_total'       => round($gasTotal, 2),
        'adjustments_total' => round($adjTotal, 2),
        'estimated_total' => round($baseGross + $gasTotal + $adjTotal, 2),
        'category_hours'  => array_map(fn($h) => round($h, 2), $categoryHours),
        'weeks_worked'    => $weeksWorked,
    ];
}

echo json_encode(['summary' => $summary, 'start' => $start, 'end' => $end]);
