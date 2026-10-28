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

// POST {loan_id} — cancel a loan that was never fully signed (e.g. the
// employee changed their mind). Only before countersigning and before any
// payment; the unsigned/half-signed note stays on file.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();
$id   = (int)($body['loan_id'] ?? 0);

$stmt = $pdo->prepare('SELECT status FROM employee_loans WHERE id = ?');
$stmt->execute([$id]);
$status = $stmt->fetchColumn();
if ($status === false) jsonError(404, 'Loan not found');
if (!in_array($status, ['pending_signature', 'pending_countersign'], true)) {
    jsonError(409, 'Only a loan that is still waiting for signatures can be cancelled.');
}
$pdo->prepare("UPDATE employee_loans SET status = 'void' WHERE id = ?")->execute([$id]);
echo json_encode(['success' => true]);
