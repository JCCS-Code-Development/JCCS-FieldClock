<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

// ── GET: list checks with optional filters ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $where  = [];
    $params = [];

    if (!empty($_GET['status'])) {
        $where[]  = 'cr.status = ?';
        $params[] = sanitizeString($_GET['status']);
    }
    if (!empty($_GET['search'])) {
        $q        = '%' . sanitizeString($_GET['search']) . '%';
        $where[]  = '(cr.check_number LIKE ? OR cr.payee_name LIKE ?)';
        $params[] = $q;
        $params[] = $q;
    }
    if (!empty($_GET['date_from'])) {
        $where[]  = 'cr.issued_date >= ?';
        $params[] = sanitizeString($_GET['date_from']);
    }
    if (!empty($_GET['date_to'])) {
        $where[]  = 'cr.issued_date <= ?';
        $params[] = sanitizeString($_GET['date_to']);
    }
    if (!empty($_GET['user_id'])) {
        $where[]  = 'cr.user_id = ?';
        $params[] = (int)$_GET['user_id'];
    }

    $sql = 'SELECT cr.*, u.name AS updater_name
            FROM check_registry cr
            LEFT JOIN users u ON u.id = cr.status_updated_by'
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' ORDER BY cr.issued_date DESC, cr.check_number DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $checks = $stmt->fetchAll();

    // Status counts
    $cStmt = $pdo->query(
        'SELECT status, COUNT(*) AS cnt FROM check_registry GROUP BY status'
    );
    $counts = ['issued' => 0, 'voided' => 0, 'processed_online' => 0, 'processed_in_person' => 0];
    foreach ($cStmt->fetchAll() as $row) {
        $counts[$row['status']] = (int)$row['cnt'];
    }
    $counts['total'] = array_sum($counts);

    echo json_encode(['checks' => $checks, 'counts' => $counts]);
    exit;
}

// ── POST: register one check or bulk array ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();

    // Bulk: { checks: [...] }
    $items = isset($body['checks']) ? $body['checks'] : [$body];

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO check_registry
               (check_number, payee_name, user_id, amount, pay_period_start, pay_period_end, issued_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               id               = LAST_INSERT_ID(id),
               payee_name       = VALUES(payee_name),
               amount           = VALUES(amount),
               pay_period_start = VALUES(pay_period_start),
               pay_period_end   = VALUES(pay_period_end),
               issued_date      = VALUES(issued_date)'
        );

        $findPaycheck = $pdo->prepare(
            'SELECT id FROM paychecks WHERE user_id = ? AND period_start = ? AND period_end = ?'
        );
        $updatePaycheck = $pdo->prepare(
            'UPDATE paychecks SET check_registry_id = ?, amount = ? WHERE id = ?'
        );
        $insertPaycheck = $pdo->prepare(
            'INSERT INTO paychecks (user_id, period_start, period_end, amount, check_registry_id, status, created_by)
             VALUES (?, ?, ?, ?, ?, \'processing\', ?)'
        );

        $saved = 0;
        foreach ($items as $item) {
            if (empty($item['check_number']) || empty($item['payee_name'])) continue;

            $checkNum   = sanitizeString($item['check_number']);
            $payeeName  = sanitizeString($item['payee_name']);
            $userId     = !empty($item['user_id']) ? (int)$item['user_id'] : null;
            $amount     = (float)($item['amount'] ?? 0);
            $pStart     = sanitizeString($item['pay_period_start'] ?? date('Y-m-d'));
            $pEnd       = sanitizeString($item['pay_period_end']   ?? date('Y-m-d'));
            $issuedDate = sanitizeString($item['issued_date']      ?? date('Y-m-d'));

            $stmt->execute([$checkNum, $payeeName, $userId, $amount, $pStart, $pEnd, $issuedDate, $auth['user_id']]);
            $checkRegistryId = (int)$pdo->lastInsertId();
            $saved++;

            // Auto-create/update the linked Paycheck record (status untouched if it already exists,
            // so re-registering a check never regresses an available/picked-up/voided paycheck)
            if ($userId) {
                $findPaycheck->execute([$userId, $pStart, $pEnd]);
                $existing = $findPaycheck->fetch();
                if ($existing) {
                    $updatePaycheck->execute([$checkRegistryId, $amount, $existing['id']]);
                } else {
                    $insertPaycheck->execute([$userId, $pStart, $pEnd, $amount, $checkRegistryId, $auth['user_id']]);
                }
            }
        }

        echo json_encode(['success' => true, 'registered' => $saved]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

http_response_code(405); exit;
