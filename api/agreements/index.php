<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Admin may query any user; employee sees only own
    $uid = $auth['role'] === 'admin' && isset($_GET['user_id'])
        ? (int)$_GET['user_id']
        : $auth['user_id'];

    if ($auth['role'] === 'admin' && !isset($_GET['user_id'])) {
        // Return all employees with their agreement statuses for HR overview
        $users = $pdo->query(
            "SELECT u.id, u.name, u.pay_type, u.pay_structure,
                    ea.agreement_type, ea.signed_at
             FROM users u
             LEFT JOIN employee_agreements ea ON ea.user_id = u.id
             WHERE u.is_active = 1 AND u.role != 'contractor'
             ORDER BY u.name, ea.agreement_type"
        )->fetchAll();

        $byUser = [];
        foreach ($users as $row) {
            $uid = $row['id'];
            if (!isset($byUser[$uid])) {
                $byUser[$uid] = ['user_id' => $uid, 'name' => $row['name'], 'pay_type' => $row['pay_type'], 'agreements' => []];
            }
            if ($row['agreement_type']) {
                $byUser[$uid]['agreements'][$row['agreement_type']] = $row['signed_at'] ?? null;
            }
        }
        echo json_encode(['employees' => array_values($byUser)]);
    } else {
        $stmt = $pdo->prepare(
            "SELECT id, user_id, agreement_type, signed_at, created_at
             FROM employee_agreements WHERE user_id = ? ORDER BY created_at"
        );
        $stmt->execute([$uid]);
        echo json_encode(['agreements' => $stmt->fetchAll()]);
    }
    exit;
}

http_response_code(405);
