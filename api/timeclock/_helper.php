<?php
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

// Open a new entry and return full timeclock status payload
function openEntry(PDO $pdo, int $userId, ?int $jobId, string $statusLabel, string $costCategory, ?float $lat, ?float $lng, ?float $accuracy, ?bool $withinRadius = null, ?string $notes = null): array {
    $stmt = $pdo->prepare(
        'INSERT INTO time_entries (user_id, job_id, status_label, cost_category, start_time, start_lat, start_lng, gps_accuracy, within_radius, approval_status, notes)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $jobId, $statusLabel, $costCategory, $lat, $lng, $accuracy, $withinRadius, 'approved', $notes]);
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
