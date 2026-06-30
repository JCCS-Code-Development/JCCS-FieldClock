<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/mail.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body       = jsonBody();
$identifier = isset($body['identifier']) ? trim($body['identifier']) : '';
if (!$identifier) {
    http_response_code(422);
    exit(json_encode(['error' => 'Email or phone number is required']));
}

$pdo = getPDO();

// Look up user by email OR phone
$stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1');
$stmt->execute([$identifier, $identifier]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    exit(json_encode(['error' => 'No account found with that email or phone number']));
}
if (!$user['email']) {
    http_response_code(422);
    exit(json_encode(['error' => 'This account has no email on file. Contact your admin.']));
}

// Rate limit: max OTP_MAX_ATTEMPTS per 15 minutes
$recent = $pdo->prepare(
    "SELECT COUNT(*) as cnt FROM otp_codes WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)"
);
$recent->execute([$user['id']]);
if ($recent->fetch()['cnt'] >= OTP_MAX_ATTEMPTS) {
    http_response_code(429);
    exit(json_encode(['error' => 'Too many requests. Please wait 15 minutes.']));
}

// Generate 6-digit OTP
$code    = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$expires = date('Y-m-d H:i:s', time() + OTP_EXPIRY_MINUTES * 60);
$pdo->prepare('INSERT INTO otp_codes (user_id, code, expires_at) VALUES (?, ?, ?)')->execute([$user['id'], $code, $expires]);

$subject = 'Your JCCS FieldClock login code';
$message = "Hi {$user['name']},\n\nYour login code is:\n\n    $code\n\nThis code expires in " . OTP_EXPIRY_MINUTES . " minutes.\n\nIf you did not request this, ignore this email.\n\n\xe2\x80\x94 JCCS FieldClock";

if (!sendEmail($user['email'], $user['name'], $subject, $message)) {
    http_response_code(500);
    exit(json_encode(['error' => 'Failed to send email. Contact your administrator.']));
}

// Partially mask the email for display ("Sent to j***@jccs-services.com")
[$localPart, $domain] = explode('@', $user['email'], 2);
$masked = substr($localPart, 0, 1) . str_repeat('*', max(1, strlen($localPart) - 1)) . '@' . $domain;

echo json_encode(['message' => 'Code sent', 'email_hint' => $masked]);
