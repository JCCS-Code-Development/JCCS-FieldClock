<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $status   = isset($_GET['status']) ? sanitizeString($_GET['status']) : null;
    $assigned = isset($_GET['assigned']) && $_GET['assigned'] === 'true';

    $sql    = 'SELECT j.*, GROUP_CONCAT(ja.user_id) as assigned_user_ids, MAX(ru.name) as registered_by_name FROM jobs j';
    $params = [];

    if ($assigned) {
        $sql .= ' JOIN job_assignments ja2 ON ja2.job_id = j.id AND ja2.user_id = :uid';
        $params[':uid'] = $auth['user_id'];
    }
    $sql .= ' LEFT JOIN job_assignments ja ON ja.job_id = j.id';
    $sql .= ' LEFT JOIN users ru ON ru.id = j.registered_by';
    $sql .= ' WHERE 1=1';
    if ($status) { $sql .= ' AND j.status = :status'; $params[':status'] = $status; }
    $sql .= ' GROUP BY j.id ORDER BY j.name';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $jobs = $stmt->fetchAll();

    foreach ($jobs as &$job) {
        $job['assigned_user_ids'] = $job['assigned_user_ids']
            ? array_map('intval', explode(',', $job['assigned_user_ids']))
            : [];
    }
    echo json_encode(['jobs' => $jobs]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name', 'client_name', 'address']);

    $stmt = $pdo->prepare('INSERT INTO jobs (name, client_name, company, address, latitude, longitude, clock_in_radius_meters, status, notes) VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        sanitizeString($body['name']),
        sanitizeString($body['client_name']),
        !empty($body['company']) ? sanitizeString($body['company']) : null,
        sanitizeString($body['address']),
        $body['latitude']  ?? null,
        $body['longitude'] ?? null,
        (int)($body['clock_in_radius_meters'] ?? 300),
        sanitizeString($body['status'] ?? 'active'),
        sanitizeString($body['notes']  ?? ''),
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Job created']);
} else {
    http_response_code(405);
}
