<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
$pdo  = getPDO();

$id = isset($_GET['id']) ? (int)$_GET['id'] : (int)(jsonBody()['id'] ?? 0);
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'id is required'])); }

// Only the employee who logged it (or an admin) may edit/delete it —
// there's no review workflow, but it should still stay theirs to manage.
$check = $pdo->prepare('SELECT user_id FROM visit_stops WHERE id = ?');
$check->execute([$id]);
$row = $check->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
if ((int)$row['user_id'] !== (int)$auth['user_id']) requireAdmin($auth);

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = jsonBody();
    $sets = []; $params = [];
    if (array_key_exists('name', $body)) {
        $name = sanitizeString($body['name']);
        if ($name === '') { http_response_code(422); exit(json_encode(['error' => 'Name is required'])); }
        $sets[] = 'name = ?'; $params[] = $name;
    }
    if (array_key_exists('note', $body)) {
        $sets[] = 'note = ?'; $params[] = ($body['note'] === '' || $body['note'] === null) ? null : sanitizeString($body['note']);
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE visit_stops SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $pdo->prepare('DELETE FROM visit_stops WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deleted']);
    exit;
}

http_response_code(405);
