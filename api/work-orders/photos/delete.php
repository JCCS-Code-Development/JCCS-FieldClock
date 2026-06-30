<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') { http_response_code(405); exit; }
$auth = requireAuth();
$id   = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$pdo  = getPDO();

$photo = $pdo->prepare('SELECT * FROM work_order_photos WHERE id = ?');
$photo->execute([$id]);
$photo = $photo->fetch();
if (!$photo) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

$fullPath = UPLOAD_PATH . '/' . ltrim(str_replace(UPLOAD_URL_PREFIX, '', $photo['file_path']), '/');
if (file_exists($fullPath)) { unlink($fullPath); }
$pdo->prepare('DELETE FROM work_order_photos WHERE id = ?')->execute([$id]);
echo json_encode(['message' => 'Deleted']);
