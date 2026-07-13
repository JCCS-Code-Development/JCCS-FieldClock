<?php
// Sends a push reminder to employees who have been "traveling" for 30+ minutes
// without confirming arrival. Intended to run via a real cron job (cPanel Cron
// Jobs) every 5-10 minutes, invoking `php /path/to/check-travel-reminders.php`.
//
// Defense-in-depth only: if this is ever hit over HTTP instead of CLI, a
// matching ?key= is required so the URL can't be triggered by anyone else.
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../push/push-helper.php';

$isCli = php_sapi_name() === 'cli';
if (!$isCli && (($_GET['key'] ?? '') !== CRON_SECRET)) {
    http_response_code(403);
    exit('Forbidden');
}

$pdo = getPDO();

$stmt = $pdo->query(
    "SELECT id, user_id FROM time_entries
     WHERE status_label = 'traveling'
       AND end_time IS NULL
       AND start_time <= NOW() - INTERVAL 30 MINUTE
       AND travel_reminder_sent_at IS NULL"
);
$rows = $stmt->fetchAll();

$mark = $pdo->prepare('UPDATE time_entries SET travel_reminder_sent_at = NOW() WHERE id = ?');
$sent = 0;
foreach ($rows as $row) {
    push_to_user($pdo, (int)$row['user_id'], 'travel_reminder');
    $mark->execute([$row['id']]);
    $sent++;
}

echo "Reminders sent: $sent\n";
