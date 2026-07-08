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
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if ($auth['role'] === 'admin') {
        $status = isset($_GET['status']) ? $_GET['status'] : 'pending';
        $stmt = $pdo->prepare(
            'SELECT cr.*, u.name AS employee_name,
                    te.start_time AS entry_start, te.end_time AS entry_end,
                    te.status_label, j.name AS job_name
             FROM time_change_requests cr
             JOIN users u ON u.id = cr.requested_by
             JOIN time_entries te ON te.id = cr.entry_id
             LEFT JOIN jobs j ON j.id = te.job_id
             WHERE cr.status = ?
             ORDER BY cr.created_at DESC'
        );
        $stmt->execute([$status]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT cr.*, te.start_time AS entry_start, te.end_time AS entry_end,
                    te.status_label, j.name AS job_name
             FROM time_change_requests cr
             JOIN time_entries te ON te.id = cr.entry_id
             LEFT JOIN jobs j ON j.id = te.job_id
             WHERE cr.requested_by = ?
             ORDER BY cr.created_at DESC
             LIMIT 20'
        );
        $stmt->execute([$auth['user_id']]);
    }
    echo json_encode(['requests' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['entry_id', 'reason']);

    // Employees can only request changes on their own entries
    $check = $pdo->prepare('SELECT id, user_id FROM time_entries WHERE id = ?');
    $check->execute([(int)$body['entry_id']]);
    $entry = $check->fetch();
    if (!$entry) { http_response_code(404); exit(json_encode(['error' => 'Entry not found'])); }
    if ($auth['role'] !== 'admin' && $entry['user_id'] != $auth['user_id']) {
        http_response_code(403); exit(json_encode(['error' => 'Not your entry']));
    }

    // One pending request per entry at a time
    $existing = $pdo->prepare('SELECT id FROM time_change_requests WHERE entry_id = ? AND status = ?');
    $existing->execute([(int)$body['entry_id'], 'pending']);
    if ($existing->fetch()) {
        http_response_code(409);
        exit(json_encode(['error' => 'A pending request already exists for this entry']));
    }

    $stmt = $pdo->prepare(
        'INSERT INTO time_change_requests (entry_id, requested_by, requested_start, requested_end, reason)
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        (int)$body['entry_id'],
        $auth['user_id'],
        isset($body['requested_start']) ? sanitizeString($body['requested_start']) : null,
        isset($body['requested_end'])   ? sanitizeString($body['requested_end'])   : null,
        sanitizeString($body['reason']),
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Request submitted']);

} else {
    http_response_code(405);
}
