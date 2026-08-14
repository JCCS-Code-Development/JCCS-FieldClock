<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $jobId          = isset($_GET['job_id']) ? (int)$_GET['job_id'] : 0;
    $estimateNumber = isset($_GET['estimate_number']) ? trim($_GET['estimate_number']) : '';

    if (!$jobId && $estimateNumber === '') {
        http_response_code(422);
        exit(json_encode(['error' => 'job_id or estimate_number is required']));
    }

    if ($estimateNumber !== '') {
        // Free-typed estimate # lookup (contractor invoice entry) — exact
        // match, case-insensitive, across any job. Not scoped to a job_id
        // since the whole point is finding which job it belongs to.
        $stmt = $pdo->prepare(
            'SELECT je.id, je.job_id, je.estimate_number, je.description, je.is_active, je.created_at,
                    j.name AS job_name
             FROM job_estimates je
             JOIN jobs j ON j.id = je.job_id
             WHERE LOWER(je.estimate_number) = LOWER(?) AND je.is_active = 1
             ORDER BY je.created_at DESC
             LIMIT 1'
        );
        $stmt->execute([$estimateNumber]);
        $match = $stmt->fetch();
        echo json_encode(['estimate' => $match ?: null]);
        exit;
    }

    $active = isset($_GET['active']) ? (int)$_GET['active'] : 1;
    $stmt   = $pdo->prepare(
        'SELECT id, job_id, estimate_number, description, is_active, created_at
         FROM job_estimates
         WHERE job_id = ? AND is_active = ?
         ORDER BY estimate_number'
    );
    $stmt->execute([$jobId, $active]);
    echo json_encode(['estimates' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['job_id', 'estimate_number']);

    $jobId = (int)$body['job_id'];
    $job   = $pdo->prepare('SELECT id FROM jobs WHERE id = ? LIMIT 1');
    $job->execute([$jobId]);
    if (!$job->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Job not found'])); }

    $pdo->prepare(
        'INSERT INTO job_estimates (job_id, estimate_number, description, created_by)
         VALUES (?, ?, ?, ?)'
    )->execute([
        $jobId,
        sanitizeString($body['estimate_number']),
        !empty($body['description']) ? sanitizeString($body['description']) : null,
        $auth['user_id'],
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Estimate created']);

} else {
    http_response_code(405);
}
