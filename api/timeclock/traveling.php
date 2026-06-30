<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = jsonBody();
requireFields($body, ['job_id']);
$jobId = (int)$body['job_id'];
$lat   = isset($body['lat'])      ? (float)$body['lat']      : null;
$lng   = isset($body['lng'])      ? (float)$body['lng']      : null;
$acc   = isset($body['accuracy']) ? (float)$body['accuracy'] : null;

$pdo = getPDO();

// Verify assignment
$assigned = $pdo->prepare('SELECT 1 FROM job_assignments WHERE job_id = ? AND user_id = ?');
$assigned->execute([$jobId, $auth['user_id']]);
if (!$assigned->fetch()) {
    http_response_code(403);
    exit(json_encode(['error' => 'You are not assigned to this job']));
}

closeOpenEntry($pdo, $auth['user_id'], $lat, $lng);
$result = openEntry($pdo, $auth['user_id'], $jobId, 'traveling', 'travel', $lat, $lng, $acc);
echo json_encode(['timeclock' => $result]);
