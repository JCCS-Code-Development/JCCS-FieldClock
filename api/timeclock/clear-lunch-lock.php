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

$auth = requireAuth();
requireAdmin($auth);
$pdo  = getPDO();
$body = jsonBody();
requireFields($body, ['user_id']);
$userId = (int)$body['user_id'];

// Take the same row lock every other timeclock mutation uses (see
// beginTimeclockTransaction) so the read-then-write below can't race a
// concurrent request on the same user — e.g. the employee's own status.php
// poll re-applying the lock between this script's read and its UPDATE,
// which would otherwise let this report success while leaving them
// re-locked, or leave lunch_locked_entry_id pointing at a stale entry id.
// Meal cutoff is skipped here (true) — we're deliberately handling any
// still-open stale entry ourselves below (closeStaleMealEntries) rather
// than letting enforceMealCutoff re-lock the very account we're clearing.
beginTimeclockTransaction($pdo, $userId, true);

$stmt = $pdo->prepare('SELECT lunch_locked_at, lunch_locked_entry_id FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();
if (!$user) { $pdo->rollBack(); http_response_code(404); exit(json_encode(['error' => 'Employee not found'])); }
if (!$user['lunch_locked_at']) { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => 'That employee is not lunch-locked'])); }

$pdo->prepare('UPDATE users SET lunch_locked_at = NULL, lunch_locked_entry_id = NULL WHERE id = ?')
    ->execute([$userId]);

// Leave a trail on the entry that triggered the lock, same as any other
// admin-visible timeclock change.
if ($user['lunch_locked_entry_id']) {
    $e = $pdo->prepare('SELECT * FROM time_entries WHERE id = ?');
    $e->execute([$user['lunch_locked_entry_id']]);
    if ($entry = $e->fetch()) {
        logTimeEntryHistory($pdo, (int)$entry['id'], 'update', (int)$auth['user_id'], 'lunch_lock_clear', $entry, $entry);
    }
}

// Guarantee they can actually clock back in — see closeStaleMealEntries.
closeStaleMealEntries($pdo, $userId);

$pdo->commit();
echo json_encode(['ok' => true]);
