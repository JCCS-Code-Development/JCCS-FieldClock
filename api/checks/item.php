<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

// ── GET: single check ────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $stmt = $pdo->prepare(
        'SELECT cr.*, u.name AS updater_name
         FROM check_registry cr
         LEFT JOIN users u ON u.id = cr.status_updated_by
         WHERE cr.id = ?'
    );
    $stmt->execute([$id]);
    $check = $stmt->fetch();
    if (!$check) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    echo json_encode(['check' => $check]);
    exit;
}

// ── PUT: update status / notes ───────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $allowed = ['issued', 'voided', 'processed_online', 'processed_in_person'];
    $status  = sanitizeString($body['status'] ?? '');
    if (!in_array($status, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid status']));
    }

    $notes = !empty($body['notes']) ? sanitizeString($body['notes']) : null;

    $pdo->prepare(
        'UPDATE check_registry
         SET status = ?, notes = ?, status_updated_by = ?, status_updated_at = NOW()
         WHERE id = ?'
    )->execute([$status, $notes, $auth['user_id'], $id]);

    $row = $pdo->prepare(
        'SELECT cr.*, u.name AS updater_name
         FROM check_registry cr
         LEFT JOIN users u ON u.id = cr.status_updated_by
         WHERE cr.id = ?'
    );
    $row->execute([$id]);
    echo json_encode(['check' => $row->fetch()]);
    exit;
}

// ── DELETE: void a check (soft delete — set status = voided) ─────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $pdo->prepare(
        'UPDATE check_registry
         SET status = "voided", status_updated_by = ?, status_updated_at = NOW()
         WHERE id = ?'
    )->execute([$auth['user_id'], $id]);

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405); exit;
