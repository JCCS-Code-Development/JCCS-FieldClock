<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

ini_set('display_errors', 0);
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

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

$check = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
$check->execute([$userId]);
if (!$check->fetch()) {
    http_response_code(404);
    exit(json_encode(['error' => 'Employee not found']));
}

if (!empty($body['new_password'])) {
    $password = $body['new_password'];
    if (strlen($password) < 8) {
        http_response_code(422);
        exit(json_encode(['error' => 'Password must be at least 8 characters.']));
    }
    $hash = password_hash($password, PASSWORD_BCRYPT);
    if ($hash === false) {
        http_response_code(500);
        exit(json_encode(['error' => 'Failed to hash password.']));
    }
    $stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1');
    $stmt->execute([$hash, $userId]);
    echo json_encode(['message' => 'Password updated successfully.']);
} else {
    $stmt = $pdo->prepare('UPDATE users SET password_hash = NULL WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    echo json_encode(['message' => 'Password cleared. Employee must set a new password on next login.']);
}
