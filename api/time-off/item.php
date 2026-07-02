<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── PUT: review (admin) or cancel (employee) ─────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);

    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id is required'])); }

    $s = $pdo->prepare('SELECT * FROM time_off_requests WHERE id = ?');
    $s->execute([$id]);
    $req = $s->fetch();
    if (!$req) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    if ($auth['role'] === 'admin') {
        $action = sanitizeString($body['action'] ?? '');
        if (!in_array($action, ['approve', 'reject'])) {
            http_response_code(422);
            exit(json_encode(['error' => 'action must be approve or reject']));
        }
        $status = $action === 'approve' ? 'approved' : 'rejected';
        $note   = !empty($body['admin_note']) ? sanitizeString($body['admin_note']) : null;

        $pdo->prepare(
            'UPDATE time_off_requests SET status=?, reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?'
        )->execute([$status, $auth['user_id'], $note, $id]);
    } else {
        if ($req['user_id'] != $auth['user_id']) {
            http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
        }
        if ($req['status'] !== 'pending') {
            http_response_code(422); exit(json_encode(['error' => 'Can only cancel pending requests']));
        }
        $pdo->prepare('DELETE FROM time_off_requests WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    $row = $pdo->prepare('SELECT r.*, u.name AS employee_name FROM time_off_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?');
    $row->execute([$id]);
    echo json_encode(['request' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
