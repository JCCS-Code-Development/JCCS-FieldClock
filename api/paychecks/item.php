<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../push/push-helper.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── PUT: update paycheck status (admin only) ─────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $allowed = ['processing', 'available', 'picked_up'];
    $status  = sanitizeString($body['status'] ?? '');
    if (!in_array($status, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid status']));
    }

    $notes = !empty($body['notes']) ? sanitizeString($body['notes']) : null;

    // Build update
    $sets = ['status = ?', 'notes = ?'];
    $params = [$status, $notes];
    if ($status === 'available') { $sets[] = 'available_at = NOW()'; }
    if ($status === 'picked_up') { $sets[] = 'picked_up_at = NOW()'; }
    $params[] = $id;

    $pdo->prepare('UPDATE paychecks SET ' . implode(', ', $sets) . ' WHERE id = ?')
        ->execute($params);

    // Fetch updated row
    $row = $pdo->prepare(
        'SELECT p.*, u.name AS employee_name FROM paychecks p JOIN users u ON u.id=p.user_id WHERE p.id=?'
    );
    $row->execute([$id]);
    $paycheck = $row->fetch();

    // Push notification when check becomes available
    if ($status === 'available' && $paycheck) {
        push_to_user($pdo, (int)$paycheck['user_id'], 'paycheck');
    }

    echo json_encode(['paycheck' => $paycheck]);
    exit;
}

// ── DELETE: admin only ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    $pdo->prepare('DELETE FROM paychecks WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405); exit;
