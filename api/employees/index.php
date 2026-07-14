<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $active = isset($_GET['active']) ? (int)$_GET['active'] : 1;
    $stmt   = $pdo->prepare(
        'SELECT u.id, u.name, u.email, u.phone, u.role, u.pay_type, u.pay_rate, u.pay_structure, u.overtime_rate,
                u.gas_weekly_allowance, u.is_active, u.deactivated_at, u.default_job_id, j.name as default_job_name
         FROM users u
         LEFT JOIN jobs j ON j.id = u.default_job_id
         WHERE u.is_active = ?
         ORDER BY FIELD(u.role,\'admin\',\'employee\',\'contractor\'), u.name'
    );
    $stmt->execute([$active]);
    echo json_encode(['employees' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['name', 'email', 'role']);

    $name  = trim(sanitizeString($body['name']));
    $email = trim(sanitizeString($body['email']));
    $phone = isset($body['phone']) && $body['phone'] !== '' ? sanitizeString($body['phone']) : null;
    $role  = sanitizeString($body['role']);

    if (!in_array($role, ['employee', 'admin', 'contractor'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid role.']));
    }

    // Check for duplicate email
    $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $dup->execute([$email]);
    if ($dup->fetch()) {
        http_response_code(422);
        exit(json_encode(['error' => 'An account with this email already exists.']));
    }

    // Check for duplicate phone
    if ($phone) {
        $dupPhone = $pdo->prepare('SELECT id FROM users WHERE phone = ? LIMIT 1');
        $dupPhone->execute([$phone]);
        if ($dupPhone->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'An account with this phone number already exists.']));
        }
    }

    $payType      = $role === 'contractor' ? null : sanitizeString($body['pay_type'] ?? 'w2');
    $payRate      = $role === 'contractor' ? null : (float)($body['pay_rate'] ?? 0);
    $payStructure = $role === 'contractor' ? null : sanitizeString($body['pay_structure'] ?? 'hourly');

    if ($payStructure !== null && !in_array($payStructure, ['hourly', 'salary'])) {
        $payStructure = 'hourly';
    }

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, phone, role, pay_type, pay_rate, pay_structure, is_active) VALUES (?,?,?,?,?,?,?,1)'
    );
    $stmt->execute([$name, $email, $phone, $role, $payType, $payRate, $payStructure]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Employee created']);

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
