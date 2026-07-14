<?php
// Employee-facing: register a job location that doesn't exist in FieldClock yet.
// Creates it as pending_review so the admin can confirm client name/address/radius
// later, but the submitting employee can clock in against it immediately.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = jsonBody();
requireFields($body, ['name']);

$name = sanitizeString($body['name']);
if ($name === '') { http_response_code(422); exit(json_encode(['error' => 'Location name is required'])); }

$lat = isset($body['lat']) ? (float)$body['lat'] : null;
$lng = isset($body['lng']) ? (float)$body['lng'] : null;
$address = ($lat !== null && $lng !== null)
    ? sprintf('Pending review — GPS %.5f, %.5f', $lat, $lng)
    : 'Pending review — address not yet confirmed';

$pdo = getPDO();
$stmt = $pdo->prepare(
    'INSERT INTO jobs (name, client_name, address, latitude, longitude, clock_in_radius_meters, status, notes, registered_by)
     VALUES (?, ?, ?, ?, ?, 500, "pending_review", NULL, ?)'
);
$stmt->execute([$name, '', $address, $lat, $lng, $auth['user_id']]);

echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Location registered for review']);
