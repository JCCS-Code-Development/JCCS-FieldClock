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

const MISC_CHECK_SELECT = 'SELECT mc.*, u.name AS created_by_name
                            FROM misc_checks mc
                            JOIN users u ON u.id = mc.created_by';

if ($method === 'GET') {
    $payeeType = $_GET['payee_type'] ?? null;
    $status    = $_GET['status']     ?? null;

    $sql    = MISC_CHECK_SELECT . ' WHERE 1=1';
    $params = [];
    if ($payeeType) { $sql .= ' AND mc.payee_type = ?'; $params[] = $payeeType; }
    if ($status)    { $sql .= ' AND mc.status = ?';     $params[] = $status; }
    $sql .= ' ORDER BY mc.check_date DESC, mc.created_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['checks' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['payee_type', 'amount', 'reason', 'check_date']);

    $payeeType = sanitizeString($body['payee_type']);
    if (!in_array($payeeType, ['vendor', 'employee', 'contractor'])) {
        http_response_code(422); exit(json_encode(['error' => 'payee_type must be vendor, employee, or contractor']));
    }

    $amount = (float)$body['amount'];
    if ($amount <= 0) { http_response_code(422); exit(json_encode(['error' => 'Amount must be greater than zero'])); }

    $reason    = sanitizeString($body['reason']);
    $checkDate = sanitizeString($body['check_date']);

    // Resolve the payee to snapshot name/address — vendor for 'vendor',
    // a users row (role checked to match the picker) for the other two.
    $vendorId = null; $userId = null; $payeeName = null; $payeeAddress = null;

    if ($payeeType === 'vendor') {
        if (empty($body['vendor_id'])) { http_response_code(422); exit(json_encode(['error' => 'vendor_id is required'])); }
        $v = $pdo->prepare('SELECT id, name, address FROM vendors WHERE id = ? AND is_active = 1 LIMIT 1');
        $v->execute([(int)$body['vendor_id']]);
        $row = $v->fetch();
        if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Vendor not found'])); }
        $vendorId = (int)$row['id']; $payeeName = $row['name']; $payeeAddress = $row['address'];
    } else {
        if (empty($body['user_id'])) { http_response_code(422); exit(json_encode(['error' => 'user_id is required'])); }
        $roleClause = $payeeType === 'contractor' ? "role = 'contractor'" : "role IN ('admin','employee')";
        $u = $pdo->prepare("SELECT id, name, address FROM users WHERE id = ? AND is_active = 1 AND $roleClause LIMIT 1");
        $u->execute([(int)$body['user_id']]);
        $row = $u->fetch();
        if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Payee not found for the selected type'])); }
        $userId = (int)$row['id']; $payeeName = $row['name']; $payeeAddress = $row['address'];
    }

    $pdo->prepare(
        'INSERT INTO misc_checks (payee_type, vendor_id, user_id, payee_name, payee_address, amount, reason, check_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$payeeType, $vendorId, $userId, $payeeName, $payeeAddress, $amount, $reason, $checkDate, $auth['user_id']]);

    $newId = (int)$pdo->lastInsertId();
    $row   = $pdo->prepare(MISC_CHECK_SELECT . ' WHERE mc.id = ?');
    $row->execute([$newId]);
    echo json_encode(['check' => $row->fetch()]);

} else { http_response_code(405); }
