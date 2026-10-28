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

// An employee is leaving. Per the pagaré: the whole balance is due now, the
// Company may take it from the final pay — but never below $7.25 for each
// hour worked in that final pay period — and whatever is left is due within
// 30 days.
//
// GET  ?user_id=&date=YYYY-MM-DD → preview: balance owed, final-week hours,
//      the minimum-wage floor. (W-2 final pay runs through ADP, so the admin
//      supplies the final gross; the app can't see it.)
// POST {user_id, separation_date, final_gross, hours?, deduct_amount?} →
//      records the final-pay deduction against the loans (oldest first),
//      sets the 30-day due date, and cancels any loan never countersigned.
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();

function finalWeekHours(PDO $pdo, int $userId, string $date): array {
    $d     = new DateTimeImmutable($date);
    $start = $d->format('N') === '1' ? $d : $d->modify('last monday');
    $end   = $start->modify('+6 days');
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(ROUND(TIMESTAMPDIFF(SECOND, start_time, end_time) / 60)), 0)
         FROM time_entries WHERE user_id = ? AND DATE(start_time) BETWEEN ? AND ?
           AND end_time IS NOT NULL AND cost_category != 'day_end'"
    );
    $stmt->execute([$userId, $start->format('Y-m-d'), $end->format('Y-m-d')]);
    $mins = (int)$stmt->fetchColumn();
    $pen = $pdo->prepare('SELECT COALESCE(SUM(minutes), 0) FROM lunch_penalties WHERE user_id = ? AND work_date BETWEEN ? AND ?');
    $pen->execute([$userId, $start->format('Y-m-d'), $end->format('Y-m-d')]);
    $mins = max(0, $mins - (int)$pen->fetchColumn());
    return ['start' => $start->format('Y-m-d'), 'end' => $end->format('Y-m-d'), 'hours' => round($mins / 60, 2)];
}

function openLoans(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare(
        "SELECT l.id, l.amount, l.created_at,
                GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining
         FROM employee_loans l LEFT JOIN loan_payments lp ON lp.loan_id = l.id
         WHERE l.user_id = ? AND l.status = 'active'
         GROUP BY l.id HAVING remaining > 0 ORDER BY l.created_at, l.id"
    );
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function validDate(string $ymd): bool {
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $ymd);
    return $d && $d->format('Y-m-d') === $ymd;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $userId = (int)($_GET['user_id'] ?? 0);
    $date   = $_GET['date'] ?? date('Y-m-d');
    if (!$userId || !validDate($date)) jsonError(422, 'user_id and a valid date are required');
    $week  = finalWeekHours($pdo, $userId, $date);
    $loans = openLoans($pdo, $userId);
    echo json_encode([
        'final_week'      => $week,
        'min_wage'        => LOAN_FEDERAL_MIN_WAGE,
        'min_wage_floor'  => round($week['hours'] * LOAN_FEDERAL_MIN_WAGE, 2),
        'balance'         => round(array_sum(array_column($loans, 'remaining')), 2),
        'loans'           => $loans,
        'balance_due_date'=> (new DateTimeImmutable($date))->modify('+' . LOAN_SEPARATION_DUE_DAYS . ' days')->format('Y-m-d'),
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$body = jsonBody();
requireFields($body, ['user_id', 'separation_date', 'final_gross']);
$userId = (int)$body['user_id'];
$date   = sanitizeString($body['separation_date']);
if (!validDate($date)) jsonError(422, 'Invalid separation date');
$gross  = round((float)$body['final_gross'], 2);
if ($gross < 0) jsonError(422, 'Final pay cannot be negative');

$week  = finalWeekHours($pdo, $userId, $date);
$hours = isset($body['hours']) && $body['hours'] !== '' ? max(0, (float)$body['hours']) : $week['hours'];
$floor = round($hours * LOAN_FEDERAL_MIN_WAGE, 2);
$loans = openLoans($pdo, $userId);
$balance = round(array_sum(array_column($loans, 'remaining')), 2);

$maxAllowed = round(max(0, $gross - $floor), 2);
$deduct = isset($body['deduct_amount']) && $body['deduct_amount'] !== ''
    ? round((float)$body['deduct_amount'], 2) : $maxAllowed;
if ($deduct < 0) jsonError(422, 'Deduction cannot be negative');
if ($deduct > $maxAllowed + 0.004) {
    jsonError(422, 'That would leave less than $' . number_format($floor, 2) . " (minimum wage for {$hours} hours) in the final pay. The most you can deduct is $" . number_format($maxAllowed, 2) . '.');
}
$deduct = min($deduct, $balance);
$dueDate = (new DateTimeImmutable($date))->modify('+' . LOAN_SEPARATION_DUE_DAYS . ' days')->format('Y-m-d');

$pdo->beginTransaction();
$left = $deduct;
$insert = $pdo->prepare(
    "INSERT INTO loan_payments (loan_id, amount, payment_method, period_start, period_end, notes, created_by)
     VALUES (?, ?, 'payroll_deduction', ?, ?, 'Final pay deduction (separation)', ?)"
);
foreach ($loans as $l) {
    $take = round(min($left, (float)$l['remaining']), 2);
    if ($take > 0) {
        $insert->execute([$l['id'], $take, $week['start'], $week['end'], $auth['user_id']]);
        $left = round($left - $take, 2);
    }
    $stillOwed = round((float)$l['remaining'] - $take, 2);
    $pdo->prepare(
        'UPDATE employee_loans SET separated_at = ?, final_pay_deduction = ?, balance_due_date = ?, status = ? WHERE id = ?'
    )->execute([$date, $take, $stillOwed > 0 ? $dueDate : null, $stillOwed > 0 ? 'active' : 'paid_off', $l['id']]);
}
// Never disbursed — nothing to collect, just cancel.
$pdo->prepare("UPDATE employee_loans SET status = 'void' WHERE user_id = ? AND status IN ('pending_signature','pending_countersign')")
    ->execute([$userId]);
$pdo->commit();

echo json_encode([
    'success'          => true,
    'deducted'         => $deduct,
    'still_owed'       => round($balance - $deduct, 2),
    'balance_due_date' => $balance - $deduct > 0 ? $dueDate : null,
]);
