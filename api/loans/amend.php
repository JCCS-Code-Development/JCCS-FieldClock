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

// POST {loan_id, weekly_deduction, first_due_date} — change an active
// loan's weekly amount via a new signed pagaré (an 'amendment' restating the
// remaining balance). Needed to RAISE the amount: SC requires 7 days'
// written notice before a deduction increases, so the new amount only
// applies from a Monday ≥ 7 days after the borrower signs, and only once
// it's countersigned. Lowering or skipping a week needs no amendment — just
// record less (or nothing) for that week.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();
requireFields($body, ['loan_id', 'weekly_deduction', 'first_due_date']);

$loanId = (int)$body['loan_id'];
$weekly = round((float)$body['weekly_deduction'], 2);
$first  = sanitizeString($body['first_due_date']);

$stmt = $pdo->prepare('SELECT status FROM employee_loans WHERE id = ?');
$stmt->execute([$loanId]);
$status = $stmt->fetchColumn();
if ($status === false) jsonError(404, 'Loan not found');
if ($status !== 'active') jsonError(409, 'Only an active loan can be amended.');

$pending = $pdo->prepare('SELECT COUNT(*) FROM loan_notes WHERE loan_id = ? AND company_signed_at IS NULL');
$pending->execute([$loanId]);
if ((int)$pending->fetchColumn() > 0) jsonError(409, 'This loan already has a document waiting for signatures.');

$remaining = loanRemaining($pdo, $loanId);
if ($remaining <= 0) jsonError(409, 'This loan has no remaining balance.');
if ($weekly <= 0) jsonError(422, 'Weekly amount must be greater than zero');
if (!isMonday($first)) jsonError(422, 'The first installment week must start on a Monday');
$earliest = earliestFirstDueDate();
if ($first < $earliest) jsonError(422, "The new amount can't start earlier than $earliest (7 days' notice)");

$noteId = createLoanNote($pdo, $loanId, 'amendment', $remaining, min($weekly, $remaining), $first, $auth['user_id']);
echo json_encode(['success' => true, 'note_id' => $noteId]);
