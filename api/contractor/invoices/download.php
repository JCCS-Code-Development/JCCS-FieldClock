<?php
/**
 * Secure invoice file download.
 * Usage: GET /api/contractor/invoices/download.php?id=X
 * Returns the file with correct Content-Type headers.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';

// Accept token via Authorization header OR ?_t= query param (for new-tab download links)
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['_t'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['_t'];
}

$auth = requireAuth();
$pdo  = getPDO();
$id   = (int)($_GET['id'] ?? 0);

if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

$stmt = $pdo->prepare('SELECT * FROM contractor_invoices WHERE id = ?');
$stmt->execute([$id]);
$invoice = $stmt->fetch();

if (!$invoice) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

// Contractors can only download their own; admins can download any
if ($auth['role'] !== 'admin' && $invoice['user_id'] != $auth['user_id']) {
    http_response_code(403);
    exit(json_encode(['error' => 'Forbidden']));
}

$filePath = realpath(__DIR__ . '/../../' . $invoice['file_path']);
if (!$filePath || !file_exists($filePath)) {
    http_response_code(404);
    exit(json_encode(['error' => 'File not found']));
}

$mimeMap = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png', 'webp' => 'image/webp'];
$ext      = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
$mime     = $mimeMap[$ext] ?? 'application/octet-stream';

// Override Content-Type for file serving
header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . basename($invoice['file_original_name']) . '"');
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: private, max-age=3600');
readfile($filePath);
exit;
