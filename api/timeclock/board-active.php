<?php
// GET /api/timeclock/board-active.php
//
// Read-only list of who is clocked in right now, for the JCCS Office
// Operations Board (a separate app). It does NOT use a FieldClock login:
// the board runs unattended on an office TV. Instead it accepts a shared
// service token in the X-Board-Token header, matched against OPS_BOARD_TOKEN
// in config.php.
//
// Returns names + current status + job only. No hours, no pay, no GPS —
// nothing payroll-related. Changes nothing: no writes, no schema.
ini_set('display_errors', 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$expected = defined('OPS_BOARD_TOKEN') ? (string) OPS_BOARD_TOKEN : '';
$given    = (string) ($_SERVER['HTTP_X_BOARD_TOKEN'] ?? '');
if ($expected === '' || $expected === 'CHANGE_ME' || !hash_equals($expected, $given)) {
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid board token']));
}

$pdo = getPDO();

// An open entry (end_time IS NULL) that isn't a wrap-up marker = on the clock.
// Anyone actually on the clock shows (an admin doing field work still needs
// to appear), except contractors. The OFF-clock roster below stays
// employees-only so it doesn't list every office admin.
$rows = $pdo->query(
    "SELECT u.id, u.name, te.status_label, te.start_time, j.name AS job_name, j.client_name
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     LEFT JOIN jobs j ON j.id = te.job_id
     WHERE te.end_time IS NULL
       AND u.role <> 'contractor'
       AND (te.status_label IS NULL OR te.status_label NOT IN ('done'))
       AND (te.cost_category IS NULL OR te.cost_category <> 'day_end')
     ORDER BY u.name"
)->fetchAll();

$out = array_map(static function ($r) {
    return [
        'user_id'      => (int) $r['id'],
        'name'         => $r['name'],
        'status_label' => $r['status_label'],
        'job_name'     => $r['job_name'],
        'client_name'  => $r['client_name'],
        'since'        => $r['start_time'],
    ];
}, $rows);

// The full EMPLOYEE roster — active and inactive — so the board's personnel
// column can show everyone: clocked in (grouped by site), off the clock, and
// a greyed "Inactive" group. Admins and contractors are excluded.
$roster = array_map(
    static fn($r) => [
        'user_id'   => (int) $r['id'],
        'name'      => $r['name'],
        'is_active' => (bool) $r['is_active'],
    ],
    $pdo->query("SELECT id, name, is_active FROM users WHERE role = 'employee' ORDER BY is_active DESC, name")->fetchAll()
);

echo json_encode([
    'as_of'   => (new DateTimeImmutable('now', new DateTimeZone(FIELDCLOCK_TIMEZONE)))->format('c'),
    'count'   => count($out),
    'workers' => $out,
    'roster'  => $roster,
]);
