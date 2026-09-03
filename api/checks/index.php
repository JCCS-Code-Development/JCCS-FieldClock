<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

$PAYEE_TYPES = ['employee', 'contractor', 'vendor', 'other'];
$SOURCES     = ['payroll', 'contractor', 'vendor', 'donation', 'misc', 'manual'];

// ── GET: list checks with optional filters ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $where  = [];
    $params = [];

    foreach (['status' => 'cr.status', 'payee_type' => 'cr.payee_type', 'source' => 'cr.source'] as $key => $col) {
        if (!empty($_GET[$key])) { $where[] = "$col = ?"; $params[] = sanitizeString($_GET[$key]); }
    }
    if (!empty($_GET['search'])) {
        $q = '%' . sanitizeString($_GET['search']) . '%';
        $where[] = '(cr.check_number LIKE ? OR cr.payee_name LIKE ? OR cr.memo LIKE ?)';
        array_push($params, $q, $q, $q);
    }
    if (!empty($_GET['date_from'])) { $where[] = 'cr.issued_date >= ?'; $params[] = sanitizeString($_GET['date_from']); }
    if (!empty($_GET['date_to']))   { $where[] = 'cr.issued_date <= ?'; $params[] = sanitizeString($_GET['date_to']); }
    if (!empty($_GET['user_id']))   { $where[] = 'cr.user_id = ?';      $params[] = (int)$_GET['user_id']; }
    if (!empty($_GET['vendor_id'])) { $where[] = 'cr.vendor_id = ?';    $params[] = (int)$_GET['vendor_id']; }

    // Check-number continuity view: only checks that carry a number, ordered
    // numerically so gaps in the sequence are visible.
    $numbered = !empty($_GET['numbered']);
    if ($numbered) { $where[] = "cr.check_number IS NOT NULL AND cr.check_number <> ''"; }

    $order = $numbered
        ? 'ORDER BY CAST(cr.check_number AS UNSIGNED), cr.check_number'
        : 'ORDER BY (cr.status = "draft") DESC, cr.issued_date DESC, cr.id DESC';

    $sql = 'SELECT cr.*, u.name AS updater_name, v.name AS vendor_name,
                   GROUP_CONCAT(DISTINCT ci.id) AS invoice_ids,
                   GROUP_CONCAT(DISTINCT ci.invoice_number) AS contractor_invoice_numbers,
                   GROUP_CONCAT(DISTINCT vi.invoice_number) AS vendor_invoice_numbers,
                   COUNT(DISTINCT ci.id) + COUNT(DISTINCT vi.id) AS invoice_count
            FROM check_registry cr
            LEFT JOIN users   u  ON u.id = cr.status_updated_by
            LEFT JOIN vendors v  ON v.id = cr.vendor_id
            LEFT JOIN contractor_invoices ci ON ci.check_id = cr.id
            LEFT JOIN vendor_invoices     vi ON vi.check_id = cr.id'
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' GROUP BY cr.id '
         . $order;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $checks = $stmt->fetchAll();

    $cStmt  = $pdo->query('SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM check_registry GROUP BY status');
    $counts = ['draft' => 0, 'printed' => 0, 'cleared' => 0, 'voided' => 0];
    $totals = ['draft' => 0, 'printed' => 0, 'cleared' => 0, 'voided' => 0];
    foreach ($cStmt->fetchAll() as $r) {
        $counts[$r['status']] = (int)$r['cnt'];
        $totals[$r['status']] = (float)$r['total'];
    }
    $counts['total'] = array_sum($counts);

    echo json_encode(['checks' => $checks, 'counts' => $counts, 'totals' => $totals]);
    exit;
}

// ── POST ────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();

    try {
        // (A) Pay one or more approved contractor invoices with a single check
        if (!empty($body['contractor_invoice_ids']) && is_array($body['contractor_invoice_ids'])) {
            $ids = array_values(array_unique(array_map('intval', $body['contractor_invoice_ids'])));
            $ph  = implode(',', array_fill(0, count($ids), '?'));
            $inv = $pdo->prepare(
                "SELECT ci.*, u.name AS contractor_name, u.address AS contractor_address
                 FROM contractor_invoices ci JOIN users u ON u.id = ci.user_id
                 WHERE ci.id IN ($ph)"
            );
            $inv->execute($ids);
            $rows = $inv->fetchAll();
            if (count($rows) !== count($ids)) { http_response_code(422); exit(json_encode(['error' => 'Some invoices were not found.'])); }
            $userIds = array_unique(array_column($rows, 'user_id'));
            if (count($userIds) > 1) { http_response_code(422); exit(json_encode(['error' => 'All invoices must belong to the same contractor.'])); }
            foreach ($rows as $r) {
                if ($r['check_id']) { http_response_code(409); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' is already on a check.'])); }
                if ($r['status'] !== 'draft') { http_response_code(422); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' is already paid or voided.'])); }
                if (!$r['amount'] || (float)$r['amount'] <= 0) { http_response_code(422); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' has no amount.'])); }
            }
            $total     = array_sum(array_map(fn($r) => (float)$r['amount'], $rows));
            $invNums   = array_filter(array_map(fn($r) => $r['invoice_number'], $rows));
            $memo      = 'Invoice ' . ($invNums ? implode(', ', $invNums) : ('#' . implode(', #', $ids)));
            $checkNum  = !empty($body['check_number']) ? sanitizeString($body['check_number']) : null;
            $checkDate = sanitizeString($body['check_date'] ?? date('Y-m-d'));

            $pdo->beginTransaction();
            $pdo->prepare(
                'INSERT INTO check_registry
                   (check_number, payee_type, user_id, payee_name, payee_address, amount, memo,
                    issued_date, status, source, created_by)
                 VALUES (?, "contractor", ?, ?, ?, ?, ?, ?, ?, "contractor", ?)'
            )->execute([
                $checkNum, $rows[0]['user_id'], $rows[0]['contractor_name'], $rows[0]['contractor_address'],
                $total, $memo, $checkDate, $checkNum ? 'printed' : 'draft', $auth['user_id'],
            ]);
            $checkId = (int)$pdo->lastInsertId();
            $pdo->prepare("UPDATE contractor_invoices SET check_id = ?, status = 'printed' WHERE id IN ($ph)")
                ->execute(array_merge([$checkId], $ids));
            $pdo->commit();

            echo json_encode(['success' => true, 'check_id' => $checkId]);
            exit;
        }

        // (A2) Pay one or more approved vendor invoices with a single check
        if (!empty($body['vendor_invoice_ids']) && is_array($body['vendor_invoice_ids'])) {
            $ids = array_values(array_unique(array_map('intval', $body['vendor_invoice_ids'])));
            $ph  = implode(',', array_fill(0, count($ids), '?'));
            $inv = $pdo->prepare(
                "SELECT vi.*, v.name AS vendor_name, v.address AS vendor_address
                 FROM vendor_invoices vi JOIN vendors v ON v.id = vi.vendor_id
                 WHERE vi.id IN ($ph)"
            );
            $inv->execute($ids);
            $rows = $inv->fetchAll();
            if (count($rows) !== count($ids)) { http_response_code(422); exit(json_encode(['error' => 'Some invoices were not found.'])); }
            $vendorIds = array_unique(array_column($rows, 'vendor_id'));
            if (count($vendorIds) > 1) { http_response_code(422); exit(json_encode(['error' => 'All invoices must belong to the same vendor.'])); }
            foreach ($rows as $r) {
                if ($r['check_id']) { http_response_code(409); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' is already on a check.'])); }
                if ($r['status'] !== 'draft') { http_response_code(422); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' is already paid or voided.'])); }
                if (!$r['amount'] || (float)$r['amount'] <= 0) { http_response_code(422); exit(json_encode(['error' => 'Invoice ' . ($r['invoice_number'] ?: $r['id']) . ' has no amount.'])); }
            }
            $total     = array_sum(array_map(fn($r) => (float)$r['amount'], $rows));
            $invNums   = array_filter(array_map(fn($r) => $r['invoice_number'], $rows));
            $memo      = 'Invoice ' . ($invNums ? implode(', ', $invNums) : ('#' . implode(', #', $ids)));
            $checkNum  = !empty($body['check_number']) ? sanitizeString($body['check_number']) : null;
            $checkDate = sanitizeString($body['check_date'] ?? date('Y-m-d'));

            $pdo->beginTransaction();
            $pdo->prepare(
                'INSERT INTO check_registry
                   (check_number, payee_type, vendor_id, payee_name, payee_address, amount, memo,
                    issued_date, status, source, created_by)
                 VALUES (?, "vendor", ?, ?, ?, ?, ?, ?, ?, "vendor", ?)'
            )->execute([
                $checkNum, $rows[0]['vendor_id'], $rows[0]['vendor_name'], $rows[0]['vendor_address'],
                $total, $memo, $checkDate, $checkNum ? 'printed' : 'draft', $auth['user_id'],
            ]);
            $checkId = (int)$pdo->lastInsertId();
            $pdo->prepare("UPDATE vendor_invoices SET check_id = ?, status = 'printed' WHERE id IN ($ph)")
                ->execute(array_merge([$checkId], $ids));
            $pdo->commit();

            echo json_encode(['success' => true, 'check_id' => $checkId]);
            exit;
        }

        // (B) Batch register printed checks (from the payday print run) --------
        //     Back-compat: items carry check_number + payee identity + period.
        if (!empty($body['checks']) && is_array($body['checks'])) {
            $upsert = $pdo->prepare(
                'INSERT INTO check_registry
                   (check_number, payee_type, payee_name, user_id, amount, memo,
                    pay_period_start, pay_period_end, issued_date, status, source, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "printed", ?, ?)
                 ON DUPLICATE KEY UPDATE
                   id               = LAST_INSERT_ID(id),
                   payee_name       = VALUES(payee_name),
                   amount           = VALUES(amount),
                   pay_period_start = VALUES(pay_period_start),
                   pay_period_end   = VALUES(pay_period_end),
                   issued_date      = VALUES(issued_date),
                   status           = IF(check_registry.status = "voided", "voided", "printed")'
            );
            $findPc   = $pdo->prepare('SELECT id FROM paychecks WHERE user_id = ? AND period_start = ? AND period_end = ?');
            $updPc    = $pdo->prepare('UPDATE paychecks SET check_registry_id = ?, amount = ? WHERE id = ?');
            $insPc    = $pdo->prepare('INSERT INTO paychecks (user_id, period_start, period_end, amount, check_registry_id, status, created_by) VALUES (?, ?, ?, ?, ?, "processing", ?)');

            $saved = 0;
            foreach ($body['checks'] as $item) {
                if (empty($item['check_number']) || empty($item['payee_name'])) continue;
                $checkNum   = sanitizeString($item['check_number']);
                $payeeName  = sanitizeString($item['payee_name']);
                $payeeType  = in_array($item['payee_type'] ?? '', $PAYEE_TYPES, true) ? $item['payee_type'] : 'employee';
                $source     = in_array($item['source'] ?? '', $SOURCES, true) ? $item['source'] : 'payroll';
                $userId     = !empty($item['user_id']) ? (int)$item['user_id'] : null;
                $amount     = (float)($item['amount'] ?? 0);
                $memo       = !empty($item['memo']) ? sanitizeString($item['memo']) : null;
                $pStart     = !empty($item['pay_period_start']) ? sanitizeString($item['pay_period_start']) : null;
                $pEnd       = !empty($item['pay_period_end'])   ? sanitizeString($item['pay_period_end'])   : null;
                $issued     = sanitizeString($item['issued_date'] ?? date('Y-m-d'));

                $upsert->execute([$checkNum, $payeeType, $payeeName, $userId, $amount, $memo, $pStart, $pEnd, $issued, $source, $auth['user_id']]);
                $checkId = (int)$pdo->lastInsertId();
                $saved++;

                if ($userId && $payeeType === 'employee' && $pStart && $pEnd) {
                    $findPc->execute([$userId, $pStart, $pEnd]);
                    $ex = $findPc->fetch();
                    if ($ex) { $updPc->execute([$checkId, $amount, $ex['id']]); }
                    else     { $insPc->execute([$userId, $pStart, $pEnd, $amount, $checkId, $auth['user_id']]); }
                }
            }
            echo json_encode(['success' => true, 'registered' => $saved]);
            exit;
        }

        // (C) Create a single check for any payee -----------------------------
        $payeeType = $body['payee_type'] ?? '';
        if (!in_array($payeeType, $PAYEE_TYPES, true)) {
            http_response_code(422); exit(json_encode(['error' => 'A payee type is required.']));
        }
        if ($payeeType === 'contractor') {
            http_response_code(422);
            exit(json_encode(['error' => 'Pay contractors from an approved invoice, not a free-standing check.']));
        }
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) { http_response_code(422); exit(json_encode(['error' => 'Enter an amount greater than 0.'])); }

        $userId   = ($payeeType === 'employee'  && !empty($body['user_id']))   ? (int)$body['user_id']   : null;
        $vendorId = ($payeeType === 'vendor'    && !empty($body['vendor_id'])) ? (int)$body['vendor_id'] : null;

        $payeeName = sanitizeString($body['payee_name'] ?? '');
        if ($payeeName === '' && $userId) {
            $n = $pdo->prepare('SELECT name FROM users WHERE id = ?'); $n->execute([$userId]);
            $payeeName = (string)$n->fetchColumn();
        }
        if ($payeeName === '' && $vendorId) {
            $n = $pdo->prepare('SELECT name FROM vendors WHERE id = ?'); $n->execute([$vendorId]);
            $payeeName = (string)$n->fetchColumn();
        }
        if ($payeeName === '') { http_response_code(422); exit(json_encode(['error' => 'A payee name is required.'])); }

        $checkNum = !empty($body['check_number']) ? sanitizeString($body['check_number']) : null;
        $source   = in_array($body['source'] ?? '', $SOURCES, true) ? $body['source'] : ($payeeType === 'vendor' ? 'vendor' : 'misc');

        $pdo->prepare(
            'INSERT INTO check_registry
               (check_number, payee_type, user_id, vendor_id, payee_name, payee_address, amount, memo,
                pay_period_start, pay_period_end, issued_date, status, source, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $checkNum, $payeeType, $userId, $vendorId, $payeeName,
            !empty($body['payee_address']) ? sanitizeString($body['payee_address']) : null,
            $amount,
            !empty($body['memo']) ? sanitizeString($body['memo']) : null,
            !empty($body['pay_period_start']) ? sanitizeString($body['pay_period_start']) : null,
            !empty($body['pay_period_end'])   ? sanitizeString($body['pay_period_end'])   : null,
            sanitizeString($body['check_date'] ?? $body['issued_date'] ?? date('Y-m-d')),
            $checkNum ? 'printed' : 'draft',
            $source,
            !empty($body['notes']) ? sanitizeString($body['notes']) : null,
            $auth['user_id'],
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;

    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

http_response_code(405); exit;
