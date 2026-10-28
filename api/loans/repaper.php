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

// POST {} or {loan_id} — issue a 're-paper' pagaré for active loans that
// predate signed pagarés (no note on file at all): it restates the current
// balance and the remaining weekly schedule, starting ≥ 7 days out. Until
// it's signed, 1099 payroll deductions on that loan aren't authorized in
// writing — due.php flags any still unsigned after 14 days.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();

$sql = "SELECT l.id, l.weekly_deduction FROM employee_loans l
        WHERE l.status = 'active' AND NOT EXISTS (SELECT 1 FROM loan_notes n WHERE n.loan_id = l.id)";
$params = [];
if (!empty($body['loan_id'])) { $sql .= ' AND l.id = ?'; $params[] = (int)$body['loan_id']; }
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$first  = earliestFirstDueDate();
$issued = [];
foreach ($stmt->fetchAll() as $l) {
    $remaining = loanRemaining($pdo, (int)$l['id']);
    if ($remaining <= 0) continue;
    $weekly = (float)($l['weekly_deduction'] ?? 0) > 0 ? min((float)$l['weekly_deduction'], $remaining) : $remaining;
    $issued[] = createLoanNote($pdo, (int)$l['id'], 'repaper', $remaining, $weekly, $first, $auth['user_id']);
}
echo json_encode(['success' => true, 'issued' => count($issued), 'note_ids' => $issued]);
