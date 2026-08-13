<?php
// One-off correction for the bug fixed in PrintChecks.jsx (commit 057018a):
// check_registry.amount for 1099 pay-type employees was saved as gross
// estimated_total, with no loan deduction subtracted — while the physical
// check that was actually printed and handed out paid netPay, i.e.
// estimated_total MINUS that period's loan deduction. This script finds
// every historical check_registry row affected by that mismatch and
// corrects `amount` (and the linked paychecks row, if any) to match what
// the check actually paid.
//
// W-2 base checks and gas/bonus flat-rate checks are untouched — loan
// deductions were never applied to those, so they were never affected.
//
// Usage (run on the server, where api/config/config.php has real DB creds):
//   Dry run (default, no writes):
//     php api/migrations/fix_check_registry_net_loan_amounts.php
//   Apply the corrections:
//     php api/migrations/fix_check_registry_net_loan_amounts.php --apply
//
// Safe to run more than once: a row this script has already corrected gets
// a "[net-pay correction ...]" marker appended to check_registry.notes and
// is skipped on later runs (so it can never be double-corrected).

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('This script must be run from the command line.');
}

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';

$apply = array_key_exists('apply', getopt('', ['apply']));
$marker = '[net-pay correction';

try {
    $pdo = getPDO();

    // Candidates: check_registry rows for 1099 pay-type employees, not yet
    // touched by this script.
    $rows = $pdo->query(
        "SELECT cr.id, cr.check_number, cr.payee_name, cr.user_id, cr.amount,
                cr.status, cr.pay_period_start, cr.pay_period_end, cr.notes
         FROM check_registry cr
         JOIN users u ON u.id = cr.user_id
         WHERE u.pay_type = '1099'
           AND (cr.notes IS NULL OR cr.notes NOT LIKE " . $pdo->quote('%' . $marker . '%') . ")
         ORDER BY cr.issued_date, cr.check_number"
    )->fetchAll();

    $findDeduction = $pdo->prepare(
        'SELECT COALESCE(SUM(lp.amount), 0) AS ded
         FROM loan_payments lp
         JOIN employee_loans l ON l.id = lp.loan_id
         WHERE l.user_id = ? AND lp.period_start <= ? AND lp.period_end >= ?'
    );

    $corrections = [];
    foreach ($rows as $r) {
        $findDeduction->execute([$r['user_id'], $r['pay_period_end'], $r['pay_period_start']]);
        $ded = (float)$findDeduction->fetch()['ded'];
        if ($ded <= 0) continue;

        $old = (float)$r['amount'];
        $new = max($old - $ded, 0);
        if (abs($new - $old) < 0.005) continue;

        $corrections[] = $r + ['deduction' => $ded, 'old_amount' => $old, 'new_amount' => $new];
    }

    if (!$corrections) {
        echo "No check_registry rows need correction.\n";
        exit(0);
    }

    printf("%-8s %-10s %-22s %-12s %10s %10s %10s\n",
        'ID', 'Check #', 'Payee', 'Status', 'Old', 'Loan Ded', 'New');
    $totalDelta = 0.0;
    foreach ($corrections as $c) {
        printf("%-8d %-10s %-22s %-12s %10s %10s %10s\n",
            $c['id'], $c['check_number'], substr($c['payee_name'], 0, 22), $c['status'],
            number_format($c['old_amount'], 2), number_format($c['deduction'], 2), number_format($c['new_amount'], 2));
        $totalDelta += $c['old_amount'] - $c['new_amount'];
    }
    printf("\n%d row(s), total reduction $%s\n", count($corrections), number_format($totalDelta, 2));

    if (!$apply) {
        echo "\nDry run only — no changes written. Re-run with --apply to write these corrections.\n";
        exit(0);
    }

    $updateCheck = $pdo->prepare(
        'UPDATE check_registry
         SET amount = ?, notes = CONCAT(COALESCE(notes, \'\'), IF(COALESCE(notes, \'\') = \'\', \'\', \'\n\'), ?)
         WHERE id = ?'
    );
    $updatePaycheck = $pdo->prepare('UPDATE paychecks SET amount = ? WHERE check_registry_id = ?');

    $pdo->beginTransaction();
    try {
        foreach ($corrections as $c) {
            $note = sprintf(
                '%s applied %s: gross $%s -> net $%s (loan deduction $%s for %s .. %s)]',
                $marker, date('Y-m-d'), number_format($c['old_amount'], 2), number_format($c['new_amount'], 2),
                number_format($c['deduction'], 2), $c['pay_period_start'], $c['pay_period_end']
            );
            $updateCheck->execute([$c['new_amount'], $note, $c['id']]);
            $updatePaycheck->execute([$c['new_amount'], $c['id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    echo "\nApplied. " . count($corrections) . " check_registry row(s) updated (and their linked paychecks row, if any).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}
