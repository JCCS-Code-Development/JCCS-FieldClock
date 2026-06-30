<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT wo.*, j.name as job_name, u.name as employee_name FROM work_orders wo
            LEFT JOIN jobs j ON j.id = wo.job_id
            LEFT JOIN users u ON u.id = wo.assigned_user_id
            WHERE 1=1';

    if (isset($_GET['job_id']))      { $sql .= ' AND wo.job_id = :jid';    $params[':jid']    = (int)$_GET['job_id']; }
    if (isset($_GET['status']))      { $sql .= ' AND wo.status = :st';     $params[':st']     = $_GET['status']; }
    if (isset($_GET['review_status'])) { $sql .= ' AND wo.review_status = :rs'; $params[':rs'] = $_GET['review_status']; }
    $sql .= ' ORDER BY wo.created_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $wos = $stmt->fetchAll();

    foreach ($wos as &$wo) {
        $photos = $pdo->prepare('SELECT * FROM work_order_photos WHERE work_order_id = ? ORDER BY uploaded_at ASC');
        $photos->execute([$wo['id']]);
        $wo['photos'] = $photos->fetchAll();
    }

    echo json_encode(['work_orders' => $wos]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['job_id', 'title']);
    $source       = sanitizeString($body['source'] ?? 'office');
    $reviewStatus = $source === 'field' ? 'pending_review' : 'approved';

    $stmt = $pdo->prepare(
        'INSERT INTO work_orders (job_id, title, area, description, notes, assigned_user_id, source, review_status) VALUES (?,?,?,?,?,?,?,?)'
    );
    $stmt->execute([
        (int)$body['job_id'],
        sanitizeString($body['title']),
        sanitizeString($body['area'] ?? ''),
        sanitizeString($body['description'] ?? ''),
        sanitizeString($body['notes'] ?? ''),
        $body['assigned_user_id'] ? (int)$body['assigned_user_id'] : null,
        $source,
        $reviewStatus,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Created']);
} else {
    http_response_code(405);
}
