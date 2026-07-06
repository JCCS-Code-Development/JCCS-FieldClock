<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth(); requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function fetchPayment(PDO $pdo, int $id): array|false {
    $s = $pdo->prepare(
        'SELECT frp.*, u.name AS user_name
         FROM flat_rate_payments frp
         JOIN users u ON u.id = frp.user_id
         WHERE frp.id = ?'
    );
    $s->execute([$id]);
    return $s->fetch();
}

if ($method === 'GET') {
    $sql    = 'SELECT frp.*, u.name AS user_name
               FROM flat_rate_payments frp
               JOIN users u ON u.id = frp.user_id
               WHERE 1=1';
    $params = [];

    if (!empty($_GET['period_start'])) {
        $sql .= ' AND frp.period_start >= :ps';
        $params[':ps'] = $_GET['period_start'];
    }
    if (!empty($_GET['period_end'])) {
        $sql .= ' AND frp.period_end <= :pe';
        $params[':pe'] = $_GET['period_end'];
    }
    if (!empty($_GET['user_id'])) {
        $sql .= ' AND frp.user_id = :uid';
        $params[':uid'] = (int)$_GET['user_id'];
    }
    $sql .= ' ORDER BY frp.created_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['flat_rate_payments' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['user_id', 'amount', 'description', 'period_start', 'period_end']);

    $pdo->prepare(
        'INSERT INTO flat_rate_payments (user_id, period_start, period_end, amount, description, status, created_by)
         VALUES (?, ?, ?, ?, ?, \'pending\', ?)'
    )->execute([
        (int)$body['user_id'],
        $body['period_start'],
        $body['period_end'],
        (float)$body['amount'],
        sanitizeString($body['description']),
        $auth['user_id'],
    ]);

    echo json_encode(['flat_rate_payment' => fetchPayment($pdo, (int)$pdo->lastInsertId())]);

} elseif ($method === 'PUT') {
    $body   = jsonBody();
    $id     = (int)($body['id'] ?? 0);
    $status = $body['status'] ?? '';

    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    if (!in_array($status, ['pending', 'issued'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'status must be pending or issued']));
    }

    $pdo->prepare('UPDATE flat_rate_payments SET status = ? WHERE id = ?')->execute([$status, $id]);
    echo json_encode(['flat_rate_payment' => fetchPayment($pdo, $id)]);

} elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    $pdo->prepare('DELETE FROM flat_rate_payments WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);

} else {
    http_response_code(405);
}
