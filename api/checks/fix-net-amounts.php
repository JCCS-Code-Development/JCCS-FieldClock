<?php
// Admin-triggered version of api/migrations/fix_check_registry_net_loan_amounts.php,
// for hosts where the CLI script can't be run (no SSH/Terminal access).
//
// GET  → dry run: returns the rows that would change, writes nothing.
// POST → applies the same corrections written by the CLI script (same
//        idempotency marker in check_registry.notes, same paychecks sync).
//
// See api/migrations/fix_check_registry_net_loan_amounts.php for the full
// explanation of the bug this corrects.

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

const MARKER = '[net-pay correction';

function findCorrections(PDO $pdo): array {
    $rows = $pdo->query(
        "SELECT cr.id, cr.check_number, cr.payee_name, cr.user_id, cr.amount,
                cr.status, cr.pay_period_start, cr.pay_period_end, cr.notes
         FROM check_registry cr
         JOIN users u ON u.id = cr.user_id
         WHERE u.pay_type = '1099'
           AND (cr.notes IS NULL OR cr.notes NOT LIKE " . $pdo->quote('%' . MARKER . '%') . ")
         ORDER BY cr.issued_date, cr.check_number"
    )->fetchAll();

    $findDeduction = $pdo->prepare(
        'SELECT COALESCE(SUM(lp.amount), 0) AS ded
         FROM loan_payments lp
         JOIN employee_loans l ON l.id = lp.loan_id
         WHERE l.user_id = ? AND lp.period_start <= ? AND lp.period_end >= ?'
    );

    $corrections = [];
    foreach ($rows as $r) {
        $findDeduction->execute([$r['user_id'], $r['pay_period_end'], $r['pay_period_start']]);
        $ded = (float)$findDeduction->fetch()['ded'];
        if ($ded <= 0) continue;

        $old = (float)$r['amount'];
        $new = max($old - $ded, 0);
        if (abs($new - $old) < 0.005) continue;

        $corrections[] = [
            'id'               => (int)$r['id'],
            'check_number'     => $r['check_number'],
            'payee_name'       => $r['payee_name'],
            'status'           => $r['status'],
            'pay_period_start' => $r['pay_period_start'],
            'pay_period_end'   => $r['pay_period_end'],
            'old_amount'       => round($old, 2),
            'loan_deduction'   => round($ded, 2),
            'new_amount'       => round($new, 2),
        ];
    }
    return $corrections;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $corrections = findCorrections($pdo);
    $totalDelta  = array_sum(array_map(fn($c) => $c['old_amount'] - $c['new_amount'], $corrections));
    echo json_encode(['corrections' => $corrections, 'total_delta' => round($totalDelta, 2)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $corrections = findCorrections($pdo);
    if (!$corrections) {
        echo json_encode(['applied' => 0, 'total_delta' => 0]);
        exit;
    }

    $updateCheck = $pdo->prepare(
        'UPDATE check_registry
         SET amount = ?, notes = CONCAT(COALESCE(notes, \'\'), IF(COALESCE(notes, \'\') = \'\', \'\', \'\n\'), ?)
         WHERE id = ?'
    );
    $updatePaycheck = $pdo->prepare('UPDATE paychecks SET amount = ? WHERE check_registry_id = ?');

    try {
        $pdo->beginTransaction();
        $totalDelta = 0;
        foreach ($corrections as $c) {
            $note = sprintf(
                '%s applied %s: gross $%s -> net $%s (loan deduction $%s for %s .. %s)]',
                MARKER, date('Y-m-d'), number_format($c['old_amount'], 2), number_format($c['new_amount'], 2),
                number_format($c['loan_deduction'], 2), $c['pay_period_start'], $c['pay_period_end']
            );
            $updateCheck->execute([$c['new_amount'], $note, $c['id']]);
            $updatePaycheck->execute([$c['new_amount'], $c['id']]);
            $totalDelta += $c['old_amount'] - $c['new_amount'];
        }
        $pdo->commit();
        echo json_encode(['applied' => count($corrections), 'total_delta' => round($totalDelta, 2)]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
