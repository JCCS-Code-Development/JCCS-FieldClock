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
require_once __DIR__ . '/_helper.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();

$COST_MAP = [
    'traveling'    => 'travel',
    'working'      => 'direct_labor',
    'lunch'        => 'paid_lunch',
    'material_run' => 'material_pickup',
    'waiting'      => 'waiting_time',
    'done'         => 'day_end',
];

function fetchEntry(PDO $pdo, int $id): array|false {
    $s = $pdo->prepare(
        'SELECT te.*, u.name AS user_name, j.name AS job_name, je.estimate_number
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
         LEFT JOIN jobs j ON j.id = te.job_id
         LEFT JOIN job_estimates je ON je.id = te.estimate_id
         WHERE te.id = ?'
    );
    $s->execute([$id]);
    return $s->fetch();
}

function fetchJobCoords(PDO $pdo, int $jobId): array|false {
    $s = $pdo->prepare('SELECT latitude, longitude, address FROM jobs WHERE id = ? LIMIT 1');
    $s->execute([$jobId]);
    return $s->fetch();
}

// ── POST: create entry ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();

    if (empty($body['user_id']) || empty($body['start_time']) || empty($body['status_label'])) {
        http_response_code(422);
        exit(json_encode(['error' => 'user_id, start_time and status_label are required']));
    }

    $userId      = (int)$body['user_id'];
    $statusLabel = sanitizeString($body['status_label']);
    $costCat     = $COST_MAP[$statusLabel] ?? 'direct_labor';
    $startTime   = $body['start_time'];
    $endTime     = !empty($body['end_time']) ? $body['end_time'] : null;
    $jobId            = !empty($body['job_id'])   ? (int)$body['job_id'] : null;
    $notes            = !empty($body['notes'])    ? sanitizeString($body['notes']) : null;
    $visitCategory    = !empty($body['visit_category'])    ? trim((string)$body['visit_category'])    : null;
    $estimateId       = !empty($body['estimate_id'])       ? (int)$body['estimate_id']                : null;
    $estimateSubtype  = !empty($body['estimate_subtype'])  ? trim((string)$body['estimate_subtype'])  : null;
    $workOrderNumber  = !empty($body['work_order_number']) ? trim((string)$body['work_order_number']) : null;
    $engineerName     = !empty($body['engineer_name'])     ? trim((string)$body['engineer_name'])     : null;
    $visitDescription = !empty($body['visit_description']) ? trim((string)$body['visit_description']) : null;

    validateVisitCategory($pdo, $visitCategory, $estimateId, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription, $jobId);

    // Check for overlapping entries for this user (day_end markers are zero-duration
    // clock-out stamps that are never given an end_time, so they must be excluded here
    // or they'd falsely "overlap" with everything for that employee forever)
    if ($endTime) {
        $overlap = $pdo->prepare(
            'SELECT id FROM time_entries
             WHERE user_id = ?
               AND cost_category != \'day_end\'
               AND start_time < ?
               AND (end_time IS NULL OR end_time > ?)
             LIMIT 1'
        );
        $overlap->execute([$userId, $endTime, $startTime]);
        if ($overlap->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => 'This entry overlaps with an existing entry for this employee. Please check the times.']));
        }
    }

    // Pull job coordinates so the location reflects the job site
    $startLat = $startLng = $endLat = $endLng = null;
    if ($jobId) {
        $job = fetchJobCoords($pdo, $jobId);
        if ($job && $job['latitude'] && $job['longitude']) {
            $startLat = $job['latitude'];
            $startLng = $job['longitude'];
            if ($endTime) {
                $endLat = $job['latitude'];
                $endLng = $job['longitude'];
            }
        }
    }

    $pdo->prepare(
        'INSERT INTO time_entries
            (user_id, job_id, estimate_id, visit_category, estimate_subtype, work_order_number, engineer_name, visit_description,
             status_label, cost_category, start_time, end_time, start_lat, start_lng, end_lat, end_lng, approval_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'approved\', ?)'
    )->execute([$userId, $jobId, $estimateId, $visitCategory, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription,
                $statusLabel, $costCat, $startTime, $endTime, $startLat, $startLng, $endLat, $endLng, $notes]);

    echo json_encode(['entry' => fetchEntry($pdo, (int)$pdo->lastInsertId())]);
    exit;
}

// ── PUT: update entry ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $id   = (int)($body['id'] ?? 0);

    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id is required'])); }

    $fields = [];
    $params = [];

    if (isset($body['start_time'])) {
        $fields[] = 'start_time = ?'; $params[] = $body['start_time'];
    }
    if (array_key_exists('end_time', $body)) {
        $fields[] = 'end_time = ?'; $params[] = !empty($body['end_time']) ? $body['end_time'] : null;
    }
    if (isset($body['status_label'])) {
        $fields[] = 'status_label = ?'; $params[] = $body['status_label'];
        $fields[] = 'cost_category = ?'; $params[] = $COST_MAP[$body['status_label']] ?? 'direct_labor';
    }
    if (array_key_exists('job_id', $body)) {
        $newJobId = !empty($body['job_id']) ? (int)$body['job_id'] : null;
        $fields[] = 'job_id = ?'; $params[] = $newJobId;

        // Update coordinates to match the selected job
        if ($newJobId) {
            $job = fetchJobCoords($pdo, $newJobId);
            if ($job && $job['latitude'] && $job['longitude']) {
                $fields[] = 'start_lat = ?'; $params[] = $job['latitude'];
                $fields[] = 'start_lng = ?'; $params[] = $job['longitude'];
                $fields[] = 'end_lat = ?';   $params[] = $job['latitude'];
                $fields[] = 'end_lng = ?';   $params[] = $job['longitude'];
            }
        } else {
            // Job cleared — clear coordinates too
            $fields[] = 'start_lat = ?'; $params[] = null;
            $fields[] = 'start_lng = ?'; $params[] = null;
            $fields[] = 'end_lat = ?';   $params[] = null;
            $fields[] = 'end_lng = ?';   $params[] = null;
        }
    }
    if (array_key_exists('notes', $body)) {
        $fields[] = 'notes = ?'; $params[] = !empty($body['notes']) ? sanitizeString($body['notes']) : null;
    }
    if (array_key_exists('visit_category', $body)) {
        $newVisitCategory    = !empty($body['visit_category'])    ? trim((string)$body['visit_category'])    : null;
        $newEstimateId       = !empty($body['estimate_id'])       ? (int)$body['estimate_id']                : null;
        $newEstimateSubtype  = !empty($body['estimate_subtype'])  ? trim((string)$body['estimate_subtype'])  : null;
        $newWorkOrderNumber  = !empty($body['work_order_number']) ? trim((string)$body['work_order_number']) : null;
        $newEngineerName     = !empty($body['engineer_name'])     ? trim((string)$body['engineer_name'])     : null;
        $newVisitDescription = !empty($body['visit_description']) ? trim((string)$body['visit_description']) : null;

        if (array_key_exists('job_id', $body) && !empty($body['job_id'])) {
            $jobForValidation = (int)$body['job_id'];
        } else {
            $curJob = $pdo->prepare('SELECT job_id FROM time_entries WHERE id = ?');
            $curJob->execute([$id]);
            $jobForValidation = (int)($curJob->fetch()['job_id'] ?? 0);
        }
        validateVisitCategory($pdo, $newVisitCategory, $newEstimateId, $newEstimateSubtype, $newWorkOrderNumber, $newEngineerName, $newVisitDescription, $jobForValidation);

        $fields[] = 'visit_category = ?';    $params[] = $newVisitCategory;
        $fields[] = 'estimate_id = ?';       $params[] = $newEstimateId;
        $fields[] = 'estimate_subtype = ?';  $params[] = $newEstimateSubtype;
        $fields[] = 'work_order_number = ?'; $params[] = $newWorkOrderNumber;
        $fields[] = 'engineer_name = ?';     $params[] = $newEngineerName;
        $fields[] = 'visit_description = ?'; $params[] = $newVisitDescription;
    }

    if (empty($fields)) { http_response_code(422); exit(json_encode(['error' => 'No fields to update'])); }

    // Check for overlaps if times are being changed
    $newStart = $body['start_time'] ?? null;
    $newEnd   = array_key_exists('end_time', $body) ? ($body['end_time'] ?: null) : null;
    if ($newStart || $newEnd) {
        // Get current entry to fill in whichever value isn't being changed
        $cur = $pdo->prepare('SELECT user_id, start_time, end_time FROM time_entries WHERE id = ?');
        $cur->execute([$id]);
        $cur = $cur->fetch();
        $checkStart = $newStart ?? $cur['start_time'];
        $checkEnd   = $newEnd   ?? $cur['end_time'];
        if ($checkEnd) {
            $overlap = $pdo->prepare(
                'SELECT id FROM time_entries
                 WHERE user_id = ? AND id != ?
                   AND cost_category != \'day_end\'
                   AND start_time < ?
                   AND (end_time IS NULL OR end_time > ?)
                 LIMIT 1'
            );
            $overlap->execute([$cur['user_id'], $id, $checkEnd, $checkStart]);
            if ($overlap->fetch()) {
                http_response_code(422);
                exit(json_encode(['error' => 'These times overlap with another entry for this employee.']));
            }
        }
    }

    $params[] = $id;
    $pdo->prepare('UPDATE time_entries SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    echo json_encode(['entry' => fetchEntry($pdo, $id)]);
    exit;
}

// ── DELETE: remove entry ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id is required'])); }

    $pdo->prepare('DELETE FROM time_entries WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
exit;
