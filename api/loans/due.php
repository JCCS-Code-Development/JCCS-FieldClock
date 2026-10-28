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

// GET ?week_start=YYYY-MM-DD (a Monday; default this week) — admin list of
// loan installments for that week and anything overdue, to record payments
// from: 1099 → payroll deduction on that week's check; W-2 → the Zelle the
// employee sent. Flags:
//   late         W-2 installment 14+ days overdue → the pagaré allows a wage
//                deduction, but only after a 7-day written notice
//   unsigned     re-paper pagaré still unsigned after 14 days → stop
//                recording 1099 deductions for that loan
//   separated    balance still owed after the 30-day post-separation deadline
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();

$weekStart = $_GET['week_start'] ?? (new DateTimeImmutable('monday this week'))->format('Y-m-d');
if (!isMonday($weekStart)) jsonError(422, 'week_start must be a Monday');
$weekEnd = (new DateTimeImmutable($weekStart))->modify('+6 days')->format('Y-m-d');
$today   = new DateTimeImmutable('today');

$loans = $pdo->query(
    "SELECT l.id, l.user_id, u.name AS user_name, u.pay_type, l.amount, l.weekly_deduction,
            l.deduction_start_date, l.status, l.balance_due_date, l.late_notice_at, l.demand_letter_at,
            COALESCE((SELECT SUM(amount) FROM loan_payments p WHERE p.loan_id = l.id), 0) AS paid_total
     FROM employee_loans l JOIN users u ON u.id = l.user_id
     WHERE l.status = 'active'"
)->fetchAll();

$signedNote = $pdo->prepare(
    'SELECT principal, weekly_amount, first_due_date FROM loan_notes
     WHERE loan_id = ? AND company_signed_at IS NOT NULL ORDER BY id DESC LIMIT 1'
);
$pendingNote = $pdo->prepare(
    'SELECT kind, created_at, borrower_signed_at FROM loan_notes
     WHERE loan_id = ? AND company_signed_at IS NULL ORDER BY id DESC LIMIT 1'
);
$paidInWeek = $pdo->prepare(
    'SELECT COALESCE(SUM(amount), 0) FROM loan_payments
     WHERE loan_id = ? AND ((period_start IS NOT NULL AND period_start BETWEEN ? AND ?)
                         OR (period_start IS NULL AND DATE(created_at) BETWEEN ? AND ?))'
);

$rows = [];
foreach ($loans as $l) {
    $id   = (int)$l['id'];
    $paid = (float)$l['paid_total'];
    $remaining = round(max(0, (float)$l['amount'] - $paid), 2);

    // Schedule = latest signed pagaré's terms (an amendment/re-paper restates
    // the balance from its own first week); a loan with no signed pagaré yet
    // falls back to the loan's own fields.
    $signedNote->execute([$id]);
    $n = $signedNote->fetch();
    if ($n) {
        // An admin may have since lowered the weekly amount or pushed the
        // start later on the loan itself (item.php only allows those two
        // directions) — honor that over the note.
        $weekly = (float)$l['weekly_deduction'] > 0 ? min((float)$n['weekly_amount'], (float)$l['weekly_deduction']) : (float)$n['weekly_amount'];
        $first  = max($n['first_due_date'], (string)$l['deduction_start_date']);
        $schedule  = buildLoanSchedule((float)$n['principal'], $weekly, $first);
        $paidSince = $paid - ((float)$l['amount'] - (float)$n['principal']);
    } elseif ((float)$l['weekly_deduction'] > 0 && $l['deduction_start_date']) {
        $schedule  = buildLoanSchedule((float)$l['amount'], (float)$l['weekly_deduction'], $l['deduction_start_date']);
        $paidSince = $paid;
    } else {
        $schedule = []; $paidSince = $paid;
    }

    $thisWeek = 0.0; $expectedBefore = 0.0; $cum = 0.0; $oldestUnpaid = null;
    foreach ($schedule as $s) {
        if ($s['date'] === $weekStart) $thisWeek = $s['amount'];
        if ($s['date'] < $weekStart)  $expectedBefore += $s['amount'];
        $cum += $s['amount'];
        if ($oldestUnpaid === null && $cum > $paidSince + 0.004 && $s['date'] <= $today->format('Y-m-d')) {
            $oldestUnpaid = $s['date'];
        }
    }
    $paidInWeek->execute([$id, $weekStart, $weekEnd, $weekStart, $weekEnd]);
    $paidThisWeek = (float)$paidInWeek->fetchColumn();
    $behind   = round(max(0, $expectedBefore - ($paidSince - $paidThisWeek)), 2);
    $daysLate = $oldestUnpaid ? (int)$today->diff(new DateTimeImmutable($oldestUnpaid))->days : 0;

    $pendingNote->execute([$id]);
    $p = $pendingNote->fetch();
    $unsignedDays = $p && $p['borrower_signed_at'] === null
        ? (int)$today->diff((new DateTimeImmutable($p['created_at']))->setTime(0, 0))->days : 0;

    $flags = [];
    if ($l['pay_type'] !== '1099' && $daysLate >= LOAN_LATE_DAYS) $flags[] = 'late';
    if ($p && $p['kind'] === 'repaper' && $p['borrower_signed_at'] === null && $unsignedDays >= LOAN_LATE_DAYS) $flags[] = 'unsigned';
    if ($l['balance_due_date'] && $l['balance_due_date'] < $today->format('Y-m-d') && $remaining > 0) $flags[] = 'separated';

    if ($thisWeek <= 0 && $behind <= 0 && !$flags) continue;
    $rows[] = [
        'loan_id'        => $id,
        'user_id'        => (int)$l['user_id'],
        'user_name'      => $l['user_name'],
        'pay_type'       => $l['pay_type'],
        'installment'    => round($thisWeek, 2),
        'paid_this_week' => round($paidThisWeek, 2),
        'behind'         => $behind,
        'days_late'      => $daysLate,
        'remaining'      => $remaining,
        'balance_due_date' => $l['balance_due_date'],
        'late_notice_at'   => $l['late_notice_at'],
        'demand_letter_at' => $l['demand_letter_at'],
        'flags'          => $flags,
    ];
}
echo json_encode(['week_start' => $weekStart, 'week_end' => $weekEnd, 'due' => $rows]);
