<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$auth = requireAuth(); requireAdmin($auth);
$body = jsonBody(); requireFields($body, ['job_id']);

$jobId   = (int)$body['job_id'];
$userIds = array_map('intval', (array)($body['user_ids'] ?? []));
$pdo     = getPDO();

// Contractors invoice per job and never clock in, so they're never assigned
// to a location — the admin UI already excludes them from this list, but
// don't trust that alone; drop any contractor id that slips through.
if ($userIds) {
    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $roleCheck = $pdo->prepare("SELECT id FROM users WHERE id IN ($placeholders) AND role != 'contractor'");
    $roleCheck->execute($userIds);
    $userIds = array_map(fn($r) => (int)$r['id'], $roleCheck->fetchAll());
}

$pdo->prepare('DELETE FROM job_assignments WHERE job_id = ?')->execute([$jobId]);
$stmt = $pdo->prepare('INSERT IGNORE INTO job_assignments (job_id, user_id) VALUES (?, ?)');
foreach ($userIds as $uid) { $stmt->execute([$jobId, $uid]); }
echo json_encode(['message' => 'Assignments updated']);
