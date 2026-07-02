<?php
function requireAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) {
        http_response_code(401);
        exit(json_encode(['error' => 'Unauthorized']));
    }
    $payload = jwt_decode(substr($auth, 7));
    if (!$payload) {
        http_response_code(401);
        exit(json_encode(['error' => 'Token expired or invalid']));
    }
    return $payload;
}

function requireAdmin(array $payload): void {
    if ($payload['role'] !== 'admin') {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

function requireContractorOrAdmin(array $payload): void {
    if (!in_array($payload['role'], ['contractor', 'admin'])) {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}
