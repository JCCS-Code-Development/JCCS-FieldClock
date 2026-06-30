<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
$auth = requireAuth();

$lat    = isset($_GET['lat'])    ? (float)$_GET['lat']    : null;
$lng    = isset($_GET['lng'])    ? (float)$_GET['lng']    : null;
$radius = isset($_GET['radius']) ? min((float)$_GET['radius'], 50) : 10;

if ($lat === null || $lng === null) { echo json_encode(['jobs' => []]); exit; }

$pdo = getPDO();

$latDelta = $radius / 69.0;
$lngDelta = $radius / (69.0 * cos(deg2rad($lat)));

$stmt = $pdo->prepare(
    'SELECT j.* FROM jobs j
     JOIN job_assignments ja ON ja.job_id = j.id
     WHERE ja.user_id = :uid
       AND j.status = "active"
       AND j.latitude  BETWEEN :latMin AND :latMax
       AND j.longitude BETWEEN :lngMin AND :lngMax'
);
$stmt->execute([
    ':uid'    => $auth['user_id'],
    ':latMin' => $lat - $latDelta,
    ':latMax' => $lat + $latDelta,
    ':lngMin' => $lng - $lngDelta,
    ':lngMax' => $lng + $lngDelta,
]);
$rows = $stmt->fetchAll();

$results = [];
foreach ($rows as $job) {
    if (!$job['latitude'] || !$job['longitude']) continue;
    $dist = haversine($lat, $lng, (float)$job['latitude'], (float)$job['longitude']);
    if ($dist <= $radius) {
        $job['distance_miles']  = round($dist, 2);
        $job['distance_meters'] = (int)round($dist * 1609.34);
        $results[] = $job;
    }
}
usort($results, fn($a, $b) => $a['distance_miles'] <=> $b['distance_miles']);

echo json_encode(['jobs' => $results]);
