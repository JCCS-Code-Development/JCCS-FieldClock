<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();

// ── GET: list a user's rate history, newest effective_date first ──────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $userId = (int)($_GET['user_id'] ?? 0);
    if ($userId <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Missing user_id']));
    }

    $stmt = $pdo->prepare(
        'SELECT sh.*, cb.name AS created_by_name
         FROM salary_history sh
         LEFT JOIN users cb ON cb.id = sh.created_by
         WHERE sh.user_id = ?
         ORDER BY sh.effective_date DESC, sh.id DESC'
    );
    $stmt->execute([$userId]);
    echo json_encode(['history' => $stmt->fetchAll()]);
    exit;
}

// ── POST: log a rate change (manual entry — any effective date) ───────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();
    requireFields($body, ['user_id', 'pay_rate', 'pay_structure', 'effective_date']);

    $userId = (int)$body['user_id'];
    $rate   = (float)$body['pay_rate'];
    $struct = $body['pay_structure'];
    $date   = sanitizeString($body['effective_date']);
    $note   = !empty($body['note']) ? sanitizeString($body['note']) : null;

    if ($rate <= 0) {
        http_response_code(422);
        exit(json_encode(['error' => 'Rate must be greater than 0']));
    }
    if (!in_array($struct, ['hourly', 'salary'], true)) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid pay structure']));
    }
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        http_response_code(422);
        exit(json_encode(['error' => 'Invalid effective_date']));
    }

    $check = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role IN ('admin','employee')");
    $check->execute([$userId]);
    if (!$check->fetch()) {
        http_response_code(404);
        exit(json_encode(['error' => 'Employee not found']));
    }

    $pdo->prepare(
        'INSERT INTO salary_history (user_id, pay_rate, pay_structure, effective_date, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$userId, $rate, $struct, $date, $note, $auth['user_id']]);
    $newId = (int)$pdo->lastInsertId();

    // An immediate or backdated entry (effective today or earlier) — and only
    // if it's now the most recently effective one on file — also becomes the
    // "latest known" rate shown on the employee record (Employees list, Edit
    // form defaults). A future-dated entry stays purely a scheduled log entry
    // until its date actually arrives; nothing promotes it automatically.
    $today = (new DateTimeImmutable('today', new DateTimeZone(FIELDCLOCK_TIMEZONE)))->format('Y-m-d');
    if ($date <= $today) {
        $latest = $pdo->prepare(
            'SELECT id FROM salary_history WHERE user_id = ? ORDER BY effective_date DESC, id DESC LIMIT 1'
        );
        $latest->execute([$userId]);
        if ((int)($latest->fetch()['id'] ?? 0) === $newId) {
            $pdo->prepare('UPDATE users SET pay_rate = ?, pay_structure = ? WHERE id = ?')
                ->execute([$rate, $struct, $userId]);
        }
    }

    echo json_encode(['id' => $newId]);
    exit;
}

http_response_code(405);
