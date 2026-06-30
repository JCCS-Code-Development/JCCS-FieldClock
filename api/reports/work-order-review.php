<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();

$reviewStatus = $_GET['review_status'] ?? 'pending_review';

$stmt = $pdo->prepare(
    'SELECT wo.*, j.name as job_name, j.client_name, u.name as employee_name
     FROM work_orders wo
     JOIN jobs j ON j.id = wo.job_id
     LEFT JOIN users u ON u.id = wo.assigned_user_id
     WHERE wo.review_status = ?
     ORDER BY wo.created_at DESC'
);
$stmt->execute([$reviewStatus]);
$wos = $stmt->fetchAll();

foreach ($wos as &$wo) {
    $photos = $pdo->prepare('SELECT * FROM work_order_photos WHERE work_order_id = ? ORDER BY uploaded_at');
    $photos->execute([$wo['id']]);
    $wo['photos'] = $photos->fetchAll();
}
echo json_encode(['work_orders' => $wos, 'review_status' => $reviewStatus]);
