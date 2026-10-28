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

// GET ?loan_id=  → every pagaré for that loan (borrower: own loans only).
// GET ?mine=1    → all of the caller's own notes (My Documents; the banner
//                  counts the ones still waiting for their signature).
// Never returns the 12-month loan count — that's admin-only.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth();
$pdo  = getPDO();

$cols = 'n.id, n.loan_id, n.kind, n.variant, n.language, n.principal, n.weekly_amount, n.installments,
         n.first_due_date, n.note_text_en, n.note_text_es, n.note_hash,
         n.borrower_signature, n.borrower_signed_at, n.company_signature, n.company_signed_at,
         n.emailed_at, n.created_at, n.created_by, l.user_id, u.name AS borrower_name, c.name AS company_signer_name';
$from = 'FROM loan_notes n
         JOIN employee_loans l ON l.id = n.loan_id
         JOIN users u ON u.id = l.user_id
         LEFT JOIN users c ON c.id = n.company_signer_id';

if (!empty($_GET['mine'])) {
    $stmt = $pdo->prepare("SELECT $cols $from
                           WHERE l.user_id = ? AND (l.status <> 'void' OR n.borrower_signed_at IS NOT NULL)
                           ORDER BY n.id DESC");
    $stmt->execute([$auth['user_id']]);
    $notes = $stmt->fetchAll();
    // Re-issue any whose first week is now under 7 days away, then re-read,
    // so the borrower is only ever shown a note they're allowed to sign.
    $changed = false;
    foreach ($notes as $n) { if (refreshStaleNote($pdo, $n) !== (int)$n['id']) $changed = true; }
    if ($changed) { $stmt->execute([$auth['user_id']]); $notes = $stmt->fetchAll(); }
    echo json_encode(['notes' => $notes]);
    exit;
}

$loanId = (int)($_GET['loan_id'] ?? 0);
if (!$loanId) jsonError(422, 'loan_id required');
$owner = $pdo->prepare('SELECT user_id FROM employee_loans WHERE id = ?');
$owner->execute([$loanId]);
$ownerId = $owner->fetchColumn();
if ($ownerId === false) jsonError(404, 'Not found');
if ($auth['role'] !== 'admin' && (int)$ownerId !== (int)$auth['user_id']) jsonError(403, 'Forbidden');

$stmt = $pdo->prepare("SELECT $cols $from WHERE n.loan_id = ? ORDER BY n.id");
$stmt->execute([$loanId]);
echo json_encode(['notes' => $stmt->fetchAll()]);
