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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$auth = requireAuth();
$pdo  = getPDO();

// Current open entry for this user
$stmt = $pdo->prepare(
    'SELECT te.*, j.name as job_name, j.client_name, j.address, j.clock_in_radius_meters
     FROM time_entries te
     LEFT JOIN jobs j ON j.id = te.job_id
     WHERE te.user_id = ? AND te.end_time IS NULL
     ORDER BY te.start_time DESC LIMIT 1'
);
$stmt->execute([$auth['user_id']]);
$entry = $stmt->fetch() ?: null;

$activeJob = null;
if ($entry && $entry['job_id']) {
    $activeJob = [
        'id'                    => $entry['job_id'],
        'name'                  => $entry['job_name'],
        'client_name'           => $entry['client_name'],
        'address'               => $entry['address'],
        'clock_in_radius_meters'=> $entry['clock_in_radius_meters'],
    ];
}

// Admin view: all currently clocked-in employees
$activeEmployees = [];
if ($auth['role'] === 'admin') {
    $all = $pdo->query(
        'SELECT u.id, u.name, te.status_label, j.name as job_name
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
         LEFT JOIN jobs j ON j.id = te.job_id
         WHERE te.end_time IS NULL AND te.status_label NOT IN (\'done\', \'day_end\')
         ORDER BY u.name'
    )->fetchAll();
    $activeEmployees = $all;
}

echo json_encode([
    'statusLabel'      => $entry ? $entry['status_label'] : null,
    'dayStarted'       => $entry !== null,
    'currentEntry'     => $entry,
    'activeJob'        => $activeJob,
    'active_employees' => $activeEmployees,
]);
exit;
