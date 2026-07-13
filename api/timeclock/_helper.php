<?php
// Block salaried employees from all timeclock actions
function requireHourly(array $auth, PDO $pdo): void {
    $stmt = $pdo->prepare('SELECT pay_structure FROM users WHERE id = ?');
    $stmt->execute([$auth['user_id']]);
    $user = $stmt->fetch();
    if ($user && ($user['pay_structure'] ?? 'hourly') === 'salary') {
        http_response_code(403);
        echo json_encode(['error' => 'Salaried employees do not use the timeclock']);
        exit;
    }
}

// Close the current open entry and return its id (or null if none)
function closeOpenEntry(PDO $pdo, int $userId, ?float $lat, ?float $lng): ?int {
    $stmt = $pdo->prepare('SELECT id FROM time_entries WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1');
    $stmt->execute([$userId]);
    $open = $stmt->fetch();
    if (!$open) return null;
    $pdo->prepare('UPDATE time_entries SET end_time = NOW(), end_lat = ?, end_lng = ? WHERE id = ?')
        ->execute([$lat, $lng, $open['id']]);
    return $open['id'];
}

// Validate an optional visit_type/estimate_id pair. Exits with 422 on invalid input.
function validateVisitType(PDO $pdo, ?string $visitType, ?int $estimateId, ?int $jobId): void {
    if ($visitType === null) return;
    $allowed = ['estimate', 'emergency', 'new_work_order', 'warranty', 'other'];
    if (!in_array($visitType, $allowed)) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid visit_type']);
        exit;
    }
    if ($visitType === 'estimate') {
        if (!$estimateId) {
            http_response_code(422);
            echo json_encode(['error' => 'estimate_id is required when visit_type is estimate']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT id FROM job_estimates WHERE id = ? AND job_id = ? AND is_active = 1');
        $stmt->execute([$estimateId, $jobId]);
        if (!$stmt->fetch()) {
            http_response_code(422);
            echo json_encode(['error' => 'Estimate not found for this job']);
            exit;
        }
    }
}

// Open a new entry and return full timeclock status payload
function openEntry(PDO $pdo, int $userId, ?int $jobId, string $statusLabel, string $costCategory, ?float $lat, ?float $lng, ?float $accuracy, ?bool $withinRadius = null, ?string $notes = null, ?string $visitType = null, ?int $estimateId = null): array {
    $stmt = $pdo->prepare(
        'INSERT INTO time_entries (user_id, job_id, visit_type, estimate_id, status_label, cost_category, start_time, start_lat, start_lng, gps_accuracy, within_radius, approval_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $jobId, $visitType, $estimateId, $statusLabel, $costCategory, $lat, $lng, $accuracy, $withinRadius, 'approved', $notes]);
    $newId = $pdo->lastInsertId();

    $entry = $pdo->prepare('SELECT * FROM time_entries WHERE id = ?');
    $entry->execute([$newId]);
    $entry = $entry->fetch();

    $activeJob = null;
    if ($jobId) {
        $j = $pdo->prepare('SELECT id, name, client_name, address, clock_in_radius_meters FROM jobs WHERE id = ?');
        $j->execute([$jobId]);
        $activeJob = $j->fetch() ?: null;
    }

    return [
        'statusLabel'  => $statusLabel,
        'dayStarted'   => true,
        'currentEntry' => $entry,
        'activeJob'    => $activeJob,
    ];
}
