<?php
// One-off, read-only export. Run via CLI only:
//   php api/migrations/export_legacy_timelogs_csv.php
//
// Reads `users` + `time_logs` from a temporary database you've imported the old
// app's SQL dump into (via phpMyAdmin), pairs each IN with the next OUT per user,
// and writes three review CSVs to your Downloads folder. Does NOT connect to or
// modify FieldClock's own database in any way — this is purely so you can
// eyeball the old data (including a month-by-month total per employee, for
// cross-checking against the live old app) before anything gets migrated.

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('This script must be run from the command line.');
}

require_once __DIR__ . '/../config/config.php';

// ── Config — edit before running ────────────────────────────────────────
$LEGACY_DB_NAME = 'jccs_legacy_import'; // the temp database you imported jccs.sql into
$START_DATE     = '2025-10-01';
$END_DATE       = date('Y-m-d 23:59:59');
$OUTPUT_DIR     = getenv('HOME') . '/Downloads';
// ─────────────────────────────────────────────────────────────────────────

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . $LEGACY_DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to '$LEGACY_DB_NAME': " . $e->getMessage() . "\n");
    fwrite(STDERR, "If this is an access-denied error, the FieldClock DB user (" . DB_USER . ") may not\n");
    fwrite(STDERR, "have grants on this database yet — grant it access in phpMyAdmin and re-run.\n");
    exit(1);
}

$users = [];
foreach ($pdo->query('SELECT id, full_name, email FROM users') as $row) {
    $users[(int)$row['id']] = [
        'name'  => trim((string)$row['full_name']) !== '' ? $row['full_name'] : ('user #' . $row['id']),
        'email' => $row['email'],
    ];
}

$stmt = $pdo->prepare(
    'SELECT user_id, type, event_time, notes FROM time_logs
     WHERE event_time BETWEEN ? AND ?
     ORDER BY user_id, event_time'
);
$stmt->execute([$START_DATE, $END_DATE]);
$logsByUser = [];
foreach ($stmt as $row) {
    $logsByUser[(int)$row['user_id']][] = $row;
}

$detailRows  = [];
$summaryRows = [];
$monthlyTotals = []; // "$userId|$month" => ['paired' => n, 'unpaired' => n, 'hours' => f]

$bumpMonth = function (int $userId, string $month, int $pairedDelta, int $unpairedDelta, float $hoursDelta) use (&$monthlyTotals) {
    $key = $userId . '|' . $month;
    if (!isset($monthlyTotals[$key])) {
        $monthlyTotals[$key] = ['user_id' => $userId, 'month' => $month, 'paired' => 0, 'unpaired' => 0, 'hours' => 0.0];
    }
    $monthlyTotals[$key]['paired']   += $pairedDelta;
    $monthlyTotals[$key]['unpaired'] += $unpairedDelta;
    $monthlyTotals[$key]['hours']    += $hoursDelta;
};

foreach ($logsByUser as $userId => $logs) {
    $user = $users[$userId] ?? ['name' => 'user #' . $userId, 'email' => null];

    $pairedShifts = 0;
    $unpairedIns  = 0;
    $totalHours   = 0.0;

    $pendingIn = null;
    foreach ($logs as $log) {
        if ($log['type'] === 'IN') {
            if ($pendingIn !== null) {
                // Two INs in a row with no OUT between them — the first one is unpaired.
                $unpairedIns++;
                $detailRows[] = [
                    $userId, $user['name'], $user['email'],
                    substr($pendingIn['event_time'], 0, 10),
                    $pendingIn['event_time'], '', '',
                    $pendingIn['notes'] ?? '', '',
                    'NO MATCHING OUT',
                ];
                $bumpMonth($userId, substr($pendingIn['event_time'], 0, 7), 0, 1, 0.0);
            }
            $pendingIn = $log;
            continue;
        }

        // type === 'OUT'
        if ($pendingIn === null) {
            $detailRows[] = [
                $userId, $user['name'], $user['email'],
                substr($log['event_time'], 0, 10),
                '', $log['event_time'], '',
                '', $log['notes'] ?? '',
                'OUT WITH NO MATCHING IN',
            ];
            continue;
        }

        $inTime  = new DateTime($pendingIn['event_time']);
        $outTime = new DateTime($log['event_time']);
        $hours   = round(($outTime->getTimestamp() - $inTime->getTimestamp()) / 3600, 2);

        $flags = [];
        if ($hours < 0)  { $flags[] = 'OUT BEFORE IN'; }
        if ($hours > 16) { $flags[] = '> 16 HOURS'; }

        $detailRows[] = [
            $userId, $user['name'], $user['email'],
            $inTime->format('Y-m-d'),
            $pendingIn['event_time'], $log['event_time'], $hours,
            $pendingIn['notes'] ?? '', $log['notes'] ?? '',
            implode('; ', $flags),
        ];

        if ($hours >= 0) {
            $pairedShifts++;
            $totalHours += $hours;
            $bumpMonth($userId, $inTime->format('Y-m'), 1, 0, $hours);
        }
        $pendingIn = null;
    }

    if ($pendingIn !== null) {
        $unpairedIns++;
        $detailRows[] = [
            $userId, $user['name'], $user['email'],
            substr($pendingIn['event_time'], 0, 10),
            $pendingIn['event_time'], '', '',
            $pendingIn['notes'] ?? '', '',
            'NO MATCHING OUT',
        ];
        $bumpMonth($userId, substr($pendingIn['event_time'], 0, 7), 0, 1, 0.0);
    }

    $summaryRows[] = [
        $userId, $user['name'], $user['email'],
        $pairedShifts, $unpairedIns, round($totalHours, 2),
    ];
}

$monthlyRows = [];
foreach ($monthlyTotals as $row) {
    $user = $users[$row['user_id']] ?? ['name' => 'user #' . $row['user_id'], 'email' => null];
    $monthlyRows[] = [
        $row['user_id'], $user['name'], $user['email'], $row['month'],
        $row['paired'], $row['unpaired'], round($row['hours'], 2),
    ];
}

// Sort all three by employee name (then date/month) for easy scanning.
usort($detailRows, fn($a, $b) => strcmp($a[1], $b[1]) ?: strcmp($a[3], $b[3]));
usort($summaryRows, fn($a, $b) => strcmp($a[1], $b[1]));
usort($monthlyRows, fn($a, $b) => strcmp($a[1], $b[1]) ?: strcmp($a[3], $b[3]));

if (!is_dir($OUTPUT_DIR)) {
    fwrite(STDERR, "Output directory '$OUTPUT_DIR' does not exist.\n");
    exit(1);
}

$detailPath = $OUTPUT_DIR . '/legacy_timelogs_review.csv';
$fh = fopen($detailPath, 'w');
fputcsv($fh, ['old_user_id', 'employee_name', 'email', 'date', 'clock_in', 'clock_out', 'hours_worked', 'in_notes', 'out_notes', 'flag'], ',', '"', '\\');
foreach ($detailRows as $row) { fputcsv($fh, $row, ',', '"', '\\'); }
fclose($fh);

$summaryPath = $OUTPUT_DIR . '/legacy_timelogs_summary.csv';
$fh = fopen($summaryPath, 'w');
fputcsv($fh, ['old_user_id', 'employee_name', 'email', 'paired_shifts', 'unpaired_ins', 'total_hours'], ',', '"', '\\');
foreach ($summaryRows as $row) { fputcsv($fh, $row, ',', '"', '\\'); }
fclose($fh);

$monthlyPath = $OUTPUT_DIR . '/legacy_timelogs_monthly.csv';
$fh = fopen($monthlyPath, 'w');
fputcsv($fh, ['old_user_id', 'employee_name', 'email', 'month', 'paired_shifts', 'unpaired_ins', 'total_hours'], ',', '"', '\\');
foreach ($monthlyRows as $row) { fputcsv($fh, $row, ',', '"', '\\'); }
fclose($fh);

echo "Wrote $detailPath (" . count($detailRows) . " rows)\n";
echo "Wrote $summaryPath (" . count($summaryRows) . " rows)\n";
echo "Wrote $monthlyPath (" . count($monthlyRows) . " rows)\n";
