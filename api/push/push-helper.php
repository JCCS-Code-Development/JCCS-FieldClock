<?php
/**
 * VAPID-signed Web Push sender.
 * Sends a push with an empty payload (no AES-GCM encryption required).
 * The service worker shows a hardcoded "check ready" notification.
 *
 * Requires config.php to define:
 *   VAPID_PUBLIC_KEY  – base64url-encoded uncompressed P-256 point (65 bytes)
 *   VAPID_PRIVATE_KEY_PEM – EC private key in PEM format
 *   VAPID_SUBJECT     – mailto: or https: URI identifying the sender
 */

function push_base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function push_der_to_raw_ecdsa(string $der): string {
    $pos = 2;
    // Handle multi-byte length in outer sequence
    if (ord($der[1]) & 0x80) $pos += (ord($der[1]) & 0x7F);
    // R integer
    $pos++; // skip 0x02
    $r_len = ord($der[$pos++]);
    $r = substr($der, $pos, $r_len); $pos += $r_len;
    // S integer
    $pos++; // skip 0x02
    $s_len = ord($der[$pos++]);
    $s = substr($der, $pos, $s_len);
    // Normalise to exactly 32 bytes
    $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
    $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);
    return $r . $s;
}

function push_vapid_jwt(string $endpoint): string {
    $parts   = parse_url($endpoint);
    $audience = $parts['scheme'] . '://' . $parts['host'];

    $header  = push_base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $payload = push_base64url_encode(json_encode([
        'aud' => $audience,
        'sub' => VAPID_SUBJECT,
        'exp' => time() + 43200,
    ]));

    $signing_input = "$header.$payload";
    openssl_sign($signing_input, $der_sig, VAPID_PRIVATE_KEY_PEM, OPENSSL_ALGO_SHA256);
    $raw_sig = push_der_to_raw_ecdsa($der_sig);

    return "$signing_input." . push_base64url_encode($raw_sig);
}

/**
 * Send push notification to one subscription row.
 * Returns true on success (HTTP 201/200), false otherwise.
 * $type is sent as a JSON payload for browsers that support it;
 * push services that reject non-encrypted payloads will fall back gracefully.
 */
function send_push(array $sub, string $type = 'check_ready', string $lang = 'en'): bool {
    if (!defined('VAPID_PUBLIC_KEY') || !defined('VAPID_PRIVATE_KEY_PEM')) return false;

    $jwt     = push_vapid_jwt($sub['endpoint']);
    $payload = json_encode(['type' => $type, 'lang' => $lang]);

    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC_KEY,
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload),
            'TTL: 86400',
            'Urgency: normal',
        ],
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Some push services require encrypted payloads and return 400/413 for raw JSON.
    // On failure retry with empty payload so the notification still fires.
    if ($code !== 201 && $code !== 200) {
        $ch2 = curl_init($sub['endpoint']);
        curl_setopt_array($ch2, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC_KEY,
                'Content-Type: application/octet-stream',
                'Content-Length: 0',
                'TTL: 86400',
                'Urgency: normal',
            ],
        ]);
        curl_exec($ch2);
        $code = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
        curl_close($ch2);
    }

    return $code === 201 || $code === 200;
}

/**
 * Send push to all subscriptions for a given user_id.
 * $type: 'check_ready' (contractor invoice) | 'paycheck' (employee paycheck)
 */
function push_to_user(PDO $pdo, int $user_id, string $type = 'check_ready'): void {
    $langStmt = $pdo->prepare('SELECT preferred_language FROM users WHERE id = ?');
    $langStmt->execute([$user_id]);
    $lang = $langStmt->fetch()['preferred_language'] ?? 'en';

    $stmt = $pdo->prepare('SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$user_id]);
    foreach ($stmt->fetchAll() as $sub) send_push($sub, $type, $lang);
}

/**
 * Send push to all subscriptions for a given user_id with paycheck type.
 */
function push_paycheck_to_user(PDO $pdo, int $user_id): void {
    push_to_user($pdo, $user_id, 'paycheck');
}
