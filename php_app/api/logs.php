<?php
// /app/php_app/api/logs.php
require_once __DIR__ . '/../lib/auth.php';

function handle_logs(array $segs, string $method): void {
    if ($method !== 'GET') error_response('Method not allowed', 405);
    require_admin();
    $limit = max(1, min(1000, (int)($_GET['limit'] ?? 200)));
    $entity = $_GET['entity'] ?? null;
    $action = $_GET['action'] ?? null;
    $sql = 'SELECT * FROM audit_logs';
    $w = []; $p = [];
    if ($entity) { $w[] = 'entity = ?'; $p[] = $entity; }
    if ($action) { $w[] = 'action = ?'; $p[] = $action; }
    if ($w) $sql .= ' WHERE ' . implode(' AND ', $w);
    $sql .= ' ORDER BY timestamp DESC LIMIT ' . $limit;
    $stmt = db()->prepare($sql);
    $stmt->execute($p);
    json_response($stmt->fetchAll());
}
