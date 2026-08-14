<?php
// Returns the pay_rate/pay_structure that was actually in effect at the start
// of a given pay period, per salary_history — NOT necessarily today's live
// users.pay_rate, which may already reflect a rate scheduled for a future
// period (rate changes take effect at the start of their logged
// effective_date, see api/employees/item.php and api/salary-history/index.php).
//
// Pay periods here are always a single Mon–Sun week (or requested as one by
// callers), so one lookup per user per period is enough — this does not
// split a rate change that happens to land inside a multi-week range.
function payRateForPeriod(PDO $pdo, int $userId, string $periodStart, ?float $fallbackRate, ?string $fallbackStructure): array {
    static $stmt = null;
    if ($stmt === null) {
        $stmt = $pdo->prepare(
            'SELECT pay_rate, pay_structure FROM salary_history
             WHERE user_id = ? AND effective_date <= ?
             ORDER BY effective_date DESC, id DESC LIMIT 1'
        );
    }
    $stmt->execute([$userId, $periodStart]);
    $row = $stmt->fetch();
    if ($row) {
        return ['pay_rate' => (float)$row['pay_rate'], 'pay_structure' => $row['pay_structure']];
    }
    // No history row applies yet (e.g. effective_date in the future for
    // every entry, or a user somehow missing the backfill) — fall back to
    // whatever's on the user record so payroll never silently zeroes out.
    return ['pay_rate' => (float)($fallbackRate ?? 0), 'pay_structure' => $fallbackStructure ?? 'hourly'];
}
