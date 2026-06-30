<?php
function jsonBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function requireFields(array $body, array $fields): void {
    foreach ($fields as $field) {
        if (!isset($body[$field]) || $body[$field] === '') {
            http_response_code(422);
            exit(json_encode(['error' => "Missing required field: $field"]));
        }
    }
}

function sanitizeString(mixed $val): string {
    return htmlspecialchars(trim((string)$val), ENT_QUOTES, 'UTF-8');
}

function sendSMS(string $to, string $message): bool {
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . TWILIO_SID . '/Messages.json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['To' => $to, 'From' => TWILIO_FROM, 'Body' => $message]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD        => TWILIO_SID . ':' . TWILIO_TOKEN,
    ]);
    $result = curl_exec($ch);
    $code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code === 201;
}

function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R    = 3958.8;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return $R * 2 * asin(sqrt($a));
}

function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float {
    return haversine($lat1, $lon1, $lat2, $lon2) * 1609.34;
}
