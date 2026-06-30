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

$pdo->prepare('DELETE FROM job_assignments WHERE job_id = ?')->execute([$jobId]);
$stmt = $pdo->prepare('INSERT IGNORE INTO job_assignments (job_id, user_id) VALUES (?, ?)');
foreach ($userIds as $uid) { $stmt->execute([$jobId, $uid]); }
echo json_encode(['message' => 'Assignments updated']);
