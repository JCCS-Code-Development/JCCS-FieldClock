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
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth();
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$lat  = isset($body['lat']) ? (float)$body['lat'] : null;
$lng  = isset($body['lng']) ? (float)$body['lng'] : null;
$acc  = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$pdo  = getPDO();
requireHourly($auth, $pdo);

// Only one lunch per day — "day" meaning this shift, not the calendar date,
// since a shift can span midnight (see currentShiftStartBoundary). A CLOSED
// lunch entry this shift (ended normally, or auto-cut off at the 1-hour cap —
// see enforceMealCutoff) means they already took it; there is no self-service
// way to get another, only an admin manually adjusting their timesheet. An
// OPEN lunch entry doesn't trigger this — that's just the normal idempotent
// retry transitionOpenWorkEntry already handles below.
$shiftStart = currentShiftStartBoundary($pdo, (int)$auth['user_id']);
$already = $pdo->prepare(
    "SELECT id FROM time_entries
     WHERE user_id = ? AND status_label = 'lunch' AND end_time IS NOT NULL
       AND start_time > ?
     LIMIT 1"
);
$already->execute([(int)$auth['user_id'], $shiftStart]);
if ($already->fetch()) {
    http_response_code(409);
    exit(json_encode(['error' => "You've already taken your lunch today. Contact your administrator if you need another."]));
}

// Lunch only unlocks after LUNCH_UNLOCK_MINUTES of actual work today. Doesn't
// block the idempotent retry (tapping Start Lunch again while already on
// lunch) — worked time is frozen while on a break (see
// getWorkedMinutesToday), so anyone who already cleared the threshold to get
// here stays clear of it.
$worked = getWorkedMinutesToday($pdo, (int)$auth['user_id']);
if ($worked < LUNCH_UNLOCK_MINUTES) {
    http_response_code(403);
    exit(json_encode(['error' => 'Lunch is only available after working over 2 hours today.']));
}

echo json_encode(transitionOpenWorkEntry(
    $pdo, (int)$auth['user_id'], 'lunch', 'paid_lunch', $lat, $lng, $acc, 'lunch'
));
