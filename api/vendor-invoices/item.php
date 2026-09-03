<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

require_once __DIR__ . '/_helper.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();

// ── GET: one vendor invoice, fully joined ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    $stmt = $pdo->prepare(VENDOR_INVOICE_SELECT . ' WHERE vi.id = ?');
    $stmt->execute([$id]);
    $invoice = $stmt->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    echo json_encode(['invoice' => $invoice]);
    exit;
}

// ── PUT: update status / amount / details ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $cur = $pdo->prepare('SELECT * FROM vendor_invoices WHERE id = ?');
    $cur->execute([$id]);
    $invoice = $cur->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    $sets = []; $params = [];

    if (array_key_exists('status', $body)) {
        $allowed = ['draft', 'printed', 'voided'];
        $status  = sanitizeString($body['status']);
        if (!in_array($status, $allowed, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid status'])); }
        if ($invoice['check_id'] && $status !== 'printed') {
            http_response_code(422);
            exit(json_encode(['error' => 'This invoice is on a check. Void that check first to change its status.']));
        }
        $sets[] = 'status = ?'; $params[] = $status;
    }
    foreach (['invoice_number' => 'invoice_number', 'memo' => 'memo', 'invoice_date' => 'invoice_date',
              'admin_note' => 'admin_note', 'period_start' => 'period_start', 'period_end' => 'period_end'] as $field => $col) {
        if (!array_key_exists($field, $body)) continue;
        $sets[] = "$col = ?";
        $params[] = ($body[$field] === '' || $body[$field] === null) ? null : sanitizeString((string)$body[$field]);
    }
    if (array_key_exists('amount', $body)) {
        $sets[] = 'amount = ?';
        $params[] = ($body['amount'] === null || $body['amount'] === '') ? null : (float)$body['amount'];
    }

    if (!$sets) { http_response_code(422); exit(json_encode(['error' => 'Nothing to update'])); }

    $params[] = $id;
    $pdo->prepare('UPDATE vendor_invoices SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $row = $pdo->prepare(VENDOR_INVOICE_SELECT . ' WHERE vi.id = ?');
    $row->execute([$id]);
    echo json_encode(['invoice' => $row->fetch()]);
    exit;
}

// ── DELETE: remove a vendor invoice (not once it's paid) ────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $row = $pdo->prepare('SELECT * FROM vendor_invoices WHERE id = ?');
    $row->execute([$id]);
    $invoice = $row->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    if ($invoice['status'] === 'printed' || $invoice['check_id']) {
        http_response_code(422);
        exit(json_encode(['error' => 'This invoice is on a check. Void that check first.']));
    }

    if (!empty($invoice['file_path'])) {
        $filePath = __DIR__ . '/../' . $invoice['file_path'];
        if (file_exists($filePath)) unlink($filePath);
    }
    $pdo->prepare('DELETE FROM vendor_invoices WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
