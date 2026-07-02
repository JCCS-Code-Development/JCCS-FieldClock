<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list documents ──────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $userId = $auth['role'] === 'admin' && !empty($_GET['user_id'])
              ? (int)$_GET['user_id']
              : $auth['user_id'];

    // Non-admin contractors can only see their own docs
    if ($auth['role'] !== 'admin' && $userId !== $auth['user_id']) {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }

    $stmt = $pdo->prepare(
        'SELECT id, user_id, doc_type, file_original_name, uploaded_at
         FROM contractor_legal_documents
         WHERE user_id = ?
         ORDER BY doc_type, uploaded_at DESC'
    );
    $stmt->execute([$userId]);
    echo json_encode(['documents' => $stmt->fetchAll()]);
    exit;
}

// ── POST: upload document ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireContractorOrAdmin($auth);

    if (!isset($_FILES['file'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'file is required']));
    }

    $allowed_types = ['w9', 'workers_comp'];
    $docType = sanitizeString($_POST['doc_type'] ?? '');
    if (!in_array($docType, $allowed_types)) {
        http_response_code(422);
        exit(json_encode(['error' => 'doc_type must be w9 or workers_comp']));
    }

    $userId = $auth['role'] === 'admin' && !empty($_POST['user_id'])
              ? (int)$_POST['user_id']
              : $auth['user_id'];

    $file     = $_FILES['file'];
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    $allowed  = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    if (!array_key_exists($mimeType, $allowed)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Only PDF and image files (JPEG, PNG, WEBP) are allowed']));
    }
    if ($file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        exit(json_encode(['error' => 'File must be under 10 MB']));
    }

    $ext       = $allowed[$mimeType];
    $uploadDir = __DIR__ . '/../../uploads/legal/' . $userId . '/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $filename    = $docType . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    $destination = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        http_response_code(500);
        exit(json_encode(['error' => 'Failed to save file']));
    }

    $filePath = 'uploads/legal/' . $userId . '/' . $filename;
    $origName = sanitizeString($file['name']);

    $pdo->prepare(
        'INSERT INTO contractor_legal_documents (user_id, doc_type, file_path, file_original_name)
         VALUES (?, ?, ?, ?)'
    )->execute([$userId, $docType, $filePath, $origName]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare('SELECT id, user_id, doc_type, file_original_name, uploaded_at FROM contractor_legal_documents WHERE id = ?');
    $row->execute([$id]);
    echo json_encode(['document' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
