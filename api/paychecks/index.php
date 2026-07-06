<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

// ── GET: list paychecks ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($auth['role'] === 'admin') {
        // Admin: all employees, optionally filtered
        $uid = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
        $sql = 'SELECT p.*, u.name AS employee_name, u.pay_type
                FROM paychecks p JOIN users u ON u.id = p.user_id
                WHERE u.role = "employee"';
        $params = [];
        if ($uid) { $sql .= ' AND p.user_id = ?'; $params[] = $uid; }
        $sql .= ' ORDER BY p.period_end DESC, u.name ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } else {
        // Employee: own paychecks only
        $stmt = $pdo->prepare(
            'SELECT p.*, u.name AS employee_name, u.pay_type
             FROM paychecks p JOIN users u ON u.id = p.user_id
             WHERE p.user_id = ? ORDER BY p.period_end DESC'
        );
        $stmt->execute([$auth['user_id']]);
    }
    echo json_encode(['paychecks' => $stmt->fetchAll()]);
    exit;
}

// ── POST: create paycheck (admin only) ──────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['user_id', 'period_start', 'period_end']);

    $userId      = (int)$body['user_id'];
    $periodStart = sanitizeString($body['period_start']);
    $periodEnd   = sanitizeString($body['period_end']);
    $amount      = isset($body['amount']) && $body['amount'] !== '' ? (float)$body['amount'] : null;
    $notes       = !empty($body['notes']) ? sanitizeString($body['notes']) : null;

    $pdo->prepare(
        'INSERT INTO paychecks (user_id, period_start, period_end, amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$userId, $periodStart, $periodEnd, $amount, $notes, $auth['user_id']]);

    $id = $pdo->lastInsertId();
    $row = $pdo->prepare(
        'SELECT p.*, u.name AS employee_name, u.pay_type FROM paychecks p JOIN users u ON u.id=p.user_id WHERE p.id=?'
    );
    $row->execute([$id]);
    echo json_encode(['paycheck' => $row->fetch()]);
    exit;
}

http_response_code(405); exit;
