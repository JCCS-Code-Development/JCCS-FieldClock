<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth  = requireAuth();
$pdo   = getPDO();
$id    = isset($_GET['id']) ? (int)$_GET['id'] : (int)(jsonBody()['id'] ?? 0);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
    $stmt->execute([$id]);
    $job = $stmt->fetch();
    if (!$job) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    echo json_encode($job);

} elseif ($method === 'PUT') {
    requireAdmin($auth);
    $body = jsonBody();
    $pdo->prepare(
        'UPDATE jobs SET name=?, client_name=?, company=?, address=?, latitude=?, longitude=?, clock_in_radius_meters=?, status=?, notes=?, is_recurring_maintenance=?, updated_at=NOW() WHERE id=?'
    )->execute([
        sanitizeString($body['name'] ?? ''),
        sanitizeString($body['client_name'] ?? ''),
        !empty($body['company']) ? sanitizeString($body['company']) : null,
        sanitizeString($body['address'] ?? ''),
        $body['latitude']  ?? null,
        $body['longitude'] ?? null,
        (int)($body['clock_in_radius_meters'] ?? 300),
        sanitizeString($body['status'] ?? 'active'),
        sanitizeString($body['notes']  ?? ''),
        !empty($body['is_recurring_maintenance']) ? 1 : 0,
        $id,
    ]);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    requireAdmin($auth);

    // ?permanent=1 actually removes the row, instead of the normal soft
    // delete below. Only ever offered for a job that's already cancelled and
    // has no time entries logged against it, so this can never silently erase
    // real payroll/timesheet history — a job with history should go through
    // merge.php instead, which folds its entries into a real job before the
    // placeholder is removed.
    if (isset($_GET['permanent']) && $_GET['permanent'] == '1') {
        $job = $pdo->prepare('SELECT status FROM jobs WHERE id = ?');
        $job->execute([$id]);
        $row = $job->fetch();
        if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
        if ($row['status'] !== 'cancelled') {
            http_response_code(422);
            exit(json_encode(['error' => 'Only a cancelled job can be permanently deleted — cancel it first.']));
        }

        $count = $pdo->prepare('SELECT COUNT(*) AS c FROM time_entries WHERE job_id = ?');
        $count->execute([$id]);
        if ((int)$count->fetch()['c'] > 0) {
            http_response_code(409);
            exit(json_encode(['error' => 'This job has time entries logged against it, so it can\'t be permanently deleted. Use Merge to fold its history into another job first.']));
        }

        try {
            $pdo->prepare('DELETE FROM jobs WHERE id = ?')->execute([$id]);
        } catch (PDOException $e) {
            http_response_code(409);
            exit(json_encode(['error' => 'This job still has related records (invoices, estimates, assignments) and can\'t be permanently deleted.']));
        }
        echo json_encode(['message' => 'Permanently deleted']);
        exit;
    }

    $pdo->prepare('UPDATE jobs SET status="cancelled" WHERE id=?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);
} else {
    http_response_code(405);
}
