<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';

// <img>/<a> tags can't set an Authorization header, so accept the token as a
// query param too — same pattern as contractor/documents/download.php.
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['_t'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['_t'];
}

$auth = requireAuth();
$pdo  = getPDO();
$id   = (int)($_GET['id'] ?? 0);

if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

$stmt = $pdo->prepare(
    'SELECT lp.receipt_file_path, lp.receipt_file_original_name, l.user_id
     FROM loan_payments lp
     JOIN employee_loans l ON l.id = lp.loan_id
     WHERE lp.id = ?'
);
$stmt->execute([$id]);
$payment = $stmt->fetch();

if (!$payment || !$payment['receipt_file_path']) {
    http_response_code(404);
    exit(json_encode(['error' => 'Not found']));
}

// Admin, or the employee the loan belongs to, may view the receipt.
if ($auth['role'] !== 'admin' && $payment['user_id'] != $auth['user_id']) {
    http_response_code(403);
    exit(json_encode(['error' => 'Forbidden']));
}

$filePath = realpath(__DIR__ . '/../../' . $payment['receipt_file_path']);
if (!$filePath || !file_exists($filePath)) {
    http_response_code(404);
    exit(json_encode(['error' => 'File not found on server']));
}

$mimeMap = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png', 'webp' => 'image/webp'];
$ext  = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
$mime = $mimeMap[$ext] ?? 'application/octet-stream';

header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . basename($payment['receipt_file_original_name'] ?? 'receipt') . '"');
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: private, max-age=3600');
readfile($filePath);
exit;
