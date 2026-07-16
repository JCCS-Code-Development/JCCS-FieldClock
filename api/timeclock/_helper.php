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

// Record a create/update/delete against time_entries — who/what did it, and
// (for update/delete) the values that were there before. This is the only
// way to ever answer "why does this entry look different than I expect" —
// there is no other history kept anywhere.
function logTimeEntryHistory(
    PDO $pdo, int $entryId, string $action, ?int $changedBy, string $source,
    ?array $oldValues, ?array $newValues
): void {
    $pdo->prepare(
        'INSERT INTO time_entry_history (entry_id, action, changed_by, source, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        $entryId, $action, $changedBy, $source,
        $oldValues !== null ? json_encode($oldValues) : null,
        $newValues !== null ? json_encode($newValues) : null,
    ]);
}

// Close the current open entry and return its id (or null if none)
function closeOpenEntry(PDO $pdo, int $userId, ?float $lat, ?float $lng, string $source = 'self_service'): ?int {
    $stmt = $pdo->prepare('SELECT * FROM time_entries WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1');
    $stmt->execute([$userId]);
    $open = $stmt->fetch();
    if (!$open) return null;
    $pdo->prepare('UPDATE time_entries SET end_time = NOW(), end_lat = ?, end_lng = ?, last_edited_by = ?, last_edited_at = NOW() WHERE id = ?')
        ->execute([$lat, $lng, $userId, $open['id']]);

    $new = $pdo->prepare('SELECT * FROM time_entries WHERE id = ?');
    $new->execute([$open['id']]);
    logTimeEntryHistory($pdo, (int)$open['id'], 'update', $userId, $source, $open, $new->fetch());

    return $open['id'];
}

// Validate an optional visit_category and its required companion fields.
// Exits with 422 on invalid input. $jobId is the job this visit is against
// (an existing active job, or a pending_review location the caller registered).
function validateVisitCategory(
    PDO $pdo,
    ?string $category,
    ?int $estimateId,
    ?string $estimateSubtype,
    ?string $workOrderNumber,
    ?string $engineerName,
    ?string $visitDescription,
    ?int $jobId
): void {
    if ($category === null) return; // recurring-maintenance / no classification needed

    $allowed = ['work_order', 'estimate', 'regular', 'estimate_unknown', 'add_on', 'emergency', 'warranty'];
    if (!in_array($category, $allowed)) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid visit_category']);
        exit;
    }

    $fail = function (string $msg) {
        http_response_code(422);
        echo json_encode(['error' => $msg]);
        exit;
    };

    if ($category === 'work_order') {
        if (!$jobId) $fail('Work Order requires an existing job location');
        if (!$workOrderNumber) $fail('Work order number is required');
    } elseif ($category === 'estimate') {
        if (!$jobId) $fail('Estimate requires an existing job location');
        if (!$estimateId) $fail('estimate_id is required when visit_category is estimate');
        $subtypes = ['regular', 'add_on', 'emergency', 'warranty'];
        if (!$estimateSubtype || !in_array($estimateSubtype, $subtypes)) $fail('A valid estimate_subtype is required');
        $stmt = $pdo->prepare('SELECT id FROM job_estimates WHERE id = ? AND job_id = ? AND is_active = 1');
        $stmt->execute([$estimateId, $jobId]);
        if (!$stmt->fetch()) $fail('Estimate not found for this job');
    } elseif ($category === 'add_on') {
        if (!$engineerName)     $fail('Engineer name is required');
        if (!$visitDescription) $fail('Original estimate description is required');
    } else { // regular, estimate_unknown, emergency, warranty (new-location path)
        if (!$engineerName)     $fail('Engineer name is required');
        if (!$visitDescription) $fail('Description is required');
    }
}

// Open a new entry and return full timeclock status payload
function openEntry(
    PDO $pdo, int $userId, ?int $jobId, string $statusLabel, string $costCategory,
    ?float $lat, ?float $lng, ?float $accuracy, ?bool $withinRadius = null, ?string $notes = null,
    ?string $visitCategory = null, ?int $estimateId = null, ?string $estimateSubtype = null,
    ?string $workOrderNumber = null, ?string $engineerName = null, ?string $visitDescription = null,
    string $source = 'self_service'
): array {
    $stmt = $pdo->prepare(
        'INSERT INTO time_entries
            (user_id, created_by, created_via, job_id, estimate_id, visit_category, estimate_subtype, work_order_number, engineer_name, visit_description,
             status_label, cost_category, start_time, start_lat, start_lng, gps_accuracy, within_radius, approval_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $userId, $userId, $source, $jobId, $estimateId, $visitCategory, $estimateSubtype, $workOrderNumber, $engineerName, $visitDescription,
        $statusLabel, $costCategory, $lat, $lng, $accuracy, $withinRadius, 'approved', $notes,
    ]);
    $newId = $pdo->lastInsertId();

    $entry = $pdo->prepare('SELECT * FROM time_entries WHERE id = ?');
    $entry->execute([$newId]);
    $entry = $entry->fetch();

    logTimeEntryHistory($pdo, (int)$newId, 'create', $userId, $source, null, $entry);

    $activeJob = null;
    if ($jobId) {
        $j = $pdo->prepare('SELECT id, name, client_name, address, clock_in_radius_meters, status, is_recurring_maintenance FROM jobs WHERE id = ?');
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
