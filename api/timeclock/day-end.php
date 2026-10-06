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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth  = requireAuth();
$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$lat   = isset($body['lat']) ? (float)$body['lat'] : null;
$lng   = isset($body['lng']) ? (float)$body['lng'] : null;
$acc   = isset($body['accuracy']) ? (float)$body['accuracy'] : null;
$notes = !empty($body['notes']) ? sanitizeString($body['notes']) : null;
$pdo   = getPDO();
requireHourly($auth, $pdo);

try {
    // Ending the day is itself an explicit, proactive action — same
    // reasoning as returning to work in transitionOpenWorkEntry: skip the
    // generic meal-cutoff auto-lock so someone who's actively clocking out
    // (even on an over-cap lunch/dinner) gets a normal clock-out instead of
    // a lock that would otherwise also block their next day's clock-in
    // until an admin clears it. The cap itself is still enforced below.
    beginTimeclockTransaction($pdo, (int)$auth['user_id'], true);
    $open = getOpenWorkEntry($pdo, (int)$auth['user_id']);
    if (!$open) {
        $marker = getTodayDayEndMarker($pdo, (int)$auth['user_id']);
        if ($marker) {
            $result = timeclockResultFromEntry($pdo, $marker);
            $pdo->commit();
            echo json_encode($result);
            exit;
        }
        $pdo->rollBack();
        http_response_code(422);
        exit(json_encode(['error' => 'Not clocked in']));
    }

    // Cap a lunch/dinner being ended late at the 1-hour mark, same as
    // transitionOpenWorkEntry does — payroll still never pays past the cap,
    // it just doesn't lock the account for this explicit action.
    $endOverride = null;
    if (in_array($open['status_label'], ['lunch', 'dinner'], true)) {
        $cap = strtotime($open['start_time']) + LUNCH_CAP_MINUTES * 60;
        if (time() > $cap) {
            $endOverride = date('Y-m-d H:i:s', $cap);
        }
    }

    closeOpenEntry($pdo, $auth['user_id'], $lat, $lng, source: 'day_end', notes: $notes, endTimeOverride: $endOverride);
    $result = openEntry($pdo, $auth['user_id'], null, 'done', 'day_end', $lat, $lng, $acc, source: 'day_end');
    $pdo->commit();
    echo json_encode($result);
} catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    exit(json_encode(['error' => 'Clock-out failed. You are still clocked in.']));
}
