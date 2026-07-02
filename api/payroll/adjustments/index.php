<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth   = requireAuth(); requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $uid          = isset($_GET['user_id'])      ? (int)$_GET['user_id']       : null;
    $periodStart  = !empty($_GET['period_start']) ? $_GET['period_start']       : null;
    $periodEnd    = !empty($_GET['period_end'])   ? $_GET['period_end']         : null;

    $sql    = 'SELECT pa.*, u.name as user_name, c.name as created_by_name
               FROM pay_adjustments pa
               JOIN users u ON u.id = pa.user_id
               JOIN users c ON c.id = pa.created_by
               WHERE 1=1';
    $params = [];
    if ($uid)         { $sql .= ' AND pa.user_id = :uid';        $params[':uid'] = $uid; }
    if ($periodStart) { $sql .= ' AND pa.period_start >= :ps';   $params[':ps']  = $periodStart; }
    if ($periodEnd)   { $sql .= ' AND pa.period_end <= :pe';     $params[':pe']  = $periodEnd; }
    $sql .= ' ORDER BY pa.created_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['adjustments' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['user_id', 'type', 'amount', 'period_start', 'period_end']);
    $stmt = $pdo->prepare(
        'INSERT INTO pay_adjustments (user_id, type, amount, description, period_start, period_end, created_by) VALUES (?,?,?,?,?,?,?)'
    );
    $stmt->execute([
        (int)$body['user_id'],
        sanitizeString($body['type']),
        (float)$body['amount'],
        sanitizeString($body['description'] ?? ''),
        $body['period_start'],
        $body['period_end'],
        $auth['user_id'],
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Created']);
} else {
    http_response_code(405);
}
