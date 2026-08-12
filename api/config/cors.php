<?php
require_once __DIR__ . '/config.php';

// FieldClock's own frontend calls this API same-origin, so CORS never
// applies to it regardless of what's below — this allowlist exists for
// sibling JCCS apps (Inventory, and whatever else comes next) that call
// this API cross-origin to reuse FieldClock's login. FRONTEND_ORIGIN stays
// the fallback for anything not explicitly listed (e.g. local dev), so
// this doesn't change any existing behavior.
$allowedOrigins = [
    FRONTEND_ORIGIN,
    'https://fieldclock.jccs-services.com',
    'https://inventory.jccs-services.com',
];
$origin      = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowOrigin = in_array($origin, $allowedOrigins, true) ? $origin : FRONTEND_ORIGIN;

header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
