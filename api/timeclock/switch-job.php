<?php
ini_set("display_errors", 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
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
require_once __DIR__ . '/_helper.php';

$auth = requireAuth();
$pdo  = getPDO();
requireHourly($auth, $pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); exit;
}

$body  = jsonBody();
$jobId = isset($body['job_id']) && $body['job_id'] !== '' && $body['job_id'] !== null
    ? (int)$body['job_id'] : null;

// Validate job assignment if a job_id was given
if ($jobId) {
    $assigned = $pdo->prepare(
        'SELECT 1 FROM job_assignments WHERE job_id = ? AND user_id = ?'
    );
    $assigned->execute([$jobId, $auth['user_id']]);
    if (!$assigned->fetch()) {
        // Allow admin-assigned jobs but also accept any active job for flexibility
        $exists = $pdo->prepare('SELECT 1 FROM jobs WHERE id = ? AND status = ?');
        $exists->execute([$jobId, 'active']);
        if (!$exists->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'Job not found or not active']));
        }
    }
}

beginTimeclockTransaction($pdo, (int)$auth['user_id']);
$open = getOpenWorkEntry($pdo, (int)$auth['user_id']);
if (!$open) {
    $pdo->rollBack();
    http_response_code(422);
    exit(json_encode(['error' => 'Not clocked in']));
}

if ((int)($open['job_id'] ?? 0) === (int)($jobId ?? 0)) {
    $result = timeclockResultFromEntry($pdo, $open);
    $pdo->commit();
    echo json_encode($result);
    exit;
}

closeOpenEntry($pdo, $auth['user_id'], null, null, source: 'switch_job');
$result = openEntry(
    $pdo,
    $auth['user_id'],
    $jobId,
    $open['status_label'],
    $open['cost_category'],
    null, null, null,
    source: 'switch_job'
);
$pdo->commit();

echo json_encode($result);
exit;
