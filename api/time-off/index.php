<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list requests ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $isAdmin = $auth['role'] === 'admin';

    if ($isAdmin) {
        $status = $_GET['status'] ?? null;
        $sql  = 'SELECT r.*, u.name AS employee_name
                 FROM time_off_requests r
                 JOIN users u ON u.id = r.user_id';
        $params = [];
        if ($status) { $sql .= ' WHERE r.status = ?'; $params[] = $status; }
        $sql .= ' ORDER BY r.created_at DESC';
    } else {
        $sql    = 'SELECT r.* FROM time_off_requests r WHERE r.user_id = ? ORDER BY r.created_at DESC';
        $params = [$auth['user_id']];
    }

    $s = $pdo->prepare($sql);
    $s->execute($params);
    echo json_encode(['requests' => $s->fetchAll()]);
    exit;
}

// ── POST: create request ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();

    if (empty($body['type']) || empty($body['start_date']) || empty($body['end_date'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'type, start_date and end_date are required']));
    }

    $allowed = ['vacation', 'sick', 'personal', 'unpaid'];
    $type = sanitizeString($body['type']);
    if (!in_array($type, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid type']));
    }

    $start  = $body['start_date'];
    $end    = $body['end_date'];
    $reason = !empty($body['reason']) ? sanitizeString($body['reason']) : null;

    $pdo->prepare(
        'INSERT INTO time_off_requests (user_id, type, start_date, end_date, reason, status)
         VALUES (?, ?, ?, ?, ?, \'pending\')'
    )->execute([$auth['user_id'], $type, $start, $end, $reason]);

    $id = (int)$pdo->lastInsertId();
    $row = $pdo->prepare('SELECT * FROM time_off_requests WHERE id = ?');
    $row->execute([$id]);
    echo json_encode(['request' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
