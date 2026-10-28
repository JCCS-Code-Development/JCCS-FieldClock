<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_pagare.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list loans ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    // An admin is also an employee with their own My Pay page, and that page
    // calls this same endpoint to show "my loans" — with no params, same as
    // the admin management page asking for everyone's. Role alone can't tell
    // those two calls apart, so My Pay explicitly passes ?mine=1 to force
    // self-scoping even for an admin. Never trust the client to *widen*
    // scope, only to narrow it: a plain employee is always self-scoped
    // regardless of this flag.
    $mine = $auth['role'] !== 'admin' || !empty($_GET['mine']);

    // Optional: period_start + period_end → return loan deduction per user for
    // that pay period. Only loan_payment rows recorded by an admin (Loans page →
    // Record Payment) that overlap the period count. Nothing is withheld
    // automatically from the scheduled weekly_deduction — payroll flags active
    // loans instead, and the admin collects by recording the payment.
    // (Payments can only be recorded on a signed, active loan — see
    // payments/index.php — so an unsigned pagaré never reaches a check.)
    if (!empty($_GET['period_start']) && !empty($_GET['period_end'])) {
        $ps = sanitizeString($_GET['period_start']);
        $pe = sanitizeString($_GET['period_end']);

        $deductionExpr = "COALESCE(rec.paid, 0)";

        $from =
            "FROM employee_loans l
             LEFT JOIN (
                 SELECT loan_id, SUM(amount) AS paid, COUNT(*) AS n FROM loan_payments
                 WHERE period_start <= ? AND period_end >= ?
                 GROUP BY loan_id
             ) rec ON rec.loan_id = l.id";

        if (!$mine) {
            // Admin: all users grouped by user_id
            $stmt = $pdo->prepare(
                "SELECT l.user_id, COALESCE(SUM($deductionExpr), 0) AS period_deduction
                 $from
                 GROUP BY l.user_id
                 HAVING period_deduction > 0"
            );
            $stmt->execute([$pe, $ps]);
            $byUser = [];
            foreach ($stmt->fetchAll() as $r) {
                $byUser[(int)$r['user_id']] = (float)$r['period_deduction'];
            }
            echo json_encode(['period_loan_deductions' => $byUser]);
        } else {
            // Employee (or admin viewing their own My Pay page): own deduction only
            $stmt = $pdo->prepare(
                "SELECT COALESCE(SUM($deductionExpr), 0) AS period_deduction
                 $from
                 WHERE l.user_id = ?"
            );
            $stmt->execute([$pe, $ps, $auth['user_id']]);
            $row = $stmt->fetch();
            echo json_encode(['period_loan_deduction' => (float)($row['period_deduction'] ?? 0)]);
        }
        exit;
    }

    $sql = 'SELECT l.id, l.user_id, u.name AS user_name, u.address AS user_address, u.pay_type,
                   l.amount, l.weekly_deduction, l.deduction_start_date, l.check_printed_at,
                   l.description, l.status, l.created_at, l.installments,
                   l.separated_at, l.final_pay_deduction, l.balance_due_date, l.late_notice_at, l.demand_letter_at,
                   ' . ($mine ? '' : 'l.limit_override_reason,') . '
                   COALESCE(SUM(lp.amount), 0) AS paid_total,
                   GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining,
                   (SELECT COUNT(*) FROM loan_notes n WHERE n.loan_id = l.id AND n.company_signed_at IS NOT NULL) AS signed_notes,
                   (SELECT n.id FROM loan_notes n WHERE n.loan_id = l.id AND n.company_signed_at IS NULL ORDER BY n.id DESC LIMIT 1) AS pending_note_id,
                   (SELECT n.kind FROM loan_notes n WHERE n.loan_id = l.id AND n.company_signed_at IS NULL ORDER BY n.id DESC LIMIT 1) AS pending_note_kind,
                   (SELECT n.created_at FROM loan_notes n WHERE n.loan_id = l.id AND n.company_signed_at IS NULL ORDER BY n.id DESC LIMIT 1) AS pending_note_created_at,
                   (SELECT n.borrower_signed_at FROM loan_notes n WHERE n.loan_id = l.id AND n.company_signed_at IS NULL ORDER BY n.id DESC LIMIT 1) AS pending_note_borrower_signed_at
            FROM employee_loans l
            JOIN users u ON u.id = l.user_id
            LEFT JOIN loan_payments lp ON lp.loan_id = l.id';

    if (!$mine) {
        $params = [];
        if (!empty($_GET['user_id'])) {
            $sql .= ' WHERE l.user_id = ?'; $params[] = (int)$_GET['user_id'];
        }
        if (!empty($_GET['status'])) {
            $sql .= empty($params) ? ' WHERE' : ' AND';
            $sql .= ' l.status = ?'; $params[] = sanitizeString($_GET['status']);
        }
    } else {
        // A voided loan was never signed or paid out — nothing for the
        // employee to see.
        $sql .= " WHERE l.user_id = ? AND l.status <> 'void'";
        $params = [$auth['user_id']];
    }

    $sql .= ' GROUP BY l.id ORDER BY l.created_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['loans' => $stmt->fetchAll()]);
    exit;
}

// ── POST: create loan (admin only) ───────────────────────────────
// Every new loan starts as 'pending_signature' with a pagaré generated from
// its terms. It only becomes 'active' (and money is handed over) once the
// borrower signs and an admin countersigns — sign.php / countersign.php.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['user_id', 'amount', 'deduction_start_date']);

    $userId  = (int)$body['user_id'];
    $amount  = round((float)$body['amount'], 2);
    $startAt = sanitizeString($body['deduction_start_date']);

    if ($amount <= 0) jsonError(422, 'Amount must be greater than zero');

    // Either the weekly amount or the number of installments — the other is
    // derived. The last installment absorbs any rounding.
    if (!empty($body['installments'])) {
        $n = (int)$body['installments'];
        if ($n < 1) jsonError(422, 'Installments must be at least 1');
        $weekly = round(ceil($amount / $n * 100) / 100, 2);
    } else {
        $weekly = round((float)($body['weekly_deduction'] ?? 0), 2);
    }
    if ($weekly <= 0) jsonError(422, 'Weekly amount must be greater than zero');
    $weekly = min($weekly, $amount);

    // SC: deductions need 7 days' written notice — the first installment week
    // must be a Monday at least 7 days out (re-checked again at signing).
    if (!isMonday($startAt)) jsonError(422, 'The first installment week must start on a Monday');
    $earliest = earliestFirstDueDate();
    if ($startAt < $earliest) jsonError(422, "The first installment can't be earlier than $earliest (7 days' notice)");

    $user = $pdo->prepare("SELECT id, role FROM users WHERE id = ?");
    $user->execute([$userId]);
    $u = $user->fetch();
    if (!$u) jsonError(404, 'Employee not found');
    if ($u['role'] === 'contractor') jsonError(422, 'Contractors are not eligible for employee loans');

    // 3 loans per rolling 12 months — an admin may override with a reason.
    $count    = loanCountLast12Months($pdo, $userId);
    $override = trim((string)($body['override_reason'] ?? ''));
    if ($count >= LOAN_LIMIT_PER_12_MONTHS && $override === '') {
        jsonError(409, "This employee already has $count loans in the last 12 months.", [
            'limit_reached' => true, 'count' => $count, 'limit' => LOAN_LIMIT_PER_12_MONTHS,
        ]);
    }

    $installments = count(buildLoanSchedule($amount, $weekly, $startAt));

    $pdo->beginTransaction();
    $pdo->prepare(
        "INSERT INTO employee_loans
           (user_id, amount, weekly_deduction, installments, deduction_start_date, description,
            limit_override_reason, limit_override_by, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_signature', ?)"
    )->execute([
        $userId, $amount, $weekly, $installments, $startAt,
        !empty($body['description']) ? sanitizeString($body['description']) : null,
        $count >= LOAN_LIMIT_PER_12_MONTHS ? sanitizeString($override) : null,
        $count >= LOAN_LIMIT_PER_12_MONTHS ? $auth['user_id'] : null,
        $auth['user_id'],
    ]);
    $id = (int)$pdo->lastInsertId();
    $noteId = createLoanNote($pdo, $id, 'original', $amount, $weekly, $startAt, $auth['user_id']);
    $pdo->commit();

    $row = $pdo->prepare(
        'SELECT l.*, u.name AS user_name, u.pay_type,
                0 AS paid_total, l.amount AS remaining
         FROM employee_loans l JOIN users u ON u.id = l.user_id WHERE l.id = ?'
    );
    $row->execute([$id]);
    echo json_encode(['loan' => $row->fetch(), 'note_id' => $noteId]);
    exit;
}

http_response_code(405);
exit;
