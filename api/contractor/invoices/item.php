<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';
require_once __DIR__ . '/../../push/push-helper.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── PUT: admin updates invoice status ────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);

    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $allowed = ['submitted', 'under_review', 'check_ready', 'paid'];
    $status  = sanitizeString($body['status'] ?? '');
    if (!in_array($status, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid status']));
    }

    $note = !empty($body['admin_note']) ? sanitizeString($body['admin_note']) : null;

    $pdo->prepare(
        'UPDATE contractor_invoices SET status=?, admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?'
    )->execute([$status, $note, $auth['user_id'], $id]);

    // Fetch updated row (need user_id for push)
    $row = $pdo->prepare(
        'SELECT ci.*, u.name AS contractor_name FROM contractor_invoices ci JOIN users u ON u.id = ci.user_id WHERE ci.id = ?'
    );
    $row->execute([$id]);
    $invoice = $row->fetch();

    // Send push notification when check becomes ready
    if ($status === 'check_ready' && $invoice) {
        push_to_user($pdo, (int)$invoice['user_id']);
    }

    echo json_encode(['invoice' => $invoice]);
    exit;
}

// ── DELETE: contractor deletes own submitted invoice ─────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $row = $pdo->prepare('SELECT * FROM contractor_invoices WHERE id = ?');
    $row->execute([$id]);
    $invoice = $row->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    // Contractors can only delete their own submitted invoices; admins can delete any
    if ($auth['role'] !== 'admin') {
        if ($invoice['user_id'] != $auth['user_id'] || $invoice['status'] !== 'submitted') {
            http_response_code(403);
            exit(json_encode(['error' => 'Cannot delete this invoice']));
        }
    }

    // Remove the file
    $filePath = __DIR__ . '/../../' . $invoice['file_path'];
    if (file_exists($filePath)) unlink($filePath);

    $pdo->prepare('DELETE FROM contractor_invoices WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
