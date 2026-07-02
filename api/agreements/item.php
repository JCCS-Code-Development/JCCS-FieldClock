<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $type = $_GET['type'] ?? '';
    // Employee may only fetch own; admin may fetch anyone via user_id param
    $uid  = $auth['role'] === 'admin' && isset($_GET['user_id'])
        ? (int)$_GET['user_id']
        : $auth['user_id'];

    $stmt = $pdo->prepare(
        'SELECT ea.*, u.name AS user_name, u.pay_type, u.pay_rate, u.pay_structure
         FROM employee_agreements ea
         JOIN users u ON u.id = ea.user_id
         WHERE ea.user_id = ? AND ea.agreement_type = ?'
    );
    $stmt->execute([$uid, $type]);
    $row = $stmt->fetch();
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
    if ($row['form_data']) $row['form_data'] = json_decode($row['form_data'], true);
    echo json_encode($row);
    exit;
}

if ($method === 'DELETE') {
    requireAdmin($auth);
    $uid  = (int)($_GET['user_id'] ?? 0);
    $type = $_GET['type'] ?? '';
    $pdo->prepare('DELETE FROM employee_agreements WHERE user_id = ? AND agreement_type = ?')->execute([$uid, $type]);
    echo json_encode(['message' => 'Agreement reset — employee may re-sign.']);
    exit;
}

http_response_code(405);
