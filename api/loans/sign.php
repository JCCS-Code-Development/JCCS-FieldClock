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

// POST {note_id, signature_data, esign_consent: true, language_ack: true}
// The borrower signs their own pagaré. Original loans move to
// 'pending_countersign'; nothing is active until an admin countersigns.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth();
$pdo  = getPDO();
$body = jsonBody();
requireFields($body, ['note_id', 'signature_data']);

if (empty($body['esign_consent']))  jsonError(422, 'You must agree to sign electronically.');
if (empty($body['language_ack']))   jsonError(422, 'You must confirm you read and understood the document.');
if (strlen((string)$body['signature_data']) < 100) jsonError(422, 'Signature is required.');

$stmt = $pdo->prepare(
    'SELECT n.*, l.user_id, l.status AS loan_status FROM loan_notes n
     JOIN employee_loans l ON l.id = n.loan_id WHERE n.id = ?'
);
$stmt->execute([(int)$body['note_id']]);
$note = $stmt->fetch();
if (!$note || (int)$note['user_id'] !== (int)$auth['user_id']) jsonError(404, 'Document not found');
if ($note['borrower_signed_at'] !== null) jsonError(409, 'This document has already been signed and cannot be modified.');
if ($note['loan_status'] === 'void') jsonError(409, 'This loan was cancelled.');

// The 7-day notice is measured from the signature — if the first week is
// now too close, the text they read is out of date. They reload and get a
// re-issued note (notes.php?pending=1 does that) and sign that one instead.
if ($note['first_due_date'] < earliestFirstDueDate()) {
    jsonError(409, 'This document was updated with a new payment schedule. Please reload and review it again.', ['stale' => true]);
}

$pdo->prepare(
    'UPDATE loan_notes SET borrower_signature = ?, borrower_signed_at = NOW(), esign_consent_at = NOW(),
                           borrower_ip = ?, borrower_user_agent = ?
     WHERE id = ? AND borrower_signed_at IS NULL'
)->execute([
    $body['signature_data'], clientIp(),
    substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255) ?: null,
    $note['id'],
]);
if ($note['kind'] === 'original') {
    $pdo->prepare("UPDATE employee_loans SET status = 'pending_countersign' WHERE id = ? AND status = 'pending_signature'")
        ->execute([$note['loan_id']]);
}
echo json_encode(['success' => true]);
