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
    // that pay period. A recorded loan_payment overlapping the period is
    // authoritative; otherwise, for an active loan whose schedule has started
    // and still has a balance, fall back to the scheduled weekly_deduction
    // (capped at the remaining balance) so payroll withholds it automatically.
    if (!empty($_GET['period_start']) && !empty($_GET['period_end'])) {
        $ps = sanitizeString($_GET['period_start']);
        $pe = sanitizeString($_GET['period_end']);

        $deductionExpr =
            "CASE
                WHEN COALESCE(rec.paid, 0) > 0 THEN rec.paid
                WHEN l.status = 'active'
                     AND l.weekly_deduction > 0
                     AND l.deduction_start_date IS NOT NULL
                     AND l.deduction_start_date <= ?
                     AND (l.amount - COALESCE(pd.paid_ever, 0)) > 0
                  THEN LEAST(l.weekly_deduction, l.amount - COALESCE(pd.paid_ever, 0))
                ELSE 0
             END";

        $from =
            "FROM employee_loans l
             LEFT JOIN (
                 SELECT loan_id, SUM(amount) AS paid FROM loan_payments
                 WHERE period_start <= ? AND period_end >= ?
                 GROUP BY loan_id
             ) rec ON rec.loan_id = l.id
             LEFT JOIN (
                 SELECT loan_id, SUM(amount) AS paid_ever FROM loan_payments GROUP BY loan_id
             ) pd ON pd.loan_id = l.id";

        if (!$mine) {
            // Admin: all users grouped by user_id
            $stmt = $pdo->prepare(
                "SELECT l.user_id, COALESCE(SUM($deductionExpr), 0) AS period_deduction
                 $from
                 GROUP BY l.user_id
                 HAVING period_deduction > 0"
            );
            // placeholder order: deduction_start_date<=?, rec.period_start<=?, rec.period_end>=?
            $stmt->execute([$ps, $pe, $ps]);
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
            $stmt->execute([$ps, $pe, $ps, $auth['user_id']]);
            $row = $stmt->fetch();
            echo json_encode(['period_loan_deduction' => (float)($row['period_deduction'] ?? 0)]);
        }
        exit;
    }

    $sql = 'SELECT l.id, l.user_id, u.name AS user_name, u.address AS user_address, u.pay_type,
                   l.amount, l.weekly_deduction, l.deduction_start_date, l.check_printed_at,
                   l.description, l.status, l.created_at,
                   COALESCE(SUM(lp.amount), 0) AS paid_total,
                   GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining
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
        $sql .= ' WHERE l.user_id = ?';
        $params = [$auth['user_id']];
    }

    $sql .= ' GROUP BY l.id ORDER BY l.created_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['loans' => $stmt->fetchAll()]);
    exit;
}

// ── POST: create loan (admin only) ───────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['user_id', 'amount', 'weekly_deduction', 'deduction_start_date']);

    $amount  = (float)$body['amount'];
    $weekly  = (float)$body['weekly_deduction'];
    $startAt = sanitizeString($body['deduction_start_date']);

    if ($amount <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Amount must be greater than zero']));
    }
    if ($weekly <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Weekly deduction amount must be greater than zero']));
    }
    $parsedStart = DateTimeImmutable::createFromFormat('!Y-m-d', $startAt);
    if (!$parsedStart || $parsedStart->format('Y-m-d') !== $startAt) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid deduction start date']));
    }

    $pdo->prepare(
        'INSERT INTO employee_loans (user_id, amount, weekly_deduction, deduction_start_date, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        (int)$body['user_id'],
        $amount,
        $weekly,
        $startAt,
        !empty($body['description']) ? sanitizeString($body['description']) : null,
        $auth['user_id'],
    ]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare(
        'SELECT l.*, u.name AS user_name, u.pay_type,
                0 AS paid_total, l.amount AS remaining
         FROM employee_loans l JOIN users u ON u.id = l.user_id WHERE l.id = ?'
    );
    $row->execute([$id]);
    echo json_encode(['loan' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
