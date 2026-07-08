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
        'SELECT te.*, u.name AS user_name, j.name AS job_name
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
         LEFT JOIN jobs j ON j.id = te.job_id
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
    $jobId       = !empty($body['job_id'])   ? (int)$body['job_id'] : null;
    $notes       = !empty($body['notes'])    ? sanitizeString($body['notes']) : null;

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
            (user_id, job_id, status_label, cost_category, start_time, end_time,
             start_lat, start_lng, end_lat, end_lng, approval_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'approved\', ?)'
    )->execute([$userId, $jobId, $statusLabel, $costCat, $startTime, $endTime,
                $startLat, $startLng, $endLat, $endLng, $notes]);

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

    if (empty($fields)) { http_response_code(422); exit(json_encode(['error' => 'No fields to update'])); }

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
