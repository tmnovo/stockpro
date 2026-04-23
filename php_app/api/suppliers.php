<?php
// /app/php_app/api/suppliers.php
require_once __DIR__ . '/../lib/auth.php';

function handle_suppliers(array $segs, string $method): void {
    $id = $segs[1] ?? null;
    if ($id === null && $method === 'GET') { suppliers_list(); return; }
    if ($id === null && $method === 'POST') { suppliers_create(); return; }
    if ($id && $method === 'PUT') { suppliers_update($id); return; }
    if ($id && $method === 'DELETE') { suppliers_delete($id); return; }
    error_response('Not found', 404);
}

function suppliers_list(): void {
    require_permission('suppliers', 'view');
    $rows = db()->query("SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS product_count FROM suppliers s ORDER BY s.name")->fetchAll();
    foreach ($rows as &$r) { $r['product_count'] = (int)$r['product_count']; }
    json_response($rows);
}

function supp_payload(array $d): array {
    return [
        'name' => sanitize_str($d['name'] ?? '', 200),
        'email' => sanitize_str($d['email'] ?? null, 200),
        'phone' => sanitize_str($d['phone'] ?? null, 50),
        'tax_id' => sanitize_str($d['tax_id'] ?? null, 50),
        'address' => sanitize_str($d['address'] ?? null, 500),
        'notes' => sanitize_str($d['notes'] ?? null, 10000),
    ];
}

function suppliers_create(): void {
    $u = require_permission('suppliers', 'create');
    $d = supp_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $id = uuid();
    $stmt = db()->prepare('INSERT INTO suppliers (id,name,email,phone,tax_id,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    $n = now_utc();
    $stmt->execute([$id, $d['name'], $d['email'], $d['phone'], $d['tax_id'], $d['address'], $d['notes'], $n, $n]);
    log_action($u, 'create', 'supplier', $id, "Created supplier {$d['name']}");
    $row = db()->prepare('SELECT * FROM suppliers WHERE id = ?');
    $row->execute([$id]);
    json_response(array_merge($row->fetch(), ['product_count' => 0]));
}

function suppliers_update(string $id): void {
    $u = require_permission('suppliers', 'update');
    $stmt = db()->prepare('SELECT * FROM suppliers WHERE id = ?');
    $stmt->execute([$id]);
    $exist = $stmt->fetch();
    if (!$exist) error_response('Supplier not found', 404);
    $d = supp_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $upd = db()->prepare('UPDATE suppliers SET name=?,email=?,phone=?,tax_id=?,address=?,notes=? WHERE id=?');
    $upd->execute([$d['name'],$d['email'],$d['phone'],$d['tax_id'],$d['address'],$d['notes'],$id]);
    log_action($u, 'update', 'supplier', $id, "Updated supplier {$exist['name']}");
    $row = db()->prepare('SELECT * FROM suppliers WHERE id = ?');
    $row->execute([$id]);
    json_response($row->fetch());
}

function suppliers_delete(string $id): void {
    $u = require_permission('suppliers', 'delete');
    $stmt = db()->prepare('SELECT name FROM suppliers WHERE id = ?');
    $stmt->execute([$id]);
    $name = $stmt->fetchColumn();
    if (!$name) error_response('Supplier not found', 404);
    $del = db()->prepare('DELETE FROM suppliers WHERE id = ?');
    $del->execute([$id]);
    log_action($u, 'delete', 'supplier', $id, "Deleted supplier {$name}");
    json_response(['ok' => true]);
}
