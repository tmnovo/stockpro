<?php
// /app/php_app/api/clients.php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/import_export.php';

function handle_clients(array $segs, string $method): void {
    $id = $segs[1] ?? null;
    if ($id === 'import' && $method === 'POST') { clients_import(); return; }
    if ($id === 'export' && $method === 'GET') { clients_export(); return; }
    if ($id === null && $method === 'GET') { clients_list(); return; }
    if ($id === null && $method === 'POST') { clients_create(); return; }
    if ($id && $method === 'PUT') { clients_update($id); return; }
    if ($id && $method === 'DELETE') { clients_delete($id); return; }
    error_response('Not found', 404);
}

function clients_list(): void {
    require_permission('clients', 'view');
    $rows = db()->query('SELECT * FROM clients ORDER BY name')->fetchAll();
    foreach ($rows as &$r) { $r['discount'] = (float)$r['discount']; }
    json_response($rows);
}

function client_payload(array $d): array {
    return [
        'name' => sanitize_str($d['name'] ?? '', 200),
        'email' => sanitize_str($d['email'] ?? null, 200),
        'phone' => sanitize_str($d['phone'] ?? null, 50),
        'address' => sanitize_str($d['address'] ?? null, 500),
        'tax_id' => sanitize_str($d['tax_id'] ?? null, 50),
        'postal_code' => sanitize_str($d['postal_code'] ?? null, 20),
        'city' => sanitize_str($d['city'] ?? null, 100),
        'country' => sanitize_str($d['country'] ?? null, 100),
        'notes' => sanitize_str($d['notes'] ?? null, 10000),
        'discount' => max(0, min(100, sanitize_float($d['discount'] ?? 0))),
    ];
}

function clients_create(): void {
    $u = require_permission('clients', 'create');
    $d = client_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $id = uuid();
    $stmt = db()->prepare('INSERT INTO clients (id,name,email,phone,address,tax_id,postal_code,city,country,notes,discount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = now_utc();
    $stmt->execute([$id, $d['name'], $d['email'], $d['phone'], $d['address'], $d['tax_id'], $d['postal_code'], $d['city'], $d['country'], $d['notes'], $d['discount'], $n, $n]);
    log_action($u, 'create', 'client', $id, "Created client {$d['name']}");
    $row = db()->prepare('SELECT * FROM clients WHERE id = ?');
    $row->execute([$id]);
    json_response($row->fetch());
}

function clients_update(string $id): void {
    $u = require_permission('clients', 'update');
    $stmt = db()->prepare('SELECT * FROM clients WHERE id = ?');
    $stmt->execute([$id]);
    $exist = $stmt->fetch();
    if (!$exist) error_response('Client not found', 404);
    $d = client_payload(read_json_body());
    if (!$d['name']) error_response('Name is required', 400);
    $upd = db()->prepare('UPDATE clients SET name=?,email=?,phone=?,address=?,tax_id=?,postal_code=?,city=?,country=?,notes=?,discount=? WHERE id=?');
    $upd->execute([$d['name'],$d['email'],$d['phone'],$d['address'],$d['tax_id'],$d['postal_code'],$d['city'],$d['country'],$d['notes'],$d['discount'],$id]);
    log_action($u, 'update', 'client', $id, "Updated client {$exist['name']}");
    $row = db()->prepare('SELECT * FROM clients WHERE id = ?');
    $row->execute([$id]);
    json_response($row->fetch());
}

function clients_delete(string $id): void {
    $u = require_permission('clients', 'delete');
    $stmt = db()->prepare('SELECT name FROM clients WHERE id = ?');
    $stmt->execute([$id]);
    $name = $stmt->fetchColumn();
    if (!$name) error_response('Client not found', 404);
    try {
        $del = db()->prepare('DELETE FROM clients WHERE id = ?');
        $del->execute([$id]);
    } catch (PDOException $e) {
        error_response('Cannot delete: client has orders', 400);
    }
    log_action($u, 'delete', 'client', $id, "Deleted client {$name}");
    json_response(['ok' => true]);
}

function clients_import(): void {
    $u = require_permission('clients', 'import');
    if (empty($_FILES['file'])) error_response('No file uploaded', 400);
    $rows = parse_excel_or_csv($_FILES['file']['tmp_name'], $_FILES['file']['name']);
    $inserted = 0; $skipped = 0;
    $stmt = db()->prepare('INSERT INTO clients (id,name,email,phone,address,tax_id,postal_code,city,country,notes,discount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = now_utc();
    foreach ($rows as $r) {
        $name = trim((string)($r['name'] ?? $r['nome'] ?? ''));
        if (!$name) { $skipped++; continue; }
        $stmt->execute([
            uuid(), mb_substr($name, 0, 200),
            sanitize_str($r['email'] ?? null, 200),
            sanitize_str($r['phone'] ?? $r['telefone'] ?? $r['telemovel'] ?? $r['telemóvel'] ?? null, 50),
            sanitize_str($r['address'] ?? $r['morada'] ?? $r['endereco'] ?? null, 500),
            sanitize_str($r['tax_id'] ?? $r['nif'] ?? null, 50),
            sanitize_str($r['postal_code'] ?? $r['codigo_postal'] ?? $r['código_postal'] ?? null, 20),
            sanitize_str($r['city'] ?? $r['localidade'] ?? $r['cidade'] ?? null, 100),
            sanitize_str($r['country'] ?? $r['pais'] ?? $r['país'] ?? $r['país/região'] ?? null, 100),
            sanitize_str($r['notes'] ?? $r['notas'] ?? null, 10000),
            sanitize_float($r['discount'] ?? $r['desconto'] ?? 0),
            $n, $n,
        ]);
        $inserted++;
    }
    log_action($u, 'import', 'client', null, "Imported {$inserted} clients (skipped {$skipped})");
    json_response(['inserted' => $inserted, 'skipped' => $skipped]);
}

function clients_export(): void {
    require_permission('clients', 'export');
    $rows = db()->query('SELECT id,name,email,phone,address,tax_id,postal_code,city,country,notes,discount FROM clients ORDER BY name')->fetchAll();
    export_xlsx('clients.xlsx', 'Clients', $rows);
}
