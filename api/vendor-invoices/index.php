<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

require_once __DIR__ . '/_helper.php';

// Vendors don't log in — every invoice here is registered and managed by an
// admin. Mirrors api/contractor/invoices, but the file is optional.
$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();

// ── GET: list vendor invoices, newest first ──────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $where  = ['1=1'];
    $params = [];
    if (!empty($_GET['status']))       { $where[] = 'vi.status = ?';        $params[] = sanitizeString($_GET['status']); }
    if (!empty($_GET['vendor_id']))    { $where[] = 'vi.vendor_id = ?';     $params[] = (int)$_GET['vendor_id']; }
    if (!empty($_GET['period_start'])) { $where[] = 'vi.period_start >= ?';  $params[] = sanitizeString($_GET['period_start']); }
    if (!empty($_GET['period_end']))   { $where[] = 'vi.period_end <= ?';    $params[] = sanitizeString($_GET['period_end']); }

    $sql = VENDOR_INVOICE_SELECT . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY vi.created_at DESC';
    $s = $pdo->prepare($sql);
    $s->execute($params);
    echo json_encode(['invoices' => $s->fetchAll()]);
    exit;
}

// ── POST: register a vendor invoice (multipart/form-data; file optional) ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $vendorId = (int)($_POST['vendor_id'] ?? 0);
    if (!$vendorId) { http_response_code(422); exit(json_encode(['error' => 'vendor_id is required'])); }

    $v = $pdo->prepare('SELECT id FROM vendors WHERE id = ?');
    $v->execute([$vendorId]);
    if (!$v->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Vendor not found'])); }

    $fileCols = ['file_path' => null, 'file_original_name' => null, 'file_type' => null];
    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $fileCols = saveVendorInvoiceFile($_FILES['file'], $vendorId);
    }

    $amount        = ($_POST['amount'] ?? '') !== '' ? (float)$_POST['amount'] : null;
    $invoiceNumber = !empty($_POST['invoice_number']) ? sanitizeString($_POST['invoice_number']) : null;
    $memo          = !empty($_POST['memo'])           ? sanitizeString($_POST['memo'])           : null;
    $invoiceDate   = !empty($_POST['invoice_date'])   ? sanitizeString($_POST['invoice_date'])   : null;
    $periodStart   = !empty($_POST['period_start'])   ? sanitizeString($_POST['period_start'])   : null;
    $periodEnd     = !empty($_POST['period_end'])     ? sanitizeString($_POST['period_end'])     : null;

    $pdo->prepare(
        'INSERT INTO vendor_invoices
           (vendor_id, invoice_number, memo, invoice_date, period_start, period_end,
            file_path, file_original_name, file_type, amount, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'draft\', ?)'
    )->execute([
        $vendorId, $invoiceNumber, $memo, $invoiceDate, $periodStart, $periodEnd,
        $fileCols['file_path'], $fileCols['file_original_name'], $fileCols['file_type'],
        $amount, $auth['user_id'],
    ]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare(VENDOR_INVOICE_SELECT . ' WHERE vi.id = ?');
    $row->execute([$id]);
    echo json_encode(['invoice' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
