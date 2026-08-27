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
$check = $pdo->prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1');
$check->execute([$id]);
$existing = $check->fetch();
if (!$existing) {
    http_response_code(404);
    exit(json_encode(['error' => 'Employee not found']));
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT u.id, u.name, u.email, u.phone, u.address, u.role, u.pay_type, u.pay_rate, u.pay_structure, u.overtime_rate,
                u.gas_weekly_allowance, u.is_active, u.deactivated_at, u.default_job_id, u.default_job_fixed, j.name as default_job_name
         FROM users u
         LEFT JOIN jobs j ON j.id = u.default_job_id
         WHERE u.id = ?'
    );
    $stmt->execute([$id]);
    echo json_encode($stmt->fetch());

} elseif ($method === 'PUT') {
    // Current rate/structure — needed to detect an actual change below, since
    // the request may only include one of the two fields.
    $before = $pdo->prepare('SELECT pay_rate, pay_structure FROM users WHERE id = ?');
    $before->execute([$id]);
    $beforeRow = $before->fetch();

    // Contractors invoice per job and never clock in, so they're never
    // assigned to a location — reject an explicit attempt to set one...
    $finalRole = array_key_exists('role', $body) ? sanitizeString((string)$body['role']) : $existing['role'];
    if ($finalRole === 'contractor' && array_key_exists('default_job_id', $body) && !empty($body['default_job_id'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'Contractors cannot be assigned a default job site']));
    }
    // ...and if this request is switching someone to contractor, clear
    // whatever default job site they already had as an employee/admin.
    $becameContractor = $finalRole === 'contractor' && $existing['role'] !== 'contractor';

    $allowed = ['name', 'email', 'phone', 'address', 'role', 'pay_type', 'pay_rate', 'pay_structure', 'overtime_rate', 'gas_weekly_allowance', 'is_active', 'default_job_id', 'default_job_fixed'];
    $sets = []; $params = [];

    foreach ($allowed as $f) {
        if (!array_key_exists($f, $body)) continue;

        if (in_array($f, ['pay_rate', 'overtime_rate', 'gas_weekly_allowance'])) {
            $params[] = ($body[$f] === null || $body[$f] === '') ? null : (float)$body[$f];
        } elseif ($f === 'default_job_id') {
            $params[] = ($body[$f] === null || $body[$f] === '') ? null : (int)$body[$f];
        } elseif ($f === 'default_job_fixed') {
            $params[] = !empty($body[$f]) ? 1 : 0;
        } elseif (in_array($f, ['phone', 'email', 'address'])) {
            // Empty/null clears the field to NULL rather than storing '' — email
            // and phone are UNIQUE columns, so multiple blank '' rows (e.g.
            // several contractors with no email on file) would otherwise collide;
            // NULL never collides with itself under a UNIQUE constraint.
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

    // Check duplicate email if being changed to a non-empty value
    if (array_key_exists('email', $body) && $body['email'] !== '' && $body['email'] !== null) {
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

    if ($becameContractor && !array_key_exists('default_job_id', $body)) {
        $sets[] = 'default_job_id = NULL';
        $sets[] = 'default_job_fixed = 0';
    }

    if (!$sets) {
        echo json_encode(['message' => 'Nothing to update']);
        exit;
    }

    $params[] = $id;
    $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    if ($becameContractor) {
        $pdo->prepare('DELETE FROM job_assignments WHERE user_id = ?')->execute([$id]);
    }

    // Auto-log to salary_history when the rate or structure actually changed.
    // Effective the start of the CURRENT Mon–Sun pay period (this week), for
    // both 1099 and W-2 — payRateForPeriod() picks the newest history row
    // whose effective_date <= the period's start, so this makes the new rate
    // apply to the whole week already in progress, not just going forward.
    // That matters most for 1099: this app's own numbers directly drive
    // their weekly check, so a change made any day this week shows up in
    // that week's check (issued the following Friday). For W-2 it's mostly
    // record-keeping since ADP runs their actual payroll, but the same rule
    // is used for consistency. (Backdating/future-dating beyond that default
    // is done manually via POST /salary-history.)
    $newRate = array_key_exists('pay_rate', $body)
        ? (($body['pay_rate'] === null || $body['pay_rate'] === '') ? null : (float)$body['pay_rate'])
        : $beforeRow['pay_rate'];
    $newStruct = array_key_exists('pay_structure', $body) ? sanitizeString((string)$body['pay_structure']) : $beforeRow['pay_structure'];
    $rateChanged = $beforeRow
        && $newRate !== null
        && (round((float)$newRate, 2) !== round((float)$beforeRow['pay_rate'], 2) || $newStruct !== $beforeRow['pay_structure']);

    if ($rateChanged) {
        $today = new DateTimeImmutable('today', new DateTimeZone(FIELDCLOCK_TIMEZONE));
        $dow   = (int)$today->format('N'); // 1 (Mon) .. 7 (Sun)
        $currentPeriodStart = $today->modify('-' . ($dow - 1) . ' days')->format('Y-m-d');

        $pdo->prepare(
            'INSERT INTO salary_history (user_id, pay_rate, pay_structure, effective_date, created_by)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$id, $newRate, $newStruct, $currentPeriodStart, $auth['user_id']]);
    }

    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('UPDATE users SET is_active = 0, deactivated_at = NOW() WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
