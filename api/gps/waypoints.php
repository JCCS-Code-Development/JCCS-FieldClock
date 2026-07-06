<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── Haversine distance in miles ─���───────────────────────────────────────────
function haversine_miles(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $R    = 3958.8; // Earth radius miles
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a    = sin($dLat/2)**2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng/2)**2;
    return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
}

// ── POST: receive batch of waypoints, return updated daily total ─��───────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body      = jsonBody();
    $waypoints = $body['waypoints'] ?? [];
    $date      = sanitizeString($body['date'] ?? date('Y-m-d'));

    if (empty($waypoints) || !is_array($waypoints)) {
        http_response_code(422);
        exit(json_encode(['error' => 'waypoints array required']));
    }

    $insert = $pdo->prepare(
        'INSERT IGNORE INTO gps_waypoints (user_id, lat, lng, accuracy, recorded_at) VALUES (?,?,?,?,?)'
    );
    foreach ($waypoints as $wp) {
        $lat  = isset($wp['lat'])  ? (float)$wp['lat']  : null;
        $lng  = isset($wp['lng'])  ? (float)$wp['lng']  : null;
        $acc  = isset($wp['accuracy']) ? (float)$wp['accuracy'] : null;
        $ts   = isset($wp['recorded_at']) ? sanitizeString($wp['recorded_at']) : null;
        if ($lat === null || $lng === null || $ts === null) continue;
        $insert->execute([$auth['user_id'], $lat, $lng, $acc, $ts]);
    }

    $dailyMiles = calcDailyMiles($pdo, $auth['user_id'], $date);
    echo json_encode(['daily_miles' => round($dailyMiles, 2), 'date' => $date]);
    exit;
}

// ── GET: daily mileage summary ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $date   = sanitizeString($_GET['date'] ?? date('Y-m-d'));
    $userId = $auth['user_id'];

    // Admin can query any employee
    if ($auth['role'] === 'admin' && isset($_GET['user_id'])) {
        $userId = (int)$_GET['user_id'];
    }

    $dailyMiles = calcDailyMiles($pdo, $userId, $date);
    echo json_encode(['daily_miles' => round($dailyMiles, 2), 'date' => $date, 'user_id' => $userId]);
    exit;
}

// ── Helper: sum Haversine over all waypoints for a day ───────���───────────────
function calcDailyMiles(PDO $pdo, int $userId, string $date): float {
    $stmt = $pdo->prepare(
        'SELECT lat, lng FROM gps_waypoints
         WHERE user_id = ? AND DATE(recorded_at) = ?
         ORDER BY recorded_at ASC'
    );
    $stmt->execute([$userId, $date]);
    $points = $stmt->fetchAll();

    $total = 0.0;
    for ($i = 1; $i < count($points); $i++) {
        $total += haversine_miles(
            (float)$points[$i-1]['lat'], (float)$points[$i-1]['lng'],
            (float)$points[$i]['lat'],   (float)$points[$i]['lng']
        );
    }
    return $total;
}

http_response_code(405); exit;
