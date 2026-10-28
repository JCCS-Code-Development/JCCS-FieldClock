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
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/mail.php';

// POST {note_id, signature_data} or {note_id, use_saved: true} — admin signs
// for JCCS Services LLC after
// the borrower has signed. This is the moment terms take effect:
//   original  → loan becomes 'active' (hand over the money now)
//   amendment → the loan's weekly amount / schedule switch to the new terms
//   repaper   → loan was already active; it's now documented
// Then the borrower is emailed a copy in the language they signed.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();
requireFields($body, ['note_id']);

// use_saved: stamp the admin's own saved signature (my-signature.php)
// instead of drawing one — still recorded as this admin, right now.
if (!empty($body['use_saved'])) {
    $saved = $pdo->prepare('SELECT saved_signature FROM users WHERE id = ?');
    $saved->execute([$auth['user_id']]);
    $body['signature_data'] = (string)$saved->fetchColumn();
    if ($body['signature_data'] === '') jsonError(422, 'You have no saved signature yet — draw one.');
}
if (strlen((string)($body['signature_data'] ?? '')) < 100) jsonError(422, 'Signature is required.');

$stmt = $pdo->prepare(
    'SELECT n.*, l.status AS loan_status, u.name, u.email FROM loan_notes n
     JOIN employee_loans l ON l.id = n.loan_id JOIN users u ON u.id = l.user_id WHERE n.id = ?'
);
$stmt->execute([(int)$body['note_id']]);
$note = $stmt->fetch();
if (!$note) jsonError(404, 'Document not found');
if ($note['borrower_signed_at'] === null) jsonError(409, 'The employee has not signed this document yet.');
if ($note['company_signed_at'] !== null)  jsonError(409, 'This document is already countersigned.');
if ($note['loan_status'] === 'void')      jsonError(409, 'This loan was cancelled.');

$pdo->beginTransaction();
$pdo->prepare('UPDATE loan_notes SET company_signature = ?, company_signer_id = ?, company_signed_at = NOW() WHERE id = ?')
    ->execute([$body['signature_data'], $auth['user_id'], $note['id']]);
if ($note['kind'] === 'original') {
    $pdo->prepare("UPDATE employee_loans SET status = 'active' WHERE id = ?")->execute([$note['loan_id']]);
} else {
    // An amendment or re-paper restated the remaining balance from its first
    // week on, so the loan's schedule now runs from there at the note's
    // weekly amount (due.php reads the schedule from the latest signed note).
    $pdo->prepare('UPDATE employee_loans SET weekly_deduction = ?, installments = ?, deduction_start_date = ? WHERE id = ?')
        ->execute([$note['weekly_amount'], $note['installments'], $note['first_due_date'], $note['loan_id']]);
}
$pdo->commit();

// Best-effort copy by email — the signed document is always available in
// the app regardless (My Documents), so a mail failure doesn't undo anything.
$emailed = false;
if (!empty($note['email'])) {
    $es      = $note['language'] === 'es';
    $text    = $es ? $note['note_text_es'] : $note['note_text_en'];
    $subject = ($es ? 'Su pagaré firmado — ' : 'Your signed promissory note — ') . loanNoteNumber((int)$note['loan_id']);
    $footer  = $es
        ? "\n\n----\nFirmado electrónicamente por {$note['name']} el {$note['borrower_signed_at']} y por " . LOAN_LENDER_NAME . " el " . date('Y-m-d H:i:s') . ".\nPuede ver este documento en cualquier momento en FieldClock → Mis Documentos.\nHuella del documento (SHA-256): {$note['note_hash']}"
        : "\n\n----\nSigned electronically by {$note['name']} on {$note['borrower_signed_at']} and by " . LOAN_LENDER_NAME . " on " . date('Y-m-d H:i:s') . ".\nYou can view this document any time in FieldClock → My Documents.\nDocument fingerprint (SHA-256): {$note['note_hash']}";
    $emailed = sendEmail($note['email'], $note['name'], $subject, $text . $footer);
    if ($emailed) $pdo->prepare('UPDATE loan_notes SET emailed_at = NOW() WHERE id = ?')->execute([$note['id']]);
}
echo json_encode(['success' => true, 'emailed' => $emailed]);
