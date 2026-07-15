<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);

$year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
$pdo  = getPDO();

// Time entries: per user per ISO week (to respect weekly OT rules), with quarter
$entries = $pdo->prepare("
    SELECT te.user_id,
           YEARWEEK(te.start_time, 3)     AS iso_week,
           QUARTER(te.start_time)          AS quarter,
           SUM(TIMESTAMPDIFF(MINUTE, te.start_time, te.end_time)) AS minutes
    FROM time_entries te
    WHERE YEAR(te.start_time) = :year
      AND te.approval_status = 'approved'
      AND te.end_time IS NOT NULL
      AND te.cost_category != 'day_end'
    GROUP BY te.user_id, YEARWEEK(te.start_time, 3), QUARTER(te.start_time)
");
$entries->execute([':year' => $year]);

$byUser = [];
foreach ($entries->fetchAll() as $r) {
    $uid = (int)$r['user_id'];
    $byUser[$uid]['weeks'][(string)$r['iso_week']] = [
        'minutes' => (int)$r['minutes'],
        'quarter' => (int)$r['quarter'],
    ];
}

// Adjustments grouped by user + quarter
$adjs = $pdo->prepare("
    SELECT user_id, type, SUM(amount) AS total, QUARTER(period_start) AS quarter
    FROM pay_adjustments
    WHERE YEAR(period_start) = :year
    GROUP BY user_id, type, QUARTER(period_start)
");
$adjs->execute([':year' => $year]);
foreach ($adjs->fetchAll() as $a) {
    $uid = (int)$a['user_id'];
    $q   = (int)$a['quarter'];
    if ($a['type'] === 'gas_allowance') {
        $byUser[$uid]['adj_gas'][$q] = ($byUser[$uid]['adj_gas'][$q] ?? 0) + (float)$a['total'];
    } else {
        $byUser[$uid]['adj_bonus'][$q] = ($byUser[$uid]['adj_bonus'][$q] ?? 0) + (float)$a['total'];
    }
}

// Loan deductions grouped by user + quarter
$loans = $pdo->prepare("
    SELECT l.user_id, QUARTER(lp.period_start) AS quarter, SUM(lp.amount) AS total
    FROM loan_payments lp
    JOIN employee_loans l ON l.id = lp.loan_id
    WHERE YEAR(lp.period_start) = :year
    GROUP BY l.user_id, QUARTER(lp.period_start)
");
$loans->execute([':year' => $year]);
foreach ($loans->fetchAll() as $l) {
    $byUser[(int)$l['user_id']]['loans'][(int)$l['quarter']] = (float)$l['total'];
}

// All active users + any users who have data this year
$uids = array_keys($byUser);
if ($uids) {
    $ph   = implode(',', array_fill(0, count($uids), '?'));
    $stmt = $pdo->prepare(
        "SELECT id, name, pay_type, pay_rate, pay_structure, overtime_rate, gas_weekly_allowance
         FROM users WHERE is_active = 1 OR id IN ($ph) ORDER BY name"
    );
    $stmt->execute($uids);
} else {
    $stmt = $pdo->query("SELECT id, name, pay_type, pay_rate, pay_structure, overtime_rate, gas_weekly_allowance FROM users WHERE is_active = 1 ORDER BY name");
}
$userMap = [];
foreach ($stmt->fetchAll() as $u) { $userMap[(int)$u['id']] = $u; }

$result = [];
foreach ($userMap as $uid => $u) {
    $ud    = $byUser[$uid] ?? [];
    $weeks = $ud['weeks'] ?? [];
    // Skip users with no activity or financial records this year
    if (empty($weeks) && empty($ud['adj_gas']) && empty($ud['adj_bonus']) && empty($ud['loans'])) continue;

    $isSalary = ($u['pay_structure'] ?? 'hourly') === 'salary';
    $qtrs     = [];

    foreach ($weeks as $wk => $wData) {
        $q   = $wData['quarter'];
        $hrs = $wData['minutes'] / 60;

        if ($isSalary) {
            $weekBase = (float)$u['pay_rate'];
            $regHrs   = $hrs;
            $otHrs    = 0;
        } elseif ($u['pay_type'] === 'w2') {
            // No overtime multiplier at this company — every hour is paid at the same rate.
            $regHrs   = min($hrs, 40);
            $otHrs    = max(0, $hrs - 40);
            $weekBase = $hrs * (float)$u['pay_rate'];
        } else {
            $regHrs   = $hrs;
            $otHrs    = 0;
            $weekBase = $hrs * (float)$u['pay_rate'];
        }

        $qtrs[$q]['hours']     = ($qtrs[$q]['hours']     ?? 0) + $hrs;
        $qtrs[$q]['reg_hours'] = ($qtrs[$q]['reg_hours'] ?? 0) + $regHrs;
        $qtrs[$q]['ot_hours']  = ($qtrs[$q]['ot_hours']  ?? 0) + $otHrs;
        $qtrs[$q]['base']      = ($qtrs[$q]['base']      ?? 0) + $weekBase;
    }

    // Gas allowance comes only from explicit, admin-approved pay_adjustments rows
    // (the "Review Gas Allowances" action) — never auto-computed from the employee's
    // gas_weekly_allowance profile field, or it would double-count on top of that adjustment.
    foreach ($ud['adj_gas']   ?? [] as $q => $amt) { $qtrs[$q]['gas']   = ($qtrs[$q]['gas']   ?? 0) + $amt; }
    foreach ($ud['adj_bonus'] ?? [] as $q => $amt) { $qtrs[$q]['bonus'] = ($qtrs[$q]['bonus'] ?? 0) + $amt; }
    foreach ($ud['loans']     ?? [] as $q => $amt) { $qtrs[$q]['loan_ded'] = ($qtrs[$q]['loan_ded'] ?? 0) + $amt; }

    $annual = ['hours' => 0, 'reg_hours' => 0, 'ot_hours' => 0, 'base' => 0, 'gas' => 0, 'bonus' => 0, 'loan_ded' => 0, 'gross' => 0, 'net' => 0];
    $out    = [];
    foreach ([1, 2, 3, 4] as $q) {
        $qd      = $qtrs[$q] ?? [];
        $gross   = ($qd['base'] ?? 0) + ($qd['gas'] ?? 0) + ($qd['bonus'] ?? 0);
        $loanDed = $qd['loan_ded'] ?? 0;
        $out[$q] = [
            'hours'     => round($qd['hours']     ?? 0, 2),
            'reg_hours' => round($qd['reg_hours'] ?? 0, 2),
            'ot_hours'  => round($qd['ot_hours']  ?? 0, 2),
            'base'      => round($qd['base']      ?? 0, 2),
            'gas'       => round($qd['gas']       ?? 0, 2),
            'bonus'     => round($qd['bonus']     ?? 0, 2),
            'loan_ded'  => round($loanDed, 2),
            'gross'     => round($gross, 2),
            'net'       => round(max(0, $gross - $loanDed), 2),
        ];
        foreach (['hours','reg_hours','ot_hours','base','gas','bonus','loan_ded','gross','net'] as $f) {
            $annual[$f] += $out[$q][$f];
        }
    }
    foreach ($annual as $k => $v) { $annual[$k] = round($v, 2); }

    $result[] = [
        'user_id'       => $uid,
        'name'          => $u['name'],
        'pay_type'      => $u['pay_type'],
        'pay_structure' => $u['pay_structure'] ?? 'hourly',
        'pay_rate'      => (float)$u['pay_rate'],
        'quarters'      => $out,
        'annual'        => $annual,
    ];
}

echo json_encode(['year' => $year, 'employees' => $result]);
