<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list loans ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    // Optional: period_start + period_end → return per-user deduction summary for that period
    if (!empty($_GET['period_start']) && !empty($_GET['period_end']) && $auth['role'] === 'admin') {
        $ps = sanitizeString($_GET['period_start']);
        $pe = sanitizeString($_GET['period_end']);
        $stmt = $pdo->prepare(
            'SELECT lp.loan_id, l.user_id, COALESCE(SUM(lp.amount), 0) AS period_deduction
             FROM loan_payments lp
             JOIN employee_loans l ON l.id = lp.loan_id
             WHERE lp.period_start >= ? AND lp.period_end <= ?
             GROUP BY l.user_id'
        );
        $stmt->execute([$ps, $pe]);
        $rows = $stmt->fetchAll();
        // Aggregate by user_id
        $byUser = [];
        foreach ($rows as $r) {
            $uid = (int)$r['user_id'];
            $byUser[$uid] = ($byUser[$uid] ?? 0) + (float)$r['period_deduction'];
        }
        echo json_encode(['period_loan_deductions' => $byUser]);
        exit;
    }

    $sql = 'SELECT l.id, l.user_id, u.name AS user_name,
                   l.amount, l.description, l.status, l.created_at,
                   COALESCE(SUM(lp.amount), 0) AS paid_total,
                   GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining
            FROM employee_loans l
            JOIN users u ON u.id = l.user_id
            LEFT JOIN loan_payments lp ON lp.loan_id = l.id';

    if ($auth['role'] === 'admin') {
        $params = [];
        if (!empty($_GET['user_id'])) {
            $sql .= ' WHERE l.user_id = ?'; $params[] = (int)$_GET['user_id'];
        }
        if (!empty($_GET['status'])) {
            $sql .= empty($params) ? ' WHERE' : ' AND';
            $sql .= ' l.status = ?'; $params[] = sanitizeString($_GET['status']);
        }
    } else {
        $sql .= ' WHERE l.user_id = ?';
        $params = [$auth['user_id']];
    }

    $sql .= ' GROUP BY l.id ORDER BY l.created_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['loans' => $stmt->fetchAll()]);
    exit;
}

// ── POST: create loan (admin only) ───────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['user_id', 'amount']);

    $amount = (float)$body['amount'];
    if ($amount <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Amount must be greater than zero']));
    }

    $pdo->prepare(
        'INSERT INTO employee_loans (user_id, amount, description, created_by)
         VALUES (?, ?, ?, ?)'
    )->execute([
        (int)$body['user_id'],
        $amount,
        !empty($body['description']) ? sanitizeString($body['description']) : null,
        $auth['user_id'],
    ]);

    $id  = (int)$pdo->lastInsertId();
    $row = $pdo->prepare(
        'SELECT l.*, u.name AS user_name,
                0 AS paid_total, l.amount AS remaining
         FROM employee_loans l JOIN users u ON u.id = l.user_id WHERE l.id = ?'
    );
    $row->execute([$id]);
    echo json_encode(['loan' => $row->fetch()]);
    exit;
}

http_response_code(405);
exit;
