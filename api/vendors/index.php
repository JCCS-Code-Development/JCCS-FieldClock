<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $active = isset($_GET['active']) ? (int)$_GET['active'] : 1;
    $stmt   = $pdo->prepare('SELECT * FROM vendors WHERE is_active = ? ORDER BY name');
    $stmt->execute([$active]);
    echo json_encode(['vendors' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['name', 'type']);

    $name        = trim(sanitizeString($body['name']));
    $type        = sanitizeString($body['type']);
    if (!in_array($type, ['supplier', 'provider'])) {
        http_response_code(422); exit(json_encode(['error' => 'Type must be supplier or provider']));
    }

    $pdo->prepare(
        'INSERT INTO vendors (name, type, contact_name, email, phone, address, tax_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $name, $type,
        !empty($body['contact_name']) ? sanitizeString($body['contact_name']) : null,
        !empty($body['email'])        ? sanitizeString($body['email'])        : null,
        !empty($body['phone'])        ? sanitizeString($body['phone'])        : null,
        !empty($body['address'])      ? sanitizeString($body['address'])      : null,
        !empty($body['tax_id'])       ? sanitizeString($body['tax_id'])       : null,
        !empty($body['notes'])        ? sanitizeString($body['notes'])        : null,
        $auth['user_id'],
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Vendor created']);

} else { http_response_code(405); }
