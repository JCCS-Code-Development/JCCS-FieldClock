<?php
/**
 * Secure vendor-invoice file download.
 * Usage: GET /api/vendor-invoices/download.php?id=X[&_t=token]
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if (!isset($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['_t'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['_t'];
}

$auth = requireAuth();
if ($auth['role'] !== 'admin') { http_response_code(403); exit(json_encode(['error' => 'Forbidden'])); }
$pdo = getPDO();
$id  = (int)($_GET['id'] ?? 0);
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

$stmt = $pdo->prepare('SELECT * FROM vendor_invoices WHERE id = ?');
$stmt->execute([$id]);
$invoice = $stmt->fetch();
if (!$invoice || empty($invoice['file_path'])) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

$filePath = realpath(__DIR__ . '/../' . $invoice['file_path']);
if (!$filePath || !file_exists($filePath)) { http_response_code(404); exit(json_encode(['error' => 'File not found'])); }

$mimeMap = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png', 'webp' => 'image/webp'];
$ext  = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
$mime = $mimeMap[$ext] ?? 'application/octet-stream';

header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . basename($invoice['file_original_name']) . '"');
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: private, max-age=3600');
readfile($filePath);
exit;
