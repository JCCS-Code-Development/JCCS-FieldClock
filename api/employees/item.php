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
$body   = $method !== 'GET' && $method !== 'DELETE' ? jsonBody() : [];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);

if ($id <= 0) {
    http_response_code(422);
    exit(json_encode(['error' => 'Missing employee id']));
}

// Verify employee exists
$check = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
$check->execute([$id]);
if (!$check->fetch()) {
    http_response_code(404);
    exit(json_encode(['error' => 'Employee not found']));
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT u.id, u.name, u.email, u.phone, u.role, u.pay_type, u.pay_rate, u.pay_structure, u.overtime_rate,
                u.gas_weekly_allowance, u.is_active, u.deactivated_at, u.default_job_id, j.name as default_job_name
         FROM users u
         LEFT JOIN jobs j ON j.id = u.default_job_id
         WHERE u.id = ?'
    );
    $stmt->execute([$id]);
    echo json_encode($stmt->fetch());

} elseif ($method === 'PUT') {
    $allowed = ['name', 'email', 'phone', 'role', 'pay_type', 'pay_rate', 'pay_structure', 'overtime_rate', 'gas_weekly_allowance', 'is_active', 'default_job_id'];
    $sets = []; $params = [];

    foreach ($allowed as $f) {
        if (!array_key_exists($f, $body)) continue;

        if (in_array($f, ['pay_rate', 'overtime_rate', 'gas_weekly_allowance'])) {
            $params[] = ($body[$f] === null || $body[$f] === '') ? null : (float)$body[$f];
        } elseif ($f === 'default_job_id') {
            $params[] = ($body[$f] === null || $body[$f] === '') ? null : (int)$body[$f];
        } elseif ($f === 'phone') {
            $params[] = ($body[$f] === null || $body[$f] === '') ? null : sanitizeString((string)$body[$f]);
        } elseif ($f === 'is_active') {
            $isActive = !empty($body[$f]) ? 1 : 0;
            $params[] = $isActive;
            if ($isActive) {
                // Reactivating — clear the deactivation date
                $sets[] = 'deactivated_at = NULL';
            }
        } else {
            $params[] = sanitizeString((string)$body[$f]);
        }
        $sets[] = "$f = ?";
    }

    // Check duplicate email if being changed
    if (array_key_exists('email', $body)) {
        $dupEmail = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1');
        $dupEmail->execute([sanitizeString($body['email']), $id]);
        if ($dupEmail->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'An account with this email already exists.']));
        }
    }

    // Check duplicate phone if being changed
    if (array_key_exists('phone', $body) && $body['phone'] !== '' && $body['phone'] !== null) {
        $dupPhone = $pdo->prepare('SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1');
        $dupPhone->execute([sanitizeString($body['phone']), $id]);
        if ($dupPhone->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'An account with this phone number already exists.']));
        }
    }

    if (!$sets) {
        echo json_encode(['message' => 'Nothing to update']);
        exit;
    }

    $params[] = $id;
    $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('UPDATE users SET is_active = 0, deactivated_at = NOW() WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
