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

// Serialize every state-changing clock action for one employee. A phone can
// retry a request, a user can double-tap, and multiple API workers can handle
// those requests at the same time. Locking the durable users row makes the
// read/close/open sequence atomic across all PHP processes.
//
// Also self-heals an overlong paid meal break here (see enforceMealCutoff) —
// every timeclock mutation (day-start, day-end, switch-job, status, and the
// working/lunch/dinner/waiting/material-run transitions via
// transitionOpenWorkEntry) calls this first, so a lunch or dinner that ran
// past the 1-hour cap gets closed and the account locked the moment anyone
// next touches this user's timeclock state, with no cron job needed.
//
// day-start.php was previously patched (af7de38) with its own
// register_shutdown_function to guarantee a rollback on every exit path,
// after an unrolled-back transaction there once left a user's row FOR-UPDATE
// lock held, blocking their next clock-in until PHP's max_execution_time
// killed it (see project memory: FieldClock Timeclock Quirks). That guard
// only ever covered day-start.php — day-end, switch-job, status, and every
// working/lunch/waiting/material-run transition open the exact same kind of
// transaction here without one. Registering it centrally, once, closes that
// gap everywhere instead of requiring every caller to remember it — and
// matters more now that this function also runs enforceMealCutoff's writes
// on every call, including from status.php, which loads on nearly every
// screen. A second registration (day-start.php still has its own) is a safe
// no-op: whichever runs first rolls back, and $pdo->inTransaction() is false
// for the other.
function beginTimeclockTransaction(PDO $pdo, int $userId): void {
    $pdo->beginTransaction();
    register_shutdown_function(function () use ($pdo) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    });
    $lock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
    $lock->execute([$userId]);
    if (!$lock->fetch()) {
        $pdo->rollBack();
        throw new RuntimeException('User not found');
    }
    enforceMealCutoff($pdo, $userId);
}

// Lunch and Dinner are both paid, capped at this many minutes each.
const LUNCH_CAP_MINUTES = 60;

// Lunch only unlocks once this many minutes of actual work have happened
// today — see getWorkedMinutesToday().
const LUNCH_UNLOCK_MINUTES = 120; // 2 hours

// Dinner only unlocks once this many minutes of actual work (not counting
// any lunch/dinner already taken) have happened today — see
// getWorkedMinutesToday().
const DINNER_UNLOCK_MINUTES = 600; // 10 hours

// If this user has an open 'lunch' or 'dinner' entry that started more than
// LUNCH_CAP_MINUTES ago, close it at exactly the cap (so no more than the cap
// is ever paid), end the day the same way day-end.php does (a 'done' marker —
// so the employee reads as clocked out, not just off the break), and lock the
// account: day-start.php refuses a new clock-in until an admin clears the
// lock (see clear-lunch-lock.php). Must be called with the row lock already
// held (i.e. from inside beginTimeclockTransaction) so two requests can't
// race on the same overlong entry.
function enforceMealCutoff(PDO $pdo, int $userId): void {
    $stmt = $pdo->prepare(
        "SELECT * FROM time_entries
         WHERE user_id = ? AND end_time IS NULL AND status_label IN ('lunch', 'dinner')
           AND start_time <= (NOW() - INTERVAL " . LUNCH_CAP_MINUTES . " MINUTE)
         ORDER BY start_time DESC, id DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    $entry = $stmt->fetch();
    if (!$entry) return;

    $meal   = $entry['status_label']; // 'lunch' or 'dinner'
    $cutoff = date('Y-m-d H:i:s', strtotime($entry['start_time']) + LUNCH_CAP_MINUTES * 60);

    $pdo->prepare(
        "UPDATE time_entries
            SET end_time = ?, last_edited_at = NOW(),
                notes = TRIM(CONCAT(COALESCE(notes, ''), ' Auto-closed: $meal exceeded " . LUNCH_CAP_MINUTES . " minutes.'))
          WHERE id = ?"
    )->execute([$cutoff, $entry['id']]);
    $updated = $pdo->prepare('SELECT * FROM time_entries WHERE id = ?');
    $updated->execute([$entry['id']]);
    logTimeEntryHistory($pdo, (int)$entry['id'], 'update', null, 'meal_cutoff', $entry, $updated->fetch());

    openEntry($pdo, $userId, null, 'done', 'day_end', null, null, null, source: 'meal_cutoff');

    $pdo->prepare('UPDATE users SET lunch_locked_at = ?, lunch_locked_entry_id = ? WHERE id = ?')
        ->execute([$cutoff, $entry['id'], $userId]);
}

// Sum of actual worked minutes today — everything except a lunch/dinner
// break or a day_end marker — closed entries by their real duration, plus
// the currently open entry (if any) counted up to right now. Powers the
// "Dinner unlocks after 10 hours worked" rule in dinner.php; deliberately
// excludes lunch/dinner time itself, so taking a break doesn't help reach
// the threshold.
function getWorkedMinutesToday(PDO $pdo, int $userId): int {
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, start_time, COALESCE(end_time, NOW()))), 0) AS secs
         FROM time_entries
         WHERE user_id = ? AND DATE(start_time) = CURDATE()
           AND cost_category NOT IN ('paid_lunch', 'paid_dinner', 'day_end')"
    );
    $stmt->execute([$userId]);
    return (int) round(((int) $stmt->fetchColumn()) / 60);
}

// If this user is currently locked out after a lunch/dinner that ran over,
// commit (persisting whatever enforceMealCutoff just did) and exit with a
// friendly, actionable error naming which break it was. Otherwise return and
// leave the transaction open for the caller to continue. Call this wherever
// "no open entry" could mean "the meal cutoff just ended their day" rather
// than "they were never clocked in" — day-start (new clock-in), and every
// transition that requires an open entry (transitionOpenWorkEntry,
// switch-job.php) once it finds none.
function exitIfLunchLocked(PDO $pdo, int $userId): void {
    $stmt = $pdo->prepare(
        'SELECT u.lunch_locked_at, te.status_label
           FROM users u LEFT JOIN time_entries te ON te.id = u.lunch_locked_entry_id
          WHERE u.id = ?'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $lockedAt = $row['lunch_locked_at'] ?? null;
    if (!$lockedAt) return;

    $meal = $row['status_label'] === 'dinner' ? 'dinner' : 'lunch'; // default covers legacy locks predating dinner

    $pdo->commit();
    http_response_code(403);
    exit(json_encode([
        'error'           => "Your $meal went over 1 hour and you were automatically clocked out. Contact your administrator to clock back in.",
        'lunch_locked'    => true,
        'lunch_locked_at' => $lockedAt,
    ]));
}

function getOpenWorkEntry(PDO $pdo, int $userId): array|false {
    $stmt = $pdo->prepare(
        "SELECT * FROM time_entries
         WHERE user_id = ? AND end_time IS NULL AND cost_category != 'day_end'
         ORDER BY start_time DESC, id DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

function getTodayDayEndMarker(PDO $pdo, int $userId): array|false {
    $stmt = $pdo->prepare(
        "SELECT * FROM time_entries
         WHERE user_id = ? AND end_time IS NULL AND cost_category = 'day_end'
           AND DATE(start_time) = CURRENT_DATE
         ORDER BY start_time DESC, id DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

function timeclockResultFromEntry(PDO $pdo, array $entry): array {
    $activeJob = null;
    if (!empty($entry['job_id'])) {
        $j = $pdo->prepare(
            'SELECT id, name, client_name, address, clock_in_radius_meters, status, is_recurring_maintenance
             FROM jobs WHERE id = ?'
        );
        $j->execute([(int)$entry['job_id']]);
        $activeJob = $j->fetch() ?: null;
    }

    return [
        'statusLabel'  => $entry['status_label'],
        'dayStarted'   => true,
        'currentEntry' => $entry,
        'activeJob'    => $activeJob,
    ];
}

function transitionOpenWorkEntry(
    PDO $pdo,
    int $userId,
    string $statusLabel,
    string $costCategory,
    ?float $lat,
    ?float $lng,
    ?float $accuracy,
    string $source
): array {
    beginTimeclockTransaction($pdo, $userId);
    $open = getOpenWorkEntry($pdo, $userId);
    if (!$open) {
        exitIfLunchLocked($pdo, $userId);
        $pdo->rollBack();
        http_response_code(422);
        exit(json_encode(['error' => 'Not clocked in']));
    }

    // Treat retries/double taps as a successful no-op.
    if ($open['status_label'] === $statusLabel) {
        $result = timeclockResultFromEntry($pdo, $open);
        $pdo->commit();
        return $result;
    }

    closeOpenEntry($pdo, $userId, $lat, $lng, source: $source);
    $result = openEntry(
        $pdo,
        $userId,
        !empty($open['job_id']) ? (int)$open['job_id'] : null,
        $statusLabel,
        $costCategory,
        $lat,
        $lng,
        $accuracy,
        null,
        null,
        $open['visit_category'] ?? null,
        !empty($open['estimate_id']) ? (int)$open['estimate_id'] : null,
        $open['estimate_subtype'] ?? null,
        $open['work_order_number'] ?? null,
        $open['engineer_name'] ?? null,
        $open['visit_description'] ?? null,
        source: $source
    );
    $pdo->commit();
    return $result;
}

// Close the current open entry and return its id (or null if none). $notes,
// when given, is the employee's own clock-out note (e.g. from day-end.php) —
// left null for every other caller (switching activities mid-shift, etc.) so
// it never overwrites anything on those transitions.
function closeOpenEntry(PDO $pdo, int $userId, ?float $lat, ?float $lng, string $source = 'self_service', ?string $notes = null): ?int {
    // day_end rows are permanent status markers, not active paid work. Never
    // close one when transitioning or ending a later shift.
    $stmt = $pdo->prepare(
        "SELECT * FROM time_entries
         WHERE user_id = ? AND end_time IS NULL AND cost_category != 'day_end'
         ORDER BY start_time DESC, id DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    $open = $stmt->fetch();
    if (!$open) return null;
    if ($notes !== null && $notes !== '') {
        $pdo->prepare('UPDATE time_entries SET end_time = NOW(), end_lat = ?, end_lng = ?, notes = ?, last_edited_by = ?, last_edited_at = NOW() WHERE id = ?')
            ->execute([$lat, $lng, $notes, $userId, $open['id']]);
    } else {
        $pdo->prepare('UPDATE time_entries SET end_time = NOW(), end_lat = ?, end_lng = ?, last_edited_by = ?, last_edited_at = NOW() WHERE id = ?')
            ->execute([$lat, $lng, $userId, $open['id']]);
    }

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

    $allowed = ['work_order', 'estimate', 'regular', 'estimate_unknown', 'add_on', 'emergency', 'warranty', 'pto'];
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

    if ($category === 'pto') {
        return; // paid time off — no job, engineer, or description needed
    } elseif ($category === 'work_order') {
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

    return timeclockResultFromEntry($pdo, $entry);
}
