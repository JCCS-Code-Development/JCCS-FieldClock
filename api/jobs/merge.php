<?php
// Admin-facing: fold a pending-review location (created when an employee
// typed a free-text location at clock-in) into an existing, real job — for
// when it turns out to be the same place, just entered a second time under
// a different name. Every time entry and estimate logged against the
// pending placeholder moves to the real job, and the placeholder is
// removed, so it never lingers as a duplicate to pick from later.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$body = jsonBody(); requireFields($body, ['pending_job_id', 'target_job_id']);

$pendingId = (int)$body['pending_job_id'];
$targetId  = (int)$body['target_job_id'];
$pdo = getPDO();

if ($pendingId === $targetId) {
    http_response_code(422);
    exit(json_encode(['error' => 'Cannot merge a location into itself']));
}

$pending = $pdo->prepare('SELECT id, status FROM jobs WHERE id = ?');
$pending->execute([$pendingId]);
$pendingRow = $pending->fetch();
if (!$pendingRow) { http_response_code(404); exit(json_encode(['error' => 'Pending location not found'])); }
if ($pendingRow['status'] !== 'pending_review') {
    http_response_code(422);
    exit(json_encode(['error' => 'Only a location awaiting review can be merged into another']));
}

$target = $pdo->prepare('SELECT id, status FROM jobs WHERE id = ?');
$target->execute([$targetId]);
$targetRow = $target->fetch();
if (!$targetRow) { http_response_code(404); exit(json_encode(['error' => 'Target location not found'])); }
if ($targetRow['status'] === 'pending_review') {
    http_response_code(422);
    exit(json_encode(['error' => 'Cannot merge into another location that is itself awaiting review']));
}

$pdo->beginTransaction();
try {
    // Move history so it reads against the real, ongoing job going forward.
    $pdo->prepare('UPDATE time_entries SET job_id = ? WHERE job_id = ?')->execute([$targetId, $pendingId]);
    $pdo->prepare('UPDATE job_estimates SET job_id = ? WHERE job_id = ?')->execute([$targetId, $pendingId]);

    // Carry over anyone assigned to the pending placeholder before it's
    // gone; INSERT IGNORE dedupes against whoever's already on the target.
    $pdo->prepare(
        'INSERT IGNORE INTO job_assignments (job_id, user_id) SELECT ?, user_id FROM job_assignments WHERE job_id = ?'
    )->execute([$targetId, $pendingId]);

    $pdo->prepare('DELETE FROM jobs WHERE id = ?')->execute([$pendingId]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

echo json_encode(['message' => 'Merged', 'job_id' => $targetId]);
