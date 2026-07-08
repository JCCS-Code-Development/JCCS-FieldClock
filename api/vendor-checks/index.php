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
    $vendorId = isset($_GET['vendor_id']) ? (int)$_GET['vendor_id'] : null;
    $status   = $_GET['status'] ?? null;

    $sql    = 'SELECT vc.*, v.name AS vendor_name, v.type AS vendor_type, v.address AS vendor_address,
                      u.name AS created_by_name
               FROM vendor_checks vc
               JOIN vendors v ON v.id = vc.vendor_id
               JOIN users u ON u.id = vc.created_by
               WHERE 1=1';
    $params = [];
    if ($vendorId) { $sql .= ' AND vc.vendor_id = ?'; $params[] = $vendorId; }
    if ($status)   { $sql .= ' AND vc.status = ?';    $params[] = $status; }
    $sql .= ' ORDER BY vc.check_date DESC, vc.created_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['checks' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['vendor_id', 'amount', 'check_date']);

    $vendorId   = (int)$body['vendor_id'];
    $amount     = (float)$body['amount'];
    $checkDate  = sanitizeString($body['check_date']);
    $memo       = !empty($body['memo'])         ? sanitizeString($body['memo'])         : null;
    $periodLabel = !empty($body['period_label']) ? sanitizeString($body['period_label']) : null;

    if ($amount <= 0) { http_response_code(422); exit(json_encode(['error' => 'Amount must be greater than zero'])); }

    // Verify vendor exists and is active
    $v = $pdo->prepare('SELECT id FROM vendors WHERE id = ? AND is_active = 1 LIMIT 1');
    $v->execute([$vendorId]);
    if (!$v->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Vendor not found'])); }

    $pdo->prepare(
        'INSERT INTO vendor_checks (vendor_id, amount, memo, check_date, period_label, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$vendorId, $amount, $memo, $checkDate, $periodLabel, $auth['user_id']]);

    $newId = (int)$pdo->lastInsertId();
    $row   = $pdo->prepare(
        'SELECT vc.*, v.name AS vendor_name, v.type AS vendor_type, v.address AS vendor_address,
                u.name AS created_by_name
         FROM vendor_checks vc
         JOIN vendors v ON v.id = vc.vendor_id
         JOIN users u ON u.id = vc.created_by
         WHERE vc.id = ?'
    );
    $row->execute([$newId]);
    echo json_encode(['check' => $row->fetch()]);

} else { http_response_code(405); }
