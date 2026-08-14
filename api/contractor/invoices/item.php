<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: single invoice, fully joined — used for the contractor check
// pay stub (contractor name/address, the estimate/job it's paying toward) ─
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $stmt = $pdo->prepare(
        'SELECT ci.*, u.name AS contractor_name, u.address AS contractor_address,
                je.job_id AS estimate_job_id, je.estimate_number, je.description AS estimate_description,
                j.name AS job_name, j.client_name AS job_client_name
         FROM contractor_invoices ci
         JOIN users u ON u.id = ci.user_id
         LEFT JOIN job_estimates je ON je.id = ci.estimate_id
         LEFT JOIN jobs j ON j.id = je.job_id
         WHERE ci.id = ?'
    );
    $stmt->execute([$id]);
    $invoice = $stmt->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    echo json_encode(['invoice' => $invoice]);
    exit;
}

// ── PUT: admin updates status and/or estimate/invoice-number assignment ──
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);

    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $sets = []; $params = [];

    if (array_key_exists('status', $body)) {
        $allowed = ['submitted', 'under_review', 'check_ready', 'paid'];
        $status  = sanitizeString($body['status']);
        if (!in_array($status, $allowed)) {
            http_response_code(422);
            exit(json_encode(['error' => 'Invalid status']));
        }
        $sets[] = 'status = ?';        $params[] = $status;
        $sets[] = 'reviewed_by = ?';   $params[] = $auth['user_id'];
        $sets[] = 'reviewed_at = NOW()';
    }
    if (array_key_exists('admin_note', $body)) {
        $sets[] = 'admin_note = ?';
        $params[] = !empty($body['admin_note']) ? sanitizeString($body['admin_note']) : null;
    }
    if (array_key_exists('estimate_id', $body)) {
        $sets[] = 'estimate_id = ?';
        $params[] = !empty($body['estimate_id']) ? (int)$body['estimate_id'] : null;
    }
    if (array_key_exists('invoice_number', $body)) {
        $sets[] = 'invoice_number = ?';
        $params[] = !empty($body['invoice_number']) ? sanitizeString($body['invoice_number']) : null;
    }
    if (array_key_exists('amount', $body)) {
        $sets[] = 'amount = ?';
        $params[] = ($body['amount'] === null || $body['amount'] === '') ? null : (float)$body['amount'];
    }

    if (!$sets) { http_response_code(422); exit(json_encode(['error' => 'Nothing to update'])); }

    $params[] = $id;
    $pdo->prepare('UPDATE contractor_invoices SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $row = $pdo->prepare(
        'SELECT ci.*, u.name AS contractor_name, u.address AS contractor_address,
                je.job_id AS estimate_job_id, je.estimate_number, je.description AS estimate_description,
                j.name AS job_name, j.client_name AS job_client_name
         FROM contractor_invoices ci
         JOIN users u ON u.id = ci.user_id
         LEFT JOIN job_estimates je ON je.id = ci.estimate_id
         LEFT JOIN jobs j ON j.id = je.job_id
         WHERE ci.id = ?'
    );
    $row->execute([$id]);
    $invoice = $row->fetch();

    echo json_encode(['invoice' => $invoice]);
    exit;
}

// ── DELETE: admin removes an invoice ──────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $row = $pdo->prepare('SELECT * FROM contractor_invoices WHERE id = ?');
    $row->execute([$id]);
    $invoice = $row->fetch();
    if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    // Remove the file
    $filePath = __DIR__ . '/../../' . $invoice['file_path'];
    if (file_exists($filePath)) unlink($filePath);

    $pdo->prepare('DELETE FROM contractor_invoices WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
