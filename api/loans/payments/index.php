<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/jwt.php';
require_once __DIR__ . '/../../middleware/auth.php';
require_once __DIR__ . '/../../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── POST: record a payment against a loan (admin only) ───────────
// multipart/form-data — a receipt image may be attached for check/transfer
// payments, so this can't be plain JSON the way most POST endpoints are.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);

    $loanId = (int)($_POST['loan_id'] ?? 0);
    $amount = (float)($_POST['amount'] ?? 0);
    $method = sanitizeString($_POST['payment_method'] ?? '');

    if (!$loanId) {
        http_response_code(422);
        exit(json_encode(['error' => 'loan_id is required']));
    }
    if ($amount <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Amount must be greater than zero']));
    }
    if (!in_array($method, ['cash', 'check', 'transfer', 'payroll_deduction'], true)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid payment method']));
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

    // A receipt image is required for check/transfer (Zelle etc.) — not cash.
    $receiptPath = null;
    $receiptName = null;
    if (in_array($method, ['check', 'transfer'], true) && empty($_FILES['receipt']['tmp_name'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'A receipt image is required for check or transfer payments']));
    }
    if (!empty($_FILES['receipt']['tmp_name'])) {
        $file = $_FILES['receipt'];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        $allowed  = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
        if (!array_key_exists($mimeType, $allowed)) {
            http_response_code(422);
            exit(json_encode(['error' => 'Receipt must be an image (JPEG, PNG, WEBP) or PDF']));
        }
        if ($file['size'] > 10 * 1024 * 1024) {
            http_response_code(422);
            exit(json_encode(['error' => 'Receipt file must be under 10 MB']));
        }

        $uploadDir = __DIR__ . '/../../uploads/loan-receipts/' . $loanId . '/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filename    = bin2hex(random_bytes(16)) . '.' . $allowed[$mimeType];
        $destination = $uploadDir . $filename;
        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            http_response_code(500);
            exit(json_encode(['error' => 'Failed to save receipt']));
        }
        $receiptPath = 'uploads/loan-receipts/' . $loanId . '/' . $filename;
        $receiptName = sanitizeString($file['name']);
    }

    $pdo->prepare(
        'INSERT INTO loan_payments
           (loan_id, amount, payment_method, reference_number, receipt_file_path, receipt_file_original_name,
            period_start, period_end, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $loanId,
        $amount,
        $method,
        !empty($_POST['reference_number']) ? sanitizeString($_POST['reference_number']) : null,
        $receiptPath,
        $receiptName,
        !empty($_POST['period_start']) ? sanitizeString($_POST['period_start']) : null,
        !empty($_POST['period_end'])   ? sanitizeString($_POST['period_end'])   : null,
        !empty($_POST['notes'])        ? sanitizeString($_POST['notes']) : null,
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
    $loanRow = $pdo->prepare('SELECT loan_id, receipt_file_path FROM loan_payments WHERE id = ?');
    $loanRow->execute([$id]);
    $payment = $loanRow->fetch();
    if ($payment) {
        $pdo->prepare('UPDATE employee_loans SET status = ? WHERE id = ?')
            ->execute(['active', $payment['loan_id']]);
        if ($payment['receipt_file_path']) {
            $receiptFile = realpath(__DIR__ . '/../../' . $payment['receipt_file_path']);
            if ($receiptFile && is_file($receiptFile)) @unlink($receiptFile);
        }
    }

    $pdo->prepare('DELETE FROM loan_payments WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
