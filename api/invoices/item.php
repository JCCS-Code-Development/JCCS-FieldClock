<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth(); requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$body   = $method !== 'GET' ? jsonBody() : [];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT i.*, j.name as job_name FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.id = ?');
    $stmt->execute([$id]);
    echo json_encode($stmt->fetch() ?: []);

} elseif ($method === 'PUT') {
    $allowed = ['amount','due_date','status','notes'];
    $sets = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "$f = ?";
            $params[] = $f === 'amount' ? (float)$body[$f] : sanitizeString($body[$f]);
        }
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $sets[] = 'updated_at = NOW()'; $params[] = $id;
    $pdo->prepare('UPDATE invoices SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare("UPDATE invoices SET status='voided' WHERE id=?")->execute([$id]);
    echo json_encode(['message' => 'Voided']);
} else {
    http_response_code(405);
}
