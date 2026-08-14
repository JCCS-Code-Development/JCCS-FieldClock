<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

function fetchLoan(PDO $pdo, int $id): array|false {
    $stmt = $pdo->prepare(
        'SELECT l.id, l.user_id, u.name AS user_name,
                l.amount, l.weekly_deduction, l.deduction_start_date,
                l.description, l.status, l.created_at,
                COALESCE(SUM(lp.amount), 0) AS paid_total,
                GREATEST(l.amount - COALESCE(SUM(lp.amount), 0), 0) AS remaining
         FROM employee_loans l
         JOIN users u ON u.id = l.user_id
         LEFT JOIN loan_payments lp ON lp.loan_id = l.id
         WHERE l.id = ?
         GROUP BY l.id'
    );
    $stmt->execute([$id]);
    return $stmt->fetch();
}

// ── GET: loan + payment history ──────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $loan = fetchLoan($pdo, $id);
    if (!$loan) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

    if ($auth['role'] !== 'admin' && $loan['user_id'] != $auth['user_id']) {
        http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
    }

    $pstmt = $pdo->prepare(
        'SELECT lp.id, lp.amount, lp.period_start, lp.period_end, lp.notes, lp.created_at,
                u.name AS recorded_by_name
         FROM loan_payments lp
         JOIN users u ON u.id = lp.created_by
         WHERE lp.loan_id = ?
         ORDER BY lp.created_at DESC'
    );
    $pstmt->execute([$id]);
    $loan['payments'] = $pstmt->fetchAll();

    echo json_encode(['loan' => $loan]);
    exit;
}

// ── PUT: update status and/or the deduction schedule (admin only) ─
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $sets = []; $params = [];

    if (array_key_exists('status', $body)) {
        $status = sanitizeString($body['status']);
        if (!in_array($status, ['active', 'paid_off'])) {
            http_response_code(422); exit(json_encode(['error' => 'Invalid status']));
        }
        $sets[] = 'status = ?'; $params[] = $status;
    }

    if (array_key_exists('weekly_deduction', $body)) {
        $weekly = (float)$body['weekly_deduction'];
        if ($weekly <= 0) {
            http_response_code(422); exit(json_encode(['error' => 'Weekly deduction amount must be greater than zero']));
        }
        $sets[] = 'weekly_deduction = ?'; $params[] = $weekly;
    }

    if (array_key_exists('deduction_start_date', $body)) {
        $startAt = sanitizeString($body['deduction_start_date']);
        $parsedStart = DateTimeImmutable::createFromFormat('!Y-m-d', $startAt);
        if (!$parsedStart || $parsedStart->format('Y-m-d') !== $startAt) {
            http_response_code(422); exit(json_encode(['error' => 'Invalid deduction start date']));
        }
        $sets[] = 'deduction_start_date = ?'; $params[] = $startAt;
    }

    if (!$sets) { http_response_code(422); exit(json_encode(['error' => 'Nothing to update'])); }

    $params[] = $id;
    $pdo->prepare('UPDATE employee_loans SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['loan' => fetchLoan($pdo, $id)]);
    exit;
}

// ── DELETE: remove loan (admin only, only if no payments yet) ────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin($auth);
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id required'])); }

    $count = $pdo->prepare('SELECT COUNT(*) FROM loan_payments WHERE loan_id = ?');
    $count->execute([$id]);
    if ((int)$count->fetchColumn() > 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Cannot delete a loan that has recorded payments']));
    }

    $pdo->prepare('DELETE FROM employee_loans WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
