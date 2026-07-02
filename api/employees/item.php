<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$body   = $method !== 'GET' ? jsonBody() : [];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, name, email, phone, role, pay_type, pay_rate, pay_structure, overtime_rate, gas_weekly_allowance, is_active FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $emp = $stmt->fetch();
    if (!$emp) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    echo json_encode($emp);

} elseif ($method === 'PUT') {
    requireAdmin($auth);
    $allowed = ['name','email','phone','role','pay_type','pay_rate','pay_structure','overtime_rate','gas_weekly_allowance'];
    $sets = []; $params = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "$f = ?";
            $v = $body[$f];
            if (in_array($f, ['pay_rate','overtime_rate','gas_weekly_allowance'])) {
                $params[] = $v === null || $v === '' ? null : (float)$v;
            } else {
                $params[] = sanitizeString((string)$v);
            }
        }
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    requireAdmin($auth);
    $pdo->prepare('UPDATE users SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);
} else {
    http_response_code(405);
}
