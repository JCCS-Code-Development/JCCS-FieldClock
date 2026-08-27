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
// Distance is in MILES. "Nearby" means actually at the site, not the same
// metro area — default half a mile, hard cap of 2. (An earlier version
// accepted up to 50, which returned effectively every job.)
$radius = isset($_GET['radius']) ? min(max((float)$_GET['radius'], 0.1), 2.0) : 0.5;

if ($lat === null || $lng === null) { echo json_encode(['jobs' => []]); exit; }

$pdo = getPDO();

$latDelta = $radius / 69.0;
$lngDelta = $radius / (69.0 * cos(deg2rad($lat)));

// Every active job near the phone, not just the ones this person is assigned
// to — anyone standing at a site can clock into it. `assigned` is kept only so
// the UI can label / group ("Your site" vs "Nearby"); it is not a filter.
$stmt = $pdo->prepare(
    'SELECT j.*,
            EXISTS(SELECT 1 FROM job_assignments ja
                   WHERE ja.job_id = j.id AND ja.user_id = :uid) AS assigned
     FROM jobs j
     WHERE j.status = "active"
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
        $job['assigned']        = (bool)$job['assigned'];
        $job['distance_miles']  = round($dist, 2);
        $job['distance_meters'] = (int)round($dist * 1609.34);
        $results[] = $job;
    }
}
usort($results, fn($a, $b) => $a['distance_miles'] <=> $b['distance_miles']);

echo json_encode(['jobs' => $results]);
