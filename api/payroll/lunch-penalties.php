<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_helper.php';

// "No lunch registered" penalties — 1 hour deducted from a single work day.
// The admin Timesheets page suggests one for any day with 6+ hours worked
// and no Lunch entry, but it's only ever recorded here when an admin
// explicitly applies it. Employees can read their own (shown on My Pay);
// only admins can apply or remove one.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $userId = $auth['role'] === 'admin' && isset($_GET['user_id']) ? (int)$_GET['user_id'] : $auth['user_id'];
    $start  = $_GET['start'] ?? date('Y-m-d', strtotime('monday this week'));
    $end    = $_GET['end']   ?? date('Y-m-d');
    $stmt = $pdo->prepare(
        'SELECT id, user_id, work_date, minutes, created_at FROM lunch_penalties
         WHERE user_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date'
    );
    $stmt->execute([$userId, $start, $end]);
    echo json_encode(['penalties' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['user_id', 'work_date']);
    $date = DateTime::createFromFormat('Y-m-d', $body['work_date']);
    if (!$date || $date->format('Y-m-d') !== $body['work_date']) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid work_date']));
    }
    // INSERT IGNORE — applying twice for the same day (double-click, two
    // tabs) is a no-op rather than a second hour deducted.
    $pdo->prepare(
        'INSERT IGNORE INTO lunch_penalties (user_id, work_date, minutes, created_by) VALUES (?, ?, ?, ?)'
    )->execute([(int)$body['user_id'], $body['work_date'], LUNCH_PENALTY_MINUTES, $auth['user_id']]);
    echo json_encode(['message' => 'Applied']);

} elseif ($method === 'DELETE') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    $pdo->prepare('DELETE FROM lunch_penalties WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Removed']);

} else {
    http_response_code(405);
}
