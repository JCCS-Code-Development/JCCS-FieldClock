<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── POST: record a payment against a loan (admin only) ───────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['loan_id', 'amount']);

    $loanId = (int)$body['loan_id'];
    $amount = (float)$body['amount'];

    if ($amount <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Amount must be greater than zero']));
    }

    // Fetch remaining balance to prevent overpayment
    $stmt = $pdo->prepare(
        'SELECT l.amount - COALESCE(SUM(lp.amount), 0) AS remaining
         FROM employee_loans l
         LEFT JOIN loan_payments lp ON lp.loan_id = l.id
         WHERE l.id = ? GROUP BY l.id'
    );
    $stmt->execute([$loanId]);
    $row = $stmt->fetch();
    if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Loan not found'])); }

    if ($amount > (float)$row['remaining'] + 0.01) {
        http_response_code(422);
        exit(json_encode(['error' => 'Payment exceeds remaining balance of $' . number_format($row['remaining'], 2)]));
    }

    $pdo->prepare(
        'INSERT INTO loan_payments (loan_id, amount, period_start, period_end, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        $loanId,
        $amount,
        !empty($body['period_start']) ? $body['period_start'] : null,
        !empty($body['period_end'])   ? $body['period_end']   : null,
        !empty($body['notes'])        ? sanitizeString($body['notes']) : null,
        $auth['user_id'],
    ]);

    // Auto-mark loan as paid off if remaining balance is now zero
    $check = $pdo->prepare(
        'SELECT GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining
         FROM employee_loans l
         LEFT JOIN loan_payments lp ON lp.loan_id = l.id
         WHERE l.id = ? GROUP BY l.id'
    );
    $check->execute([$loanId]);
    $newRemaining = (float)$check->fetchColumn();
    if ($newRemaining <= 0) {
        $pdo->prepare('UPDATE employee_loans SET status = ? WHERE id = ?')->execute(['paid_off', $loanId]);
    }

    echo json_encode(['success' => true]);
    exit;
}

// ── DELETE: remove a payment (admin only) ────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    // Re-open loan if it was marked paid_off
    $loanRow = $pdo->prepare('SELECT loan_id FROM loan_payments WHERE id = ?');
    $loanRow->execute([$id]);
    $payment = $loanRow->fetch();
    if ($payment) {
        $pdo->prepare('UPDATE employee_loans SET status = ? WHERE id = ?')
            ->execute(['active', $payment['loan_id']]);
    }

    $pdo->prepare('DELETE FROM loan_payments WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
