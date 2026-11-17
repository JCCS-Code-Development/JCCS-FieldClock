<?php
// Admin-only: every employee's workers' comp coverage form (full form_data,
// including the ID photo) for the insurance-agent Excel export on the HR
// Compliance page. Also lists active, non-exempt employees who haven't
// filled it out yet so the export can show who's missing.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$auth = requireAuth();
requireAdmin($auth);
$pdo = getPDO();

$rows = $pdo->query(
    "SELECT u.id AS user_id, u.name, u.email, u.phone, u.pay_type, u.is_active,
            ea.form_data, ea.signed_at
     FROM employee_agreements ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.agreement_type = 'workers_comp' AND ea.signed_at IS NOT NULL
     ORDER BY u.is_active DESC, u.name"
)->fetchAll();
foreach ($rows as &$r) {
    $r['form_data'] = $r['form_data'] ? json_decode($r['form_data'], true) : [];
    $r['is_active'] = (bool)$r['is_active'];
}
unset($r);

$missing = $pdo->query(
    "SELECT u.id AS user_id, u.name, u.email, u.phone, u.pay_type
     FROM users u
     LEFT JOIN employee_agreements ea
            ON ea.user_id = u.id AND ea.agreement_type = 'workers_comp' AND ea.signed_at IS NOT NULL
     WHERE u.is_active = 1 AND u.role != 'contractor' AND u.wc_exempt = 0 AND ea.id IS NULL
     ORDER BY u.name"
)->fetchAll();

echo json_encode(['forms' => $rows, 'missing' => $missing]);
