<?php
// Shared helpers for signed loan pagarés — see api/loans/_note_template.php
// for the text itself and ~/.claude/plans/fieldclock-loan-pagare.md for the
// rules (SC Payment of Wages Act: written notice of deductions, 7 days'
// notice before a deduction starts or increases).
require_once __DIR__ . '/_note_template.php';

const LOAN_LIMIT_PER_12_MONTHS = 3;
const LOAN_NOTICE_DAYS         = 7;
const LOAN_LATE_DAYS           = 14;
const LOAN_SEPARATION_DUE_DAYS = 30;

// Loans created for this user in the last 12 months (voided ones don't
// count). Admin-only information — never return it to an employee.
function loanCountLast12Months(PDO $pdo, int $userId): int {
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM employee_loans
         WHERE user_id = ? AND status <> 'void' AND created_at >= (NOW() - INTERVAL 12 MONTH)"
    );
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn();
}

// Earliest allowed first-installment week: the first Monday at least
// LOAN_NOTICE_DAYS after $from (the day the borrower signs).
function earliestFirstDueDate(?DateTimeImmutable $from = null): string {
    $d = ($from ?? new DateTimeImmutable('today'))->setTime(0, 0)->modify('+' . LOAN_NOTICE_DAYS . ' days');
    if ($d->format('N') !== '1') $d = $d->modify('next monday');
    return $d->format('Y-m-d');
}

function isMonday(string $ymd): bool {
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $ymd);
    return $d && $d->format('Y-m-d') === $ymd && $d->format('N') === '1';
}

function loanNoteNumber(int $loanId): string {
    return 'L-' . str_pad((string)$loanId, 4, '0', STR_PAD_LEFT);
}

function clientIp(): ?string {
    // Behind a proxy, X-Forwarded-For can be "client, proxy1, proxy2" —
    // keep just the originating client (same as api/agreements/sign.php).
    $raw = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
    $ip  = trim(explode(',', $raw)[0]);
    return $ip !== '' ? substr($ip, 0, 45) : null;
}

// Render both languages for a loan's terms and store a new unsigned note.
// $kind: 'original' | 'amendment' | 'repaper'. For amendment/repaper,
// $principal is the balance being restated.
function createLoanNote(PDO $pdo, int $loanId, string $kind, float $principal, float $weekly, string $firstDue, int $createdBy): int {
    $loan = $pdo->prepare(
        "SELECT l.id, l.amount, l.created_at, u.name, u.pay_type, u.preferred_language
         FROM employee_loans l JOIN users u ON u.id = l.user_id WHERE l.id = ?"
    );
    $loan->execute([$loanId]);
    $l = $loan->fetch();

    $terms = [
        'note_number'     => loanNoteNumber($loanId),
        'note_date'       => date('Y-m-d'),
        'kind'            => $kind,
        'borrower_name'   => $l['name'],
        'principal'       => $principal,
        'weekly'          => $weekly,
        'first_due_date'  => $firstDue,
        'variant'         => $l['pay_type'] === '1099' ? '1099' : 'w2',
        'original_date'   => substr($l['created_at'], 0, 10),
        'original_amount' => (float)$l['amount'],
    ];
    $en = renderLoanNote($terms, 'en');
    $es = renderLoanNote($terms, 'es');

    $pdo->prepare(
        'INSERT INTO loan_notes
           (loan_id, kind, variant, language, principal, weekly_amount, installments, first_due_date,
            note_text_en, note_text_es, note_hash, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $loanId, $kind, $terms['variant'], $l['preferred_language'] === 'es' ? 'es' : 'en',
        $principal, $weekly, count(buildLoanSchedule($principal, $weekly, $firstDue)), $firstDue,
        $en, $es, hash('sha256', $en . "\0" . $es), $createdBy,
    ]);
    return (int)$pdo->lastInsertId();
}

// An unsigned note whose first installment is now less than 7 days away
// can't be signed as-is — re-issue it (same terms, later first week)
// before the borrower sees it, so what they read is exactly what they sign.
// Returns the current note id (the old one if nothing changed).
function refreshStaleNote(PDO $pdo, array $note): int {
    if ($note['borrower_signed_at'] !== null) return (int)$note['id'];
    $earliest = earliestFirstDueDate();
    if ($note['first_due_date'] >= $earliest) return (int)$note['id'];

    // A restated balance (amendment/re-paper) may have gone down since the
    // note was issued, so restate whatever is owed now.
    $principal = $note['kind'] === 'original' ? (float)$note['principal'] : loanRemaining($pdo, (int)$note['loan_id']);
    $newId = createLoanNote(
        $pdo, (int)$note['loan_id'], $note['kind'], $principal,
        (float)$note['weekly_amount'], $earliest, (int)$note['created_by']
    );
    // Unsigned, never shown as signed — safe to replace outright.
    $pdo->prepare('DELETE FROM loan_notes WHERE id = ? AND borrower_signed_at IS NULL')->execute([$note['id']]);
    if ($note['kind'] === 'original') {
        $pdo->prepare('UPDATE employee_loans SET deduction_start_date = ? WHERE id = ?')
            ->execute([$earliest, $note['loan_id']]);
    }
    return $newId;
}

function loanRemaining(PDO $pdo, int $loanId): float {
    $stmt = $pdo->prepare(
        'SELECT GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0)
         FROM employee_loans l LEFT JOIN loan_payments lp ON lp.loan_id = l.id
         WHERE l.id = ? GROUP BY l.id'
    );
    $stmt->execute([$loanId]);
    return round((float)$stmt->fetchColumn(), 2);
}

function jsonError(int $code, string $message, array $extra = []): never {
    http_response_code($code);
    exit(json_encode(['error' => $message] + $extra));
}
