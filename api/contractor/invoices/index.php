<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

require_once __DIR__ . '/_helper.php';

// Contractors don't log in to the app — every invoice here is uploaded and
// managed by an admin on a contractor's behalf.
$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();

// ── GET: list invoices — by pay period (Payroll's Contractors tab) or by
// job (per-project tracking on the Jobs page); either filter is optional
// and they can combine ────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $ps    = $_GET['period_start'] ?? null;
    $pe    = $_GET['period_end']   ?? null;
    $jobId = !empty($_GET['job_id']) ? (int)$_GET['job_id'] : null;
    $sql = INVOICE_SELECT . ' WHERE 1=1';
    $params = [];
    if ($ps)    { $sql .= ' AND ci.period_start >= ?'; $params[] = $ps; }
    if ($pe)    { $sql .= ' AND ci.period_end <= ?';   $params[] = $pe; }
    if ($jobId) { $sql .= ' AND je.job_id = ?';        $params[] = $jobId; }
    $sql .= ' ORDER BY ci.created_at DESC';

    $s = $pdo->prepare($sql);
    $s->execute($params);
    echo json_encode(['invoices' => $s->fetchAll()]);
    exit;
}

// ── POST: admin uploads an invoice on behalf of a contractor
// (multipart/form-data — a picture or PDF of the invoice/receipt) ────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['file'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'file is required']));
    }
    $userId = (int)($_POST['user_id'] ?? 0);
    if (!$userId) {
        http_response_code(422);
        exit(json_encode(['error' => 'user_id is required']));
    }
    if (empty($_POST['period_start']) || empty($_POST['period_end'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'period_start and period_end are required']));
    }

    $contractor = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'contractor'");
    $contractor->execute([$userId]);
    if (!$contractor->fetch()) {
        http_response_code(404);
        exit(json_encode(['error' => 'Contractor not found']));
    }

    $file = $_FILES['file'];

    // Validate MIME type
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    $allowed  = ['application/pdf' => 'pdf', 'image/jpeg' => 'image', 'image/png' => 'image', 'image/webp' => 'image'];
    if (!array_key_exists($mimeType, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Only PDF and image files (JPEG, PNG, WEBP) are allowed']));
    }
    if ($file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        exit(json_encode(['error' => 'File must be under 10 MB']));
    }

    $fileType    = $allowed[$mimeType];
    $ext         = $mimeType === 'application/pdf' ? 'pdf' : pathinfo($file['name'], PATHINFO_EXTENSION);
    $uploadDir   = __DIR__ . '/../../uploads/invoices/' . $userId . '/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $filename    = bin2hex(random_bytes(16)) . '.' . $ext;
    $destination = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        http_response_code(500);
        exit(json_encode(['error' => 'Failed to save file']));
    }

    $filePath       = 'uploads/invoices/' . $userId . '/' . $filename;
    $origName       = sanitizeString($file['name']);
    $amount         = !empty($_POST['amount'])         ? (float)$_POST['amount']              : null;
    $periodStart    = sanitizeString($_POST['period_start'] ?? '');
    $periodEnd      = sanitizeString($_POST['period_end']   ?? '');
    $invoiceNumber  = !empty($_POST['invoice_number'])  ? sanitizeString($_POST['invoice_number']) : null;
    $estimateNumber = !empty($_POST['estimate_number']) ? sanitizeString($_POST['estimate_number']) : null;
    $jobLocation    = !empty($_POST['job_location'])    ? sanitizeString($_POST['job_location'])    : null;
    $estimateId     = resolveEstimateId($pdo, $estimateNumber);

    $pdo->prepare(
        'INSERT INTO contractor_invoices
           (user_id, estimate_id, estimate_number, job_location, invoice_number, period_start, period_end,
            file_path, file_original_name, file_type, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'draft\')'
    )->execute([
        $userId, $estimateId, $estimateNumber, $jobLocation, $invoiceNumber, $periodStart, $periodEnd,
        $filePath, $origName, $fileType, $amount,
    ]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare(INVOICE_SELECT . ' WHERE ci.id = ?');
    $row->execute([$id]);
    echo json_encode(['invoice' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
