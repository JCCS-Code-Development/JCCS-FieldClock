<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

function checkRow(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare(
        'SELECT cr.*, u.name AS updater_name, v.name AS vendor_name,
                GROUP_CONCAT(DISTINCT ci.id) AS invoice_ids,
                GROUP_CONCAT(DISTINCT ci.invoice_number) AS contractor_invoice_numbers,
                GROUP_CONCAT(DISTINCT vi.invoice_number) AS vendor_invoice_numbers,
                COUNT(DISTINCT ci.id) + COUNT(DISTINCT vi.id) AS invoice_count
         FROM check_registry cr
         LEFT JOIN users   u ON u.id = cr.status_updated_by
         LEFT JOIN vendors v ON v.id = cr.vendor_id
         LEFT JOIN contractor_invoices ci ON ci.check_id = cr.id
         LEFT JOIN vendor_invoices     vi ON vi.check_id = cr.id
         WHERE cr.id = ?
         GROUP BY cr.id'
    );
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

// ── GET: one check ──────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    $check = checkRow($pdo, $id);
    if (!$check) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    echo json_encode(['check' => $check]);
    exit;
}

// ── PUT: edit a draft, or move a check along its lifecycle ───────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $cur = checkRow($pdo, $id);
    if (!$cur) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    try {
        $pdo->beginTransaction();

        // --- lifecycle transition ---
        if (!empty($body['status'])) {
            $to = sanitizeString($body['status']);
            $from = $cur['status'];
            $ok = [
                'draft'   => ['printed', 'voided'],
                'printed' => ['cleared', 'voided'],
                'cleared' => ['voided'],
                'voided'  => [],
            ];
            if (!in_array($to, $ok[$from] ?? [], true)) {
                $pdo->rollBack();
                http_response_code(422);
                exit(json_encode(['error' => "Can't move a $from check to $to."]));
            }

            if ($to === 'printed') {
                $num = sanitizeString($body['check_number'] ?? $cur['check_number'] ?? '');
                if ($num === '') { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => 'A check number is required to mark it printed.'])); }
                $dup = $pdo->prepare('SELECT id FROM check_registry WHERE check_number = ? AND id <> ?');
                $dup->execute([$num, $id]);
                if ($dup->fetch()) { $pdo->rollBack(); http_response_code(409); exit(json_encode(['error' => "Check number $num is already used."])); }
                $issued = !empty($body['issued_date']) ? sanitizeString($body['issued_date']) : $cur['issued_date'];
                $pdo->prepare('UPDATE check_registry SET status = "printed", check_number = ?, issued_date = ?, status_updated_by = ?, status_updated_at = NOW() WHERE id = ?')
                    ->execute([$num, $issued, $auth['user_id'], $id]);
                $pdo->prepare('UPDATE paychecks SET status = "available", available_at = COALESCE(available_at, NOW()) WHERE check_registry_id = ? AND status = "processing"')->execute([$id]);
            } elseif ($to === 'cleared') {
                $pdo->prepare('UPDATE check_registry SET status = "cleared", status_updated_by = ?, status_updated_at = NOW() WHERE id = ?')
                    ->execute([$auth['user_id'], $id]);
            } elseif ($to === 'voided') {
                $reason = sanitizeString($body['void_reason'] ?? '');
                if ($reason === '') { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => 'Give a reason when voiding a check.'])); }
                $pdo->prepare('UPDATE check_registry SET status = "voided", void_reason = ?, status_updated_by = ?, status_updated_at = NOW() WHERE id = ?')
                    ->execute([$reason, $auth['user_id'], $id]);
                $pdo->prepare('UPDATE paychecks SET status = "voided", void_reason = ? WHERE check_registry_id = ?')->execute([$reason, $id]);
                // release any contractor / vendor invoices this check was paying
                $pdo->prepare('UPDATE contractor_invoices SET check_id = NULL, status = "draft" WHERE check_id = ?')->execute([$id]);
                $pdo->prepare('UPDATE vendor_invoices SET check_id = NULL, status = "draft" WHERE check_id = ?')->execute([$id]);
            }

            $pdo->commit();
            echo json_encode(['check' => checkRow($pdo, $id)]);
            exit;
        }

        // --- edit fields (draft only) ---
        if ($cur['status'] !== 'draft') {
            $pdo->rollBack();
            http_response_code(422);
            exit(json_encode(['error' => 'Only a draft check can be edited. Void it and start over.']));
        }
        $sets = []; $params = [];
        foreach ([
            'payee_name'       => 'string',
            'payee_address'    => 'string',
            'memo'             => 'string',
            'check_date'       => 'issued_date',   // alias
            'issued_date'      => 'string',
            'pay_period_start' => 'string',
            'pay_period_end'   => 'string',
        ] as $field => $kind) {
            if (!array_key_exists($field, $body)) continue;
            $col = $kind === 'issued_date' ? 'issued_date' : $field;
            $val = $body[$field];
            $val = ($val === '' || $val === null) ? null : sanitizeString((string)$val);
            $sets[] = "$col = ?"; $params[] = $val;
        }
        if (array_key_exists('amount', $body)) {
            $amt = (float)$body['amount'];
            if ($amt <= 0) { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => 'Amount must be greater than 0.'])); }
            $sets[] = 'amount = ?'; $params[] = $amt;
        }
        if (!$sets) { $pdo->rollBack(); echo json_encode(['check' => $cur]); exit; }
        $params[] = $id;
        $pdo->prepare('UPDATE check_registry SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        $pdo->commit();
        echo json_encode(['check' => checkRow($pdo, $id)]);
        exit;

    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        exit;
    }
}

// ── DELETE: discard a draft check ───────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }
    $cur = checkRow($pdo, $id);
    if (!$cur) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    if ($cur['status'] !== 'draft') {
        http_response_code(422);
        exit(json_encode(['error' => 'Only a draft check can be deleted. Printed checks must be voided.']));
    }
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE contractor_invoices SET check_id = NULL, status = "draft" WHERE check_id = ?')->execute([$id]);
        $pdo->prepare('UPDATE vendor_invoices SET check_id = NULL, status = "draft" WHERE check_id = ?')->execute([$id]);
        $pdo->prepare('UPDATE paychecks SET check_registry_id = NULL WHERE check_registry_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM check_registry WHERE id = ?')->execute([$id]);
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

http_response_code(405); exit;
