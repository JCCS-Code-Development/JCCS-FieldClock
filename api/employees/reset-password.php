<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$body = jsonBody();
requireFields($body, ['user_id']);

$userId = (int)$body['user_id'];
if ($userId <= 0) {
    http_response_code(422);
    exit(json_encode(['error' => 'Invalid user_id']));
}

$pdo = getPDO();

// Verify employee exists
$check = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
$check->execute([$userId]);
if (!$check->fetch()) {
    http_response_code(404);
    exit(json_encode(['error' => 'Employee not found']));
}

if (!empty($body['new_password'])) {
    // Admin sets a specific password
    $password = $body['new_password'];
    if (strlen($password) < 8) {
        http_response_code(422);
        exit(json_encode(['error' => 'Password must be at least 8 characters.']));
    }
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1');
    $stmt->execute([$hash, $userId]);
    echo json_encode(['message' => 'Password updated successfully.']);
} else {
    // Clear password — employee must set a new one on next login
    $stmt = $pdo->prepare('UPDATE users SET password_hash = NULL WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    echo json_encode(['message' => 'Password cleared. Employee must set a new password on next login.']);
}
