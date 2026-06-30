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
    requireAdmin($auth);
    $active = isset($_GET['active']) ? (int)$_GET['active'] : 1;
    $stmt   = $pdo->prepare('SELECT id, name, email, phone, role, pay_type, pay_rate, overtime_rate, gas_weekly_allowance, is_active FROM users WHERE is_active = ? ORDER BY name');
    $stmt->execute([$active]);
    echo json_encode(['employees' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name', 'email', 'role', 'pay_type', 'pay_rate']);

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, phone, role, pay_type, pay_rate, overtime_rate, gas_weekly_allowance, is_active) VALUES (?,?,?,?,?,?,?,?,1)'
    );
    $stmt->execute([
        sanitizeString($body['name']),
        sanitizeString($body['email']),
        isset($body['phone']) ? sanitizeString($body['phone']) : null,
        sanitizeString($body['role']),
        sanitizeString($body['pay_type']),
        (float)$body['pay_rate'],
        isset($body['overtime_rate']) ? (float)$body['overtime_rate'] : null,
        isset($body['gas_weekly_allowance']) ? (float)$body['gas_weekly_allowance'] : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Employee created']);
} else {
    http_response_code(405);
}
