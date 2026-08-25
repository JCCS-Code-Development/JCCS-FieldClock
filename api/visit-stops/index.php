<?php
// Quick-add log of extra places visited during a shift — a specific suite,
// room, or a whole separate site too minor to register as a real Job.
// Purely informational: no job_id, no effect on pay, no approval needed.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // An admin may look up a specific employee's stops (e.g. from
    // Timesheets); anyone else always gets their own, regardless of any
    // user_id passed — same self-vs-admin scoping used throughout this API.
    $requestedId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : $auth['user_id'];
    $userId      = $requestedId === (int)$auth['user_id'] ? $requestedId : null;
    if ($userId === null) {
        requireAdmin($auth);
        $userId = $requestedId;
    }

    $start = $_GET['start'] ?? date('Y-m-d', strtotime('-7 days'));
    $end   = $_GET['end']   ?? date('Y-m-d');

    $stmt = $pdo->prepare(
        'SELECT id, visit_date, name, note, created_at FROM visit_stops
         WHERE user_id = ? AND visit_date BETWEEN ? AND ?
         ORDER BY visit_date DESC, id DESC'
    );
    $stmt->execute([$userId, $start, $end]);
    echo json_encode(['stops' => $stmt->fetchAll()]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();
    requireFields($body, ['name']);

    $name = sanitizeString($body['name']);
    if ($name === '') { http_response_code(422); exit(json_encode(['error' => 'Name is required'])); }

    $visitDate = !empty($body['visit_date']) ? sanitizeString($body['visit_date']) : date('Y-m-d');
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $visitDate);
    if (!$parsed || $parsed->format('Y-m-d') !== $visitDate) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid visit date']));
    }

    $note = !empty($body['note']) ? sanitizeString($body['note']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO visit_stops (user_id, visit_date, name, note) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$auth['user_id'], $visitDate, $name, $note]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare('SELECT id, visit_date, name, note, created_at FROM visit_stops WHERE id = ?');
    $row->execute([$id]);
    echo json_encode(['stop' => $row->fetch()]);
    exit;
}

http_response_code(405);
