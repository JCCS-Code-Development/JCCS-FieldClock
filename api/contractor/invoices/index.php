<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list invoices ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($auth['role'] === 'admin') {
        // Admin sees all invoices (optionally filtered by period)
        $ps = $_GET['period_start'] ?? null;
        $pe = $_GET['period_end']   ?? null;
        $sql = 'SELECT ci.*, u.name AS contractor_name
                FROM contractor_invoices ci
                JOIN users u ON u.id = ci.user_id
                WHERE 1=1';
        $params = [];
        if ($ps) { $sql .= ' AND ci.period_start >= ?'; $params[] = $ps; }
        if ($pe) { $sql .= ' AND ci.period_end <= ?';   $params[] = $pe; }
        $sql .= ' ORDER BY ci.created_at DESC';
    } else {
        // Contractor sees own invoices
        $sql    = 'SELECT * FROM contractor_invoices WHERE user_id = ? ORDER BY created_at DESC';
        $params = [$auth['user_id']];
    }
    $s = $pdo->prepare($sql);
    $s->execute($params);
    echo json_encode(['invoices' => $s->fetchAll()]);
    exit;
}

// ── POST: upload invoice (multipart/form-data) ───────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Contractors and admins may upload
    if (!isset($_FILES['file'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'file is required']));
    }
    if (empty($_POST['period_start']) || empty($_POST['period_end'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'period_start and period_end are required']));
    }

    $file     = $_FILES['file'];
    $userId   = $auth['role'] === 'admin' && !empty($_POST['user_id'])
                ? (int)$_POST['user_id']
                : $auth['user_id'];

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

    $filePath    = 'uploads/invoices/' . $userId . '/' . $filename;
    $origName    = sanitizeString($file['name']);
    $amount      = !empty($_POST['amount']) ? (float)$_POST['amount'] : null;
    $periodStart = $_POST['period_start'];
    $periodEnd   = $_POST['period_end'];

    $pdo->prepare(
        'INSERT INTO contractor_invoices (user_id, period_start, period_end, file_path, file_original_name, file_type, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, \'submitted\')'
    )->execute([$userId, $periodStart, $periodEnd, $filePath, $origName, $fileType, $amount]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare('SELECT * FROM contractor_invoices WHERE id = ?');
    $row->execute([$id]);
    echo json_encode(['invoice' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
