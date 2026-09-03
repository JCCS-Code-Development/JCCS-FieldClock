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
        'SELECT u.id, u.name, u.email, u.phone, u.address, u.role, u.pay_type, u.pay_rate, u.pay_structure, u.overtime_rate,
                u.gas_weekly_allowance, u.is_active, u.deactivated_at, u.default_job_id, u.default_job_fixed, j.name as default_job_name
         FROM users u
         LEFT JOIN jobs j ON j.id = u.default_job_id
         WHERE u.is_active = ?
         ORDER BY FIELD(u.role,\'admin\',\'employee\',\'contractor\'), u.name'
    );
    $stmt->execute([$active]);
    echo json_encode(['employees' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['name', 'role']);

    $name    = trim(sanitizeString($body['name']));
    $email   = isset($body['email'])   && $body['email']   !== '' ? trim(sanitizeString($body['email']))   : null;
    $phone   = isset($body['phone'])   && $body['phone']   !== '' ? sanitizeString($body['phone'])   : null;
    $address = isset($body['address']) && $body['address'] !== '' ? sanitizeString($body['address']) : null;
    $role    = sanitizeString($body['role']);

    if (!in_array($role, ['employee', 'admin', 'contractor'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid role.']));
    }

    // Employees/admins log in, so they need an email; contractors don't use
    // the app at all, so theirs is optional (contact info only).
    if ($role !== 'contractor' && !$email) {
        http_response_code(422);
        exit(json_encode(['error' => 'Email is required so this person can log in.']));
    }

    // Check for duplicate email
    if ($email) {
        $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $dup->execute([$email]);
        if ($dup->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'An account with this email already exists.']));
        }
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

    // users.pay_type/pay_rate/pay_structure are all NOT NULL at the DB level
    // (matches their column defaults below) — contractors don't use these
    // fields anywhere in the app (every consumer filters role != 'contractor'
    // first), but the columns themselves can't actually hold NULL, so a
    // contractor row just gets the same defaults a fresh w2/hourly/$0 row
    // would.
    $payType      = $role === 'contractor' ? 'w2'     : sanitizeString($body['pay_type'] ?? 'w2');
    $payRate      = $role === 'contractor' ? 0.00     : (float)($body['pay_rate'] ?? 0);
    $payStructure = $role === 'contractor' ? 'hourly' : sanitizeString($body['pay_structure'] ?? 'hourly');
    $gasWeekly    = $role === 'contractor' ? 0.00     : (float)($body['gas_weekly_allowance'] ?? 0);

    if (!in_array($payStructure, ['hourly', 'salary'])) {
        $payStructure = 'hourly';
    }

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, phone, address, role, pay_type, pay_rate, pay_structure, gas_weekly_allowance, is_active) VALUES (?,?,?,?,?,?,?,?,?,1)'
    );
    $stmt->execute([$name, $email, $phone, $address, $role, $payType, $payRate, $payStructure, $gasWeekly]);
    $newId = (int)$pdo->lastInsertId();

    // Starting rate, not a mid-stream change — effective immediately (today),
    // unlike the "next pay period" default used when an existing employee's
    // rate is changed later (see api/employees/item.php).
    if ($payRate !== null && $payRate > 0) {
        $pdo->prepare(
            'INSERT INTO salary_history (user_id, pay_rate, pay_structure, effective_date, created_by)
             VALUES (?, ?, ?, CURDATE(), ?)'
        )->execute([$newId, $payRate, $payStructure, $auth['user_id']]);
    }

    echo json_encode(['id' => $newId, 'message' => 'Employee created']);

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
