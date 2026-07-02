<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$auth = requireAuth();
$body = jsonBody();
$pdo  = getPDO();

requireFields($body, ['agreement_type', 'signature_data']);

$VALID_TYPES = ['non_solicitation','conflict_of_interest','at_will','emergency_contact','i9','w4'];
$type = sanitizeString($body['agreement_type']);
if (!in_array($type, $VALID_TYPES)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid agreement type.']);
    exit;
}

if (empty($body['signature_data']) || strlen($body['signature_data']) < 100) {
    http_response_code(422);
    echo json_encode(['error' => 'Signature is required.']);
    exit;
}

// Check if already signed — once signed, cannot be overwritten
$check = $pdo->prepare('SELECT signed_at FROM employee_agreements WHERE user_id = ? AND agreement_type = ?');
$check->execute([$auth['user_id'], $type]);
$existing = $check->fetch();
if ($existing && $existing['signed_at']) {
    http_response_code(409);
    echo json_encode(['error' => 'This document has already been signed and cannot be modified.']);
    exit;
}

$formData = isset($body['form_data']) ? json_encode($body['form_data']) : null;
$ip       = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;

// UPSERT: insert or update (only if not yet signed)
$stmt = $pdo->prepare(
    'INSERT INTO employee_agreements (user_id, agreement_type, form_data, signature_data, signed_at, ip_address)
     VALUES (?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       form_data      = VALUES(form_data),
       signature_data = VALUES(signature_data),
       signed_at      = NOW(),
       ip_address     = VALUES(ip_address)'
);
$stmt->execute([$auth['user_id'], $type, $formData, $body['signature_data'], $ip]);

echo json_encode(['message' => 'Signed successfully.', 'signed_at' => date('c')]);
