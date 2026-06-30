<?php
function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_encode(array $payload, int $expiry = JWT_EXPIRY): string {
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + $expiry;
    $body = base64url_encode(json_encode($payload));
    $sig  = base64url_encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    return "$header.$body.$sig";
}

function jwt_decode(string $token): array|false {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$h, $b, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$b", JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return false;
    $payload = json_decode(base64url_decode($b), true);
    if (!$payload || $payload['exp'] < time()) return false;
    return $payload;
}
