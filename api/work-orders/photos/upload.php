<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth();

$woId = isset($_POST['work_order_id']) ? (int)$_POST['work_order_id'] : 0;
if (!$woId) { http_response_code(422); exit(json_encode(['error' => 'work_order_id required'])); }

$file    = $_FILES['photo'] ?? null;
$allowed = ['image/jpeg', 'image/png', 'image/webp'];
if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422); exit(json_encode(['error' => 'No file uploaded']));
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
if (!in_array($mime, $allowed)) {
    http_response_code(422); exit(json_encode(['error' => 'Only JPEG, PNG, and WebP images allowed']));
}
if ($file['size'] > 10 * 1024 * 1024) {
    http_response_code(422); exit(json_encode(['error' => 'File too large (max 10MB)']));
}

$ext    = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime];
$uuid   = bin2hex(random_bytes(16));
$dir    = UPLOAD_PATH . "/work-orders/$woId";
$relPath = UPLOAD_URL_PREFIX . "/work-orders/$woId/$uuid.$ext";

if (!is_dir($dir)) { mkdir($dir, 0755, true); }
if (!move_uploaded_file($file['tmp_name'], "$dir/$uuid.$ext")) {
    http_response_code(500); exit(json_encode(['error' => 'Upload failed']));
}

$pdo = getPDO();
$stmt = $pdo->prepare('INSERT INTO work_order_photos (work_order_id, file_path, caption, uploaded_by) VALUES (?,?,?,?)');
$stmt->execute([$woId, $relPath, sanitizeString($_POST['caption'] ?? ''), $auth['user_id']]);
echo json_encode(['id' => (int)$pdo->lastInsertId(), 'file_path' => $relPath]);
