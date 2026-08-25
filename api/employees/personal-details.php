<?php
// Tax ID, birthdate, emergency contact, direct-deposit info — admin-managed,
// sensitive enough to keep out of the general employee record/listing.
//
// GET: an admin viewing another employee's record always gets tax_id and
// bank_account_number masked (last 4 only) unless ?reveal=<field> is passed
// for that one field — the full value is never included in a general fetch.
// An employee fetching their own record (no user_id override — see
// api/employees/item.php for the same self-vs-admin scoping pattern used
// throughout this API) gets everything in full: it's their own data, same
// as reading their own SSN off a W-2.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

const MASKABLE_FIELDS = ['tax_id', 'bank_account_number'];

function maskValue(?string $val): ?string {
    if ($val === null || $val === '') return $val;
    $last4 = substr($val, -4);
    return str_repeat('•', max(0, strlen($val) - 4)) . $last4;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $requestedId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : $auth['user_id'];
    $isSelf      = $requestedId === (int)$auth['user_id'];

    if (!$isSelf) requireAdmin($auth);

    $stmt = $pdo->prepare('SELECT * FROM employee_personal_details WHERE user_id = ?');
    $stmt->execute([$requestedId]);
    $row = $stmt->fetch();

    if (!$row) {
        echo json_encode(['details' => null]);
        exit;
    }

    unset($row['id'], $row['updated_by']);

    if (!$isSelf) {
        $reveal = $_GET['reveal'] ?? null;
        foreach (MASKABLE_FIELDS as $f) {
            if ($reveal !== $f) $row[$f] = maskValue($row[$f]);
        }
    }

    echo json_encode(['details' => $row]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin($auth);
    $body   = jsonBody();
    $userId = (int)($body['user_id'] ?? 0);
    if (!$userId) { http_response_code(422); exit(json_encode(['error' => 'user_id is required'])); }

    $check = $pdo->prepare('SELECT id FROM users WHERE id = ?');
    $check->execute([$userId]);
    if (!$check->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Employee not found'])); }

    $allowed = ['tax_id', 'birth_date', 'emergency_contact_name', 'emergency_contact_phone', 'bank_routing_number', 'bank_account_number'];
    $fields  = [];
    foreach ($allowed as $f) {
        if (!array_key_exists($f, $body)) continue;
        $fields[$f] = ($body[$f] === '' || $body[$f] === null) ? null : sanitizeString((string)$body[$f]);
    }

    if ($fields && array_key_exists('birth_date', $fields) && $fields['birth_date'] !== null) {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $fields['birth_date']);
        if (!$parsed || $parsed->format('Y-m-d') !== $fields['birth_date']) {
            http_response_code(422); exit(json_encode(['error' => 'Invalid birth date']));
        }
    }

    if (!$fields) { echo json_encode(['message' => 'Nothing to update']); exit; }

    $exists = $pdo->prepare('SELECT id FROM employee_personal_details WHERE user_id = ?');
    $exists->execute([$userId]);

    if ($exists->fetch()) {
        $sets   = array_map(fn($f) => "$f = ?", array_keys($fields));
        $params = array_values($fields);
        $sets[] = 'updated_by = ?'; $params[] = $auth['user_id'];
        $params[] = $userId;
        $pdo->prepare('UPDATE employee_personal_details SET ' . implode(', ', $sets) . ' WHERE user_id = ?')
            ->execute($params);
    } else {
        $cols = array_merge(['user_id'], array_keys($fields), ['updated_by']);
        $vals = array_merge([$userId], array_values($fields), [$auth['user_id']]);
        $placeholders = implode(',', array_fill(0, count($cols), '?'));
        $pdo->prepare('INSERT INTO employee_personal_details (' . implode(',', $cols) . ") VALUES ($placeholders)")
            ->execute($vals);
    }

    echo json_encode(['message' => 'Updated']);
    exit;
}

http_response_code(405);
