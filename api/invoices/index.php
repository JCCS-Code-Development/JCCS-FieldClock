<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth(); requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT i.*, j.name as job_name, wo.title as wo_title FROM invoices i JOIN jobs j ON j.id = i.job_id LEFT JOIN work_orders wo ON wo.id = i.work_order_id WHERE 1=1';
    if (isset($_GET['status'])) { $sql .= ' AND i.status = :st'; $params[':st'] = $_GET['status']; }
    if (isset($_GET['job_id'])) { $sql .= ' AND i.job_id = :jid'; $params[':jid'] = (int)$_GET['job_id']; }
    $sql .= ' ORDER BY i.created_at DESC';
    $stmt = $pdo->prepare($sql); $stmt->execute($params);
    echo json_encode(['invoices' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['job_id', 'amount', 'due_date']);

    // Auto-number INV-YYYY-NNNN
    $year = date('Y');
    $last = $pdo->query("SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) as n FROM invoices WHERE invoice_number LIKE 'INV-$year-%'")->fetch();
    $seq  = str_pad(($last['n'] ?? 0) + 1, 4, '0', STR_PAD_LEFT);
    $num  = "INV-$year-$seq";

    $pdo->prepare(
        'INSERT INTO invoices (job_id, work_order_id, invoice_number, amount, due_date, status, notes) VALUES (?,?,?,?,?,?,?)'
    )->execute([
        (int)$body['job_id'],
        $body['work_order_id'] ? (int)$body['work_order_id'] : null,
        $num,
        (float)$body['amount'],
        $body['due_date'],
        sanitizeString($body['status'] ?? 'draft'),
        sanitizeString($body['notes'] ?? ''),
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'invoice_number' => $num, 'message' => 'Created']);
} else {
    http_response_code(405);
}
